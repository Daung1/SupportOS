/**
 * Core types and interfaces for the Agent framework
 * Defines all data structures used throughout the TAO Loop execution
 */

/**
 * Agent execution result
 * Contains the outcome of a single agent execution
 */
export interface AgentResult {
  /** Whether the execution was successful */
  success: boolean;

  /** The output result from the agent */
  output: any;

  /** Error message if execution failed */
  error?: string;

  /** Total number of iterations performed */
  iterations: number;

  /** Token usage statistics */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Single TAO Loop iteration record
 * Records the complete state of one iteration: Thought → Action → Observation
 */
export interface TAOIteration {
  /** Iteration number (0-indexed) */
  iteration: number;

  /** LLM's thought process and reasoning */
  thought: string;

  /** Action details determined by the agent */
  action: {
    /** Action type: 'FINISH', 'CALL_TOOL', or custom action types */
    type: string;

    /** Tool name to be called (when type is 'CALL_TOOL') */
    toolName?: string;

    /** Tool input parameters (when type is 'CALL_TOOL') */
    toolInput?: any;

    /** Direct output content (when type is 'FINISH') */
    output?: string;
  };

  /** Observation from the executed action */
  observation: {
    /** Whether the action execution succeeded */
    success: boolean;

    /** Result output from the action */
    output?: any;

    /** Error message if action failed */
    error?: string;

    /** Execution duration in milliseconds */
    duration?: number;
  };

  /** Timestamp when this iteration occurred (milliseconds) */
  timestamp: number;
}

/**
 * Complete execution result with history
 * Extends AgentResult with full execution history and state snapshot
 */
export interface ExecutionResult extends AgentResult {
  /** Complete history of all iterations */
  history: TAOIteration[];

  /** Final state snapshot after execution */
  state: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Agent lifecycle events
// ---------------------------------------------------------------------------
//
// BaseAgent extends EventEmitter and publishes these events during a TAO
// loop execution.  Downstream consumers (orchestrator, persistence layer,
// WebSocket gateway, TokenTracker, observability) subscribe via `on()`
// / `once()` without coupling to the Agent internals.
//
// Design rules:
//   1. Every event carries the agent name and a timestamp so that
//      consumers can tag / order records without touching the payload
//      that triggered them.
//   2. Optional `ticketId` / `sessionId` / `taskId` are copied from the
//      session context when available - this keeps the consumer side
//      free of boilerplate correlation plumbing.
//   3. Payloads are plain data (no class instances) so they can be
//      serialised to DB rows or WebSocket frames directly.
//   4. Errors are stringified on the event so listeners never have to
//      handle `unknown` error shapes.

/** Correlation fields copied from ISessionContext onto every event. */
export interface AgentEventContext {
  agentName: string;
  sessionId?: string;
  taskId?: string;
  ticketId?: string;
  timestamp: number;
}

/** Fired once before the TAO loop starts. */
export interface AgentStartEvent extends AgentEventContext {
  input: string;
}

/**
 * Fired after every TAO iteration (both successful iterations that continue
 * and the final iteration that returns FINISH).  Carries the full
 * thought / action / observation triple so that persistence listeners can
 * build a complete audit log without re-running the agent.
 */
export interface AgentIterationEvent extends AgentEventContext {
  iteration: number;
  thought: string;
  action: TAOIteration['action'];
  observation: TAOIteration['observation'];
  duration: number;
}

/** Fired once after the TAO loop ends (success or failure). */
export interface AgentEndEvent extends AgentEventContext {
  success: boolean;
  iterations: number;
  duration: number;
  output?: any;
  error?: string;
}

/**
 * Fired when a TAO phase (think / parseAction / executeAction) throws.
 * The loop is aborted after this event; an `agent.end` event with
 * `success=false` follows.  Keeping this as a separate event lets
 * monitoring subscribe to failures specifically.
 */
export interface AgentErrorEvent extends AgentEventContext {
  phase: 'think' | 'parseAction' | 'executeAction' | 'unknown';
  iteration?: number;
  error: string;
}

/**
 * Master map of event name -> payload type.  Used by BaseAgent's typed
 * `emit` / `on` / `once` / `off` overloads so that the TypeScript
 * compiler catches typos and shape mismatches on both sides of the
 * publish/subscribe boundary.
 */
export interface AgentEventMap {
  'agent.start': AgentStartEvent;
  'tao.iteration': AgentIterationEvent;
  'agent.end': AgentEndEvent;
  'agent.error': AgentErrorEvent;
}

/** String-literal union of all known event names. */
export type AgentEventName = keyof AgentEventMap;

/** Runtime list of event names (kept in sync with AgentEventMap). */
export const AGENT_EVENT_NAMES: readonly AgentEventName[] = [
  'agent.start',
  'tao.iteration',
  'agent.end',
  'agent.error',
] as const;
