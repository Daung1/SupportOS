/**
 * SessionContextFactory - builds ISessionContext from a lightweight
 * SubmitTicket payload.
 *
 * Context construction used to be duplicated across
 * SingleAgentOrchestrator and the (TBD) HTTP controller.  Centralizing
 * it here makes sure every path through the system produces the same
 * shape - same tool registry, same model client, same metadata
 * conventions - which matters once TokenTracker (A.6) and
 * TicketLogRepository (A.8) start reading fields off the context.
 *
 * Tools are registered at factory construction time because
 * ToolRegistry is a singleton and agents look up tools by name, not
 * by reference.  Any tool listed here becomes visible to every agent
 * in every session.
 */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GeminiService } from '../gemini/gemini.service';
import { ToolRegistry } from '../tools/tool-registry.service';
import { TextAnalyzerTool } from '../tools/text-analyzer.tool';
import { SearchTool } from '../tools/search.tool';
import { ISessionContext } from '../agents/core/execution-context.interface';

/** Minimal payload accepted by the ConcurrentOrchestrator. */
export interface SubmitTicket {
  /** Required: stable business id used as ticketId in logs/WS events. */
  id: string;
  /** Required: user text to be processed. */
  content: string;
  /** Optional routing hint; does not affect cascade behaviour today. */
  priority?: 'low' | 'medium' | 'high';
  /** Explicit session/task ids for deterministic tests; auto-generated otherwise. */
  sessionId?: string;
  taskId?: string;
  /** Free-form attribution (userId, channel, etc.) merged into metadata. */
  metadata?: Record<string, any>;
}

@Injectable()
export class SessionContextFactory {
  constructor(
    private readonly geminiService: GeminiService,
    private readonly toolRegistry: ToolRegistry,
    @Optional() private readonly textAnalyzerTool?: TextAnalyzerTool,
    @Optional() private readonly searchTool?: SearchTool,
  ) {
    // Register tools once so agents can resolve them by name.  Safe to
    // call multiple times because ToolRegistry.registerTool is
    // idempotent on name.
    if (this.textAnalyzerTool) {
      this.toolRegistry.registerTool(this.textAnalyzerTool);
    }
    if (this.searchTool) {
      this.toolRegistry.registerTool(this.searchTool);
    }
  }

  build(ticket: SubmitTicket): ISessionContext {
    const sessionId = ticket.sessionId ?? randomUUID();
    const taskId = ticket.taskId ?? randomUUID();

    return {
      sessionId,
      taskId,
      input: ticket.content,
      state: new Map(),
      history: [],
      toolRegistry: this.toolRegistry,
      modelClient: this.geminiService,
      metadata: {
        ticketId: ticket.id,
        priority: ticket.priority,
        createdAt: new Date(),
        ...(ticket.metadata ?? {}),
      },
    };
  }
}
