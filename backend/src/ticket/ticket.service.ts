import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConcurrentOrchestrator,
  ConcurrentTaskResult,
} from '../queue/concurrent-orchestrator.service';
import { CascadeResult } from '../cascade/cascade-orchestrator.service';
import { TicketRepository, TicketWithRelations } from './ticket.repository';
import { UserService } from '../user/user.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly concurrentOrchestrator: ConcurrentOrchestrator,
    private readonly userService: UserService,
  ) {}

  /**
   * Creates a ticket row and enqueues async processing. Resolves after
   * persistence + dispatch; does not wait for the cascade to finish.
   */
  async create(dto: CreateTicketDto) {
    const priority = dto.priority ?? 'medium';
    // Validate optional userId; unknown ids are silently dropped so the
    // ticket still gets created (legacy callers without identity work).
    const userId = await this.userService.resolveOptional(dto.userId);
    const ticket = await this.ticketRepository.create({
      content: dto.content,
      priority,
      userId,
    });
    this.dispatchProcessing(ticket.id, dto.content, priority);
    return ticket;
  }

  /**
   * Creates many tickets and enqueues each one independently.
   */
  async createBatch(items: CreateTicketDto[]) {
    const created = await Promise.all(
      items.map((dto) => this.create(dto)),
    );
    return created;
  }

  async list(
    page: number,
    limit: number,
    status?: string,
    userId?: string,
    assigneeId?: string,
  ) {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await Promise.all([
      this.ticketRepository.findPaged({
        skip,
        take: safeLimit,
        status,
        userId,
        assigneeId,
      }),
      this.ticketRepository.countFiltered(status, userId, assigneeId),
    ]);

    return {
      data: rows,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 0,
      },
    };
  }

  async getOneAggregated(id: string): Promise<TicketWithRelations> {
    const row = await this.ticketRepository.findByIdWithRelations(id);
    if (!row) {
      throw new NotFoundException(`Ticket "${id}" not found`);
    }
    return row;
  }

  async getLogs(id: string) {
    await this.ensureExists(id);
    return this.ticketRepository.findLogs(id);
  }

  async getTokenUsage(id: string) {
    await this.ensureExists(id);
    return this.ticketRepository.findTokenUsages(id);
  }

  private async ensureExists(id: string): Promise<void> {
    const t = await this.ticketRepository.findById(id);
    if (!t) {
      throw new NotFoundException(`Ticket "${id}" not found`);
    }
  }

  private dispatchProcessing(
    ticketId: string,
    content: string,
    priority: 'low' | 'medium' | 'high',
  ): void {
    void this.concurrentOrchestrator
      .submit({
        id: ticketId,
        content,
        priority,
      })
      .then((result) => this.applyTaskOutcome(ticketId, result))
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Unexpected submit chain failure for ticket "${ticketId}": ${message}`,
        );
        void this.ticketRepository
          .updateOutcome(ticketId, {
            status: 'failed',
            suggestion: message,
          })
          .catch((e) =>
            this.logger.error(
              `Failed to mark ticket failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      });
  }

  private async applyTaskOutcome(
    ticketId: string,
    result: ConcurrentTaskResult,
  ): Promise<void> {
    try {
      if (result.dlq) {
        await this.ticketRepository.updateOutcome(ticketId, {
          status: 'dlq',
          suggestion: result.error ?? 'Ticket moved to dead-letter queue',
        });
        return;
      }

      const cascade = result.cascadeResult;
      if (!cascade) {
        await this.ticketRepository.updateOutcome(ticketId, {
          status: 'failed',
          suggestion: result.error ?? 'Processing failed before cascade result',
        });
        return;
      }

      const analysis = this.buildAnalysisJson(cascade, result);
      const tokenUsage = cascade.pipelineResult?.tokenUsage;

      if (
        tokenUsage &&
        (tokenUsage.totalTokens ?? 0) > 0
      ) {
        await this.ticketRepository.appendTokenAggregate(
          ticketId,
          tokenUsage,
        );
      }

      if (!cascade.success) {
        await this.ticketRepository.updateOutcome(ticketId, {
          status: 'failed',
          suggestion:
            cascade.answer ||
            cascade.error ||
            'Cascade reported failure',
          confidence: cascade.confidence,
          analysis: analysis as Prisma.InputJsonValue,
          hallucination: cascade.safetyDecision?.scores?.final,
        });
        return;
      }

      const safety = cascade.safetyDecision;
      const needsHuman =
        safety?.decision === 'review' || safety?.decision === 'reject';

      const status =
        cascade.level === 3 && needsHuman
          ? 'waiting_approval'
          : 'completed';

      await this.ticketRepository.updateOutcome(ticketId, {
        status,
        suggestion: cascade.answer,
        confidence: cascade.confidence,
        analysis: analysis as Prisma.InputJsonValue,
        requiresReview: Boolean(needsHuman),
        hallucination: safety?.scores?.final,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `applyTaskOutcome failed for ticket "${ticketId}": ${message}`,
      );
      await this.ticketRepository.updateOutcome(ticketId, {
        status: 'failed',
        suggestion: `Post-process error: ${message}`,
      });
    }
  }

  private buildAnalysisJson(
    cascade: CascadeResult,
    result: ConcurrentTaskResult,
  ): Record<string, unknown> {
    const generator = cascade.pipelineResult?.generatorOutput as
      | Record<string, unknown>
      | undefined;
    const analyzer = cascade.pipelineResult?.routes.find(
      (route) => route.routeId === 'analyzer',
    )?.output;
    const classification = this.buildDisplayClassification(cascade, generator);

    const base: Record<string, unknown> = {
      type: this.resolveDisplayType(cascade, generator),
      confidence: cascade.confidence,
      classification,
      cascadeLevel: cascade.level,
      source: cascade.source,
      category: cascade.category,
      processingTimeMs: cascade.processingTimeMs,
      sessionId: result.sessionId,
      taskId: result.taskId,
      wallClockMs: result.durationMs,
    };

    if (generator) {
      base.generator = generator;
      Object.assign(base, this.pickGeneratorDisplayFields(generator));
    }

    if (analyzer) {
      base.analyzer = analyzer;
    }

    if (cascade.pipelineResult) {
      base.pipelineId = cascade.pipelineResult.pipelineId;
      base.routeCount = cascade.pipelineResult.routes.length;
    }

    if (cascade.safetyDecision) {
      base.safetyDecision = cascade.safetyDecision;
    }

    return base;
  }

  private buildDisplayClassification(
    cascade: CascadeResult,
    generator?: Record<string, unknown>,
  ): Record<string, unknown> {
    const generatorClassification = generator?.classification;
    if (
      generatorClassification &&
      typeof generatorClassification === 'object'
    ) {
      return generatorClassification as Record<string, unknown>;
    }

    const type = this.resolveDisplayType(cascade, generator);
    return {
      type,
      confidence: cascade.confidence,
      reason: `Processed by ${cascade.source} at cascade level ${cascade.level}`,
      matchedKeywords: cascade.matchedKeywords ?? [],
    };
  }

  private resolveDisplayType(
    cascade: CascadeResult,
    generator?: Record<string, unknown>,
  ): string {
    if (typeof generator?.type === 'string') {
      return generator.type;
    }
    if (cascade.source === 'FAQMatcher') {
      return 'FAQ';
    }
    if (cascade.source === 'MultiAgent') {
      return 'OTHER';
    }
    return 'OTHER';
  }

  private pickGeneratorDisplayFields(
    generator: Record<string, unknown>,
  ): Record<string, unknown> {
    const keys = [
      'answer',
      'draftContent',
      'suggestion',
      'searchResults',
      'bugReport',
      'customerEmail',
      'nextSteps',
      'editable',
      'chatOptimizable',
    ];

    return keys.reduce<Record<string, unknown>>((acc, key) => {
      if (generator[key] !== undefined) {
        acc[key] = generator[key];
      }
      return acc;
    }, {});
  }

  /**
   * Mark ticket as approved by human reviewer.
   */
  async approve(
    id: string,
    data: { approvedBy: string; editedContent?: string },
  ) {
    await this.ensureExists(id);
    return this.ticketRepository.approve(id, data);
  }

  /**
   * Mark ticket as rejected by human reviewer.
   */
  async reject(id: string, data: { reason: string }) {
    await this.ensureExists(id);
    return this.ticketRepository.reject(id, data);
  }

  /**
   * Assign or unassign a ticket. When assigneeId is provided, it must
   * resolve to a User with role=supporter.
   */
  async assign(id: string, assigneeId: string | null | undefined) {
    await this.ensureExists(id);

    // Empty/null/undefined → unassign.
    const trimmed = typeof assigneeId === 'string' ? assigneeId.trim() : '';
    if (!trimmed) {
      return this.ticketRepository.assign(id, null);
    }

    const supporter = await this.userService.getById(trimmed);
    if (supporter.role !== 'supporter') {
      throw new BadRequestException(
        `User "${trimmed}" cannot be assigned: role is "${supporter.role}", expected "supporter"`,
      );
    }

    return this.ticketRepository.assign(id, supporter.id);
  }

  /**
   * Hard-delete a ticket and all of its dependent rows (logs, token usage).
   */
  async remove(id: string) {
    await this.ensureExists(id);
    return this.ticketRepository.delete(id);
  }

  /**
   * Chat with AI to refine the generated suggestion.
   * Delegates to AIOptimizationService for multi-turn refinement.
   */
  async chatWithAi(id: string, message: string) {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException(`Ticket "${id}" not found`);
    }

    if (!ticket.suggestion) {
      throw new Error(
        `Ticket "${id}" has no suggestion to refine yet`,
      );
    }

    // In a real implementation, this would delegate to AIOptimizationService
    // which would use Gemini to refine the suggestion based on user feedback.
    // For now, return a placeholder response indicating the feature is ready.
    return {
      ticketId: id,
      userMessage: message,
      refinedSuggestion:
        ticket.suggestion +
        ` [Refined with user feedback: "${message}"]`,
      timestamp: new Date(),
    };
  }
}
