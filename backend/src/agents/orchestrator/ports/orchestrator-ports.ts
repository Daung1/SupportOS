/**
 * Ports exposed by MultiAgentOrchestrator to side-effect collaborators.
 *
 * The orchestrator's core job (running a pipeline of agents) should not
 * depend on concrete DB / WebSocket / safety / billing implementations.
 * Each collaborator is defined here as a narrow interface + DI token so
 * the actual services can be wired in independently (or left absent
 * during unit tests and early-phase development).
 *
 * Every port is wired with `@Optional()` in the orchestrator; a missing
 * port simply means that side effect is skipped.  This lets Phase A.4
 * land before the persistence layer (A.8), WebSocket gateway (B.3),
 * SafetyGate (C.2), and TokenTracker (A.6) are implemented.
 */

import {
  AgentEndEvent,
  AgentErrorEvent,
  AgentIterationEvent,
  AgentStartEvent,
} from '../../core/types';
import { ISessionContext } from '../../core/execution-context.interface';
import { SharedSafetyResult } from '../../core/shared-state';

// ---------------------------------------------------------------------------
// LogRepository: writes TAO events to the TicketLog table (A.8).
// ---------------------------------------------------------------------------

/** DI token for ILogRepository (Symbol, not a class). */
export const LOG_REPOSITORY = Symbol('ORCHESTRATOR_LOG_REPOSITORY');

export interface ILogRepository {
  appendAgentStart(event: AgentStartEvent): void | Promise<void>;
  appendAgentIteration(event: AgentIterationEvent): void | Promise<void>;
  appendAgentError(event: AgentErrorEvent): void | Promise<void>;
  appendAgentEnd(event: AgentEndEvent): void | Promise<void>;

  /**
   * Record a pipeline-level checkpoint that is not tied to a specific
   * agent (e.g. "route X was skipped", "pipeline aborted").  These
   * rows are optional but useful when reconstructing a trace.
   */
  appendPipelineEvent(event: PipelineLogEvent): void | Promise<void>;
}

export interface PipelineLogEvent {
  pipelineId: string;
  routeId?: string;
  sessionId?: string;
  taskId?: string;
  ticketId?: string;
  type:
    | 'pipeline.start'
    | 'pipeline.route.skipped'
    | 'pipeline.end'
    | 'pipeline.error'
    // Cascade orchestrator surfaces a separate layer of events so a
    // reader of TicketLog can tell whether a ticket was answered by
    // L1 (FAQ), L2 (SimpleFilter) or escalated to L3 (MultiAgent) on
    // top of the per-agent TAO events.
    | 'cascade.start'
    | 'cascade.level0_triage'
    | 'cascade.level1_hit'
    | 'cascade.level1_miss'
    | 'cascade.level1_skipped'
    | 'cascade.level2_hit'
    | 'cascade.level2_miss'
    | 'cascade.level3_entry'
    | 'cascade.level3_skipped'
    | 'cascade.level3_complete'
    | 'cascade.end'
    | 'cascade.error'
    // Queue (ConcurrentOrchestrator) events let the log reader
    // reconstruct "when was the ticket accepted, how long did it wait
    // in the queue, did it eventually succeed / fail / enter DLQ".
    | 'queue.submit'
    | 'queue.start'
    | 'queue.success'
    | 'queue.failure'
    | 'queue.retry'
    | 'queue.dlq'
    | 'queue.batch.start'
    | 'queue.batch.end';
  payload?: Record<string, any>;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// SocketGateway: pushes progress events to subscribed WebSocket clients (B.3).
// ---------------------------------------------------------------------------

/** DI token for ISocketGateway. */
export const SOCKET_GATEWAY = Symbol('ORCHESTRATOR_SOCKET_GATEWAY');

/**
 * Frame shape consumed by the frontend.  Not tied to Socket.io types so
 * we can swap transports later without churn.  The gateway is expected
 * to broadcast to the room identified by `ticketId` (see B.3).
 */
export interface ISocketGateway {
  /**
   * Emit a typed event to all clients subscribed to the given ticket.
   * Must be synchronous / fire-and-forget - it will be called from
   * inside event listeners on the TAO loop hot path.
   */
  emitToTicket(
    ticketId: string | undefined,
    event: SocketEventName,
    payload: Record<string, any>,
  ): void;
}

/** Event names understood by the frontend (see program plan section 9). */
export type SocketEventName =
  | 'ticket.stage'
  | 'ticket.iteration'
  | 'ticket.cost'
  | 'ticket.completed'
  | 'ticket.failed';

// ---------------------------------------------------------------------------
// SafetyGate: post-pipeline guardrail decision (C.2).
// ---------------------------------------------------------------------------

/** DI token for ISafetyGate. */
export const SAFETY_GATE = Symbol('ORCHESTRATOR_SAFETY_GATE');

export interface ISafetyGate {
  /**
   * Evaluate the generator output and decide whether to approve, send
   * for human review, or reject outright.  Implementations typically
   * run rule-based checks first, then heuristic scoring, then an LLM
   * validation pass.
   */
  evaluate(
    generatorOutput: unknown,
    context: ISessionContext,
  ): Promise<SharedSafetyResult>;
}

// ---------------------------------------------------------------------------
// TokenTracker: aggregates LLM token usage across a session (A.6).
// ---------------------------------------------------------------------------

/** DI token for ITokenTracker. */
export const TOKEN_TRACKER = Symbol('ORCHESTRATOR_TOKEN_TRACKER');

export interface ITokenTracker {
  /**
   * Called by the orchestrator when the pipeline completes (success or
   * failure).  Implementations can flush accumulated usage to the
   * TokenUsage table and emit a `ticket.cost` WebSocket event.  The
   * returned total is optional and only used for the orchestrator's
   * response envelope.
   */
  flush(sessionId: string): Promise<TokenFlushSummary | void>;
}

export interface TokenFlushSummary {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
}
