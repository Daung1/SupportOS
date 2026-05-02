/**
 * CascadeOrchestrator - three-layer ticket handling pipeline.
 *
 * Responsibilities (see program plan Phase A.5):
 *   L1 FAQMatcher   - high-precision canned answers (fast + free)
 *   L2 SimpleFilter - rule-based category classification (fast + free)
 *   L3 MultiAgent   - full LLM agent pipeline (A.4) as fallback
 *
 * The orchestrator escalates from L1 -> L2 -> L3 and short-circuits as
 * soon as a layer produces an answer with sufficient confidence.  This
 * is the "cheapest-first" routing pattern used by production support
 * systems: the vast majority of tickets are answered by the free L1/L2
 * layers, and only the truly novel ones cost LLM tokens.
 *
 * Design notes:
 * - Input is an ISessionContext (not a raw string).  L1 and L2 read
 *   `context.input`; L3 needs the full context for tool/model access.
 * - MultiAgentOrchestrator is injected and always available in prod.
 *   For tests we allow a stub implementation via the constructor.
 * - ILogRepository is optional.  When wired, each layer hit/miss is
 *   persisted to TicketLog with a distinct `cascade.*` type so callers
 *   can reconstruct the cascade trace post-hoc.
 * - The cascade itself does not emit WebSocket events directly; L3
 *   handles that through MultiAgentOrchestrator.  L1/L2 hits are fast
 *   enough that a single `ticket.completed` after the response is
 *   sufficient (emitted from the controller layer).
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MultiAgentOrchestrator, MultiAgentResult } from '../agents/orchestrator/multi-agent-orchestrator.service';
import {
  ILogRepository,
  LOG_REPOSITORY,
} from '../agents/orchestrator/ports/orchestrator-ports';
import { SharedSafetyResult } from '../agents/core/shared-state';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { FAQMatcher, FAQMatchResult } from './faq.matcher';
import { SimpleFilter, SimpleFilterResult } from './simple.filter';

export type CascadeSource =
  | 'FAQMatcher'
  | 'SimpleFilter'
  | 'MultiAgent'
  | 'Error';

export interface CascadeResult {
  /** 1 = FAQ, 2 = Filter, 3 = MultiAgent, 0 = error before any layer. */
  level: 0 | 1 | 2 | 3;
  source: CascadeSource;
  success: boolean;
  category: string;
  answer: string;
  confidence: number;
  processingTimeMs: number;
  error?: string;

  // Layer-specific diagnostic fields.  Consumers that want to render
  // the full trace can pull whichever field matches `level`.
  faqId?: string;
  matchedKeywords?: string[];
  pipelineResult?: MultiAgentResult;
  safetyDecision?: SharedSafetyResult;
}

export interface CascadeOrchestratorOptions {
  /**
   * Override the FAQMatcher's minimum confidence for accepting a L1 hit.
   * If omitted the FAQMatcher's own default applies.
   */
  faqMinConfidence?: number;
}

export const CASCADE_ORCHESTRATOR_OPTIONS = Symbol(
  'CASCADE_ORCHESTRATOR_OPTIONS',
);

@Injectable()
export class CascadeOrchestrator {
  private readonly logger = new Logger(CascadeOrchestrator.name);

