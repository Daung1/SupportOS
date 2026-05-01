import { Injectable } from '@nestjs/common';
import { Prisma, Ticket, TicketLog, TokenUsage, User } from '@prisma/client';
import { TokenFlushSummary } from '../agents/orchestrator/ports/orchestrator-ports';
import { PrismaService } from '../database/prisma.service';

/** Ticket aggregate used by GET /api/tickets/:id */
export type TicketWithRelations = Ticket & {
  logs: TicketLog[];
  tokenUsage: TokenUsage[];
  user: User | null;
  assignee: User | null;
};

/** Lightweight ticket row including the submitting user for list views. */
export type TicketWithUser = Ticket & {
  user: User | null;
  assignee: User | null;
};

export interface PaginationParams {
  skip: number;
  take: number;
  /** Optional exact status filter */
  status?: string;
  /** Optional submitting-user filter */
  userId?: string;
  /**
   * Optional assigned-supporter filter. Pass the supporter id to scope to
   * "their" tickets, or the literal string "none" to scope to unassigned.
   */
  assigneeId?: string;
}

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    content: string;
    priority: string;
    userId?: string | null;
  }): Promise<Ticket> {
    return this.prisma.ticket.create({
      data: {
        content: data.content,
        priority: data.priority,
        status: 'processing',
        userId: data.userId ?? null,
      },
    });
  }

  findPaged(params: PaginationParams): Promise<TicketWithUser[]> {
    const where = this.buildWhere(params);

    return this.prisma.ticket.findMany({
      where,
      include: { user: true, assignee: true },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  countFiltered(
    status?: string,
    userId?: string,
    assigneeId?: string,
  ): Promise<number> {
    return this.prisma.ticket.count({
      where: this.buildWhere({ status, userId, assigneeId }),
    });
  }

  /** Shared where-clause builder for findPaged + countFiltered. */
  private buildWhere(params: {
    status?: string;
    userId?: string;
    assigneeId?: string;
  }): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {};
    if (params.status !== undefined && params.status !== '') {
      where.status = params.status;
    }
    if (params.userId !== undefined && params.userId !== '') {
      where.userId = params.userId;
    }
    // "none" is a sentinel meaning "unassigned only".
    if (params.assigneeId === 'none') {
      where.assigneeId = null;
    } else if (params.assigneeId !== undefined && params.assigneeId !== '') {
      where.assigneeId = params.assigneeId;
    }
    return where;
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
        user: true,
        assignee: true,
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

  /** Set or clear the assigned supporter for a ticket. */
  assign(id: string, assigneeId: string | null): Promise<Ticket> {
    return this.prisma.ticket.update({
      where: { id },
      data: { assigneeId },
    });
  }

  /**
   * Hard-delete a ticket. Related TicketLog/TokenUsage rows are cascade-deleted
   * via the schema's `onDelete: Cascade` relation.
   */
  delete(id: string): Promise<Ticket> {
    return this.prisma.ticket.delete({ where: { id } });
  }
}
