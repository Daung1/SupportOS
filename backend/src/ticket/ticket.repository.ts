import { Injectable } from '@nestjs/common';
import { Prisma, Ticket, TicketLog, TokenUsage } from '@prisma/client';
import { TokenFlushSummary } from '../agents/orchestrator/ports/orchestrator-ports';
import { PrismaService } from '../database/prisma.service';

/** Ticket aggregate used by GET /api/tickets/:id */
export type TicketWithRelations = Ticket & {
  logs: TicketLog[];
  tokenUsage: TokenUsage[];
};

export interface PaginationParams {
  skip: number;
  take: number;
  /** Optional exact status filter */
  status?: string;
}

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { content: string; priority: string }): Promise<Ticket> {
    return this.prisma.ticket.create({
      data: {
        content: data.content,
        priority: data.priority,
        status: 'processing',
      },
    });
  }

  findPaged(params: PaginationParams): Promise<Ticket[]> {
    const where: Prisma.TicketWhereInput = {};
    if (params.status !== undefined && params.status !== '') {
      where.status = params.status;
    }

    return this.prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  countFiltered(status?: string): Promise<number> {
    const where: Prisma.TicketWhereInput =
      status !== undefined && status !== ''
        ? { status }
        : {};
    return this.prisma.ticket.count({ where });
  }

  findById(id: string): Promise<Ticket | null> {
    return this.prisma.ticket.findUnique({ where: { id } });
  }

  findByIdWithRelations(id: string): Promise<TicketWithRelations | null> {
    return this.prisma.ticket.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { timestamp: 'asc' } },
        tokenUsage: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  findLogs(id: string): Promise<TicketLog[]> {
    return this.prisma.ticketLog.findMany({
      where: { ticketId: id },
      orderBy: { timestamp: 'asc' },
    });
  }

  findTokenUsages(id: string): Promise<TokenUsage[]> {
    return this.prisma.tokenUsage.findMany({
      where: { ticketId: id },
      orderBy: { timestamp: 'asc' },
    });
  }

  async updateOutcome(
    id: string,
    data: Prisma.TicketUpdateInput,
  ): Promise<Ticket> {
    return this.prisma.ticket.update({
      where: { id },
      data,
    });
  }

  /**
   * Persists aggregated token flush from MultiAgentOrchestrator (L3 only).
   */
  async appendTokenAggregate(
    ticketId: string,
    summary: TokenFlushSummary,
  ): Promise<void> {
    await this.prisma.tokenUsage.create({
      data: {
        ticketId,
        model: 'session-aggregate',
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
        cost: summary.costUsd ?? 0,
      },
    });
  }

  /**
   * Mark ticket as approved by a human reviewer.
   */
  async approve(
    id: string,
    data: {
      approvedBy: string;
      editedContent?: string;
    },
  ): Promise<Ticket> {
    return this.prisma.ticket.update({
      where: { id },
      data: {
        approvalStatus: 'approved',
        approvedBy: data.approvedBy,
        approvedAt: new Date(),
        edits: data.editedContent,
        status: 'completed',
      },
    });
  }

  /**
   * Mark ticket as rejected by a human reviewer.
   */
  async reject(
    id: string,
    data: {
      reason: string;
    },
  ): Promise<Ticket> {
    return this.prisma.ticket.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        suggestion: data.reason,
        status: 'failed',
      },
    });
  }
}