  constructor(
    private readonly faqMatcher: FAQMatcher,
    private readonly simpleFilter: SimpleFilter,
    private readonly multiAgentOrchestrator: MultiAgentOrchestrator,
    @Optional() @Inject(LOG_REPOSITORY)
    private readonly logRepository?: ILogRepository,
    @Optional() @Inject(CASCADE_ORCHESTRATOR_OPTIONS)
    options?: CascadeOrchestratorOptions,
  ) {
    if (options?.faqMinConfidence !== undefined) {
      this.faqMatcher.setConfidenceThreshold(options.faqMinConfidence);
    }
  }

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  async processTicket(
    context: ISessionContext,
    skipLevel3 = false,
  ): Promise<CascadeResult> {
    const startedAt = Date.now();
    const ticketText = context.input ?? '';
    const logCtx = this.logContextFrom(context);

    this.appendLog({ ...logCtx, type: 'cascade.start', timestamp: startedAt });

    try {
      // ------------------- Layer 1: FAQMatcher -------------------
      const faqResult = await this.faqMatcher.match(ticketText);
      if (faqResult.matched) {
        const result = this.buildLevel1Result(faqResult, startedAt);
        this.appendLog({
          ...logCtx,
          type: 'cascade.level1_hit',
          timestamp: Date.now(),
          payload: {
            faqId: faqResult.faqId,
            confidence: faqResult.confidence,
            processingTimeMs: faqResult.processingTime,
          },
        });
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 1, success: true },
        });
        return result;
      }
      this.appendLog({
        ...logCtx,
        type: 'cascade.level1_miss',
        timestamp: Date.now(),
        payload: {
          confidence: faqResult.confidence,
          reason: faqResult.reason,
        },
      });

      // ------------------- Layer 2: SimpleFilter -----------------
      const filterResult = await this.simpleFilter.classify(ticketText);
      if (filterResult.classified) {
        const result = this.buildLevel2Result(filterResult, startedAt);
        this.appendLog({
          ...logCtx,
          type: 'cascade.level2_hit',
          timestamp: Date.now(),
          payload: {
            category: filterResult.category,
            confidence: filterResult.confidence,
            matchedKeywords: filterResult.matchedKeywords,
            processingTimeMs: filterResult.processingTime,
          },
        });
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 2, success: true },
        });
        return result;
      }
      this.appendLog({
        ...logCtx,
        type: 'cascade.level2_miss',
        timestamp: Date.now(),
        payload: {
          confidence: filterResult.confidence,
          reason: filterResult.reason,
        },
      });

      // If skipLevel3 is true, return early without running MultiAgent
      if (skipLevel3) {
        this.appendLog({
          ...logCtx,
          type: 'cascade.level3_skipped',
          timestamp: Date.now(),
          payload: { reason: 'Quick answer mode - L1/L2 insufficient' },
        });
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 0, success: false, requiresLevel3: true },
        });
        return {
          level: 0,
          source: 'Error',
          success: false,
          category: 'requires_deep_analysis',
          answer: '',
          confidence: 0,
          processingTimeMs: Date.now() - startedAt,
          error: 'No quick answer found. Please generate a ticket for deep analysis.',
        };
      }

      // ------------------- Layer 3: MultiAgent -------------------
      this.appendLog({
        ...logCtx,
        type: 'cascade.level3_entry',
        timestamp: Date.now(),
      });
      const pipelineResult = await this.multiAgentOrchestrator.execute(context);
      const result = this.buildLevel3Result(pipelineResult, startedAt);
      this.appendLog({
        ...logCtx,
        type: 'cascade.level3_complete',
        timestamp: Date.now(),
        payload: {
          success: pipelineResult.success,
          pipelineId: pipelineResult.pipelineId,
          safety: pipelineResult.safetyDecision?.decision,
          routes: pipelineResult.routes.map((r) => ({
            id: r.routeId,
            success: r.success,
            skipped: r.skipped,
          })),
        },
      });
      this.appendLog({
        ...logCtx,
        type: 'cascade.end',
        timestamp: Date.now(),
        payload: { level: 3, success: result.success },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cascade processing failed: ${message}`);
      this.appendLog({
        ...logCtx,
        type: 'cascade.error',
        timestamp: Date.now(),
        payload: { error: message },
      });
      return {
        level: 0,
        source: 'Error',
        success: false,
        category: 'error',
        answer: '',
        confidence: 0,
        processingTimeMs: Date.now() - startedAt,
        error: message,
      };
    }
  }

  /**
   * Convenience helper for batch processing.  Runs ticket pipelines in
   * parallel; callers that want bounded concurrency should use the
   * ConcurrentOrchestrator (A.7) instead of this method.
   */
  async processTickets(contexts: ISessionContext[]): Promise<CascadeResult[]> {
    return Promise.all(contexts.map((ctx) => this.processTicket(ctx)));
  }

  // ---------------------------------------------------------------------------
  // Layer result builders
  // ---------------------------------------------------------------------------

  private buildLevel1Result(
    faq: FAQMatchResult,
    startedAt: number,
  ): CascadeResult {
    return {
      level: 1,
      source: 'FAQMatcher',
      success: true,
      category: this.extractCategoryFromFaqId(faq.faqId),
      answer: faq.answer ?? '',
      confidence: faq.confidence,
      processingTimeMs: Date.now() - startedAt,
      faqId: faq.faqId,
    };
  }

  private buildLevel2Result(
    filter: SimpleFilterResult,
    startedAt: number,
  ): CascadeResult {
    return {
      level: 2,
      source: 'SimpleFilter',
      success: true,
      category: filter.category ?? 'unknown',
      // L2 does not produce a real answer; it acknowledges the category
      // and defers to downstream channels (templated reply, human
      // handoff, etc).  Matches existing cascade integration semantics.
      answer: this.level2TemplateAnswer(filter),
      confidence: filter.confidence,
      processingTimeMs: Date.now() - startedAt,
      matchedKeywords: filter.matchedKeywords,
    };
  }

  private buildLevel3Result(
    pipeline: MultiAgentResult,
    startedAt: number,
  ): CascadeResult {
    const generator = pipeline.generatorOutput as
      | {
          answer?: string;
          content?: string;
          draftContent?: string;
          suggestion?: string;
          category?: string;
          confidence?: number;
          classification?: { type?: string };
          type?: string;
        }
      | undefined;

    const answer =
      this.firstString(
        generator?.content,
        generator?.answer,
        generator?.draftContent,
        generator?.suggestion,
      ) ?? '';

    return {
      level: 3,
      source: 'MultiAgent',
      success: pipeline.success,
      category:
        generator?.category ??
        generator?.classification?.type ??
        generator?.type ??
        'general',
      answer,
      confidence: generator?.confidence ?? 0,
      processingTimeMs: Date.now() - startedAt,
      error: pipeline.error,
      pipelineResult: pipeline,
      safetyDecision: pipeline.safetyDecision,
    };
  }

  private firstString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === 'string');
  }

  private level2TemplateAnswer(filter: SimpleFilterResult): string {
    const category = filter.category ?? 'general';
    return `This inquiry has been classified as "${category}" (confidence ${(
      filter.confidence * 100
    ).toFixed(1)}%). Relevant help articles will be forwarded.`;
  }

  private extractCategoryFromFaqId(faqId?: string): string {
    if (!faqId) return 'unknown';
    const match = faqId.match(/^([^_]+)/);
    return match ? match[1] : 'unknown';
  }

  // ---------------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------------

  private logContextFrom(context: ISessionContext) {
    return {
      pipelineId: 'cascade',
      sessionId: context.sessionId,
      taskId: context.taskId,
      ticketId: context.metadata?.ticketId,
    };
  }

  /**
   * Append a pipeline event to the log repository.  Errors are logged
   * and swallowed - a failing log port must not abort cascade
   * processing.  Handles both sync and async implementations.
   */
  private appendLog(event: {
    pipelineId: string;
    sessionId?: string;
    taskId?: string;
    ticketId?: string;
    type: any;
    timestamp: number;
    payload?: Record<string, any>;
  }): void {
    if (!this.logRepository) return;
    try {
      const maybe = this.logRepository.appendPipelineEvent(event);
      if (maybe && typeof (maybe as Promise<void>).then === 'function') {
        (maybe as Promise<void>).catch((err) => {
          this.logger.warn(
            `Cascade log append failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    } catch (err) {
      this.logger.warn(
        `Cascade log append threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
