/**
 * Producer-facing interface for token accounting.
 *
 * Model clients (GeminiService today, future OpenAI/Claude clients
 * tomorrow) depend on this narrow interface to publish per-call token
 * usage.  The orchestrator uses the sibling `ITokenTracker` interface
 * (in `agents/orchestrator/ports/orchestrator-ports.ts`) which only
 * exposes `flush(sessionId)`.
 *
 * Splitting the two surfaces keeps each consumer depending on the
 * minimum API it needs - the orchestrator cannot accidentally call
 * `record()`, and the model client cannot accidentally flush a session
 * it does not own.  The concrete `TokenTracker` service implements
 * both interfaces.
 */

/** DI token for ITokenRecorder (symbol, not a class). */
export const TOKEN_RECORDER = Symbol('TOKEN_RECORDER');

/** Context attached to a single LLM call so usage can be attributed. */
export interface TokenCallContext {
  /** Required: groups records so the orchestrator can flush per session. */
  sessionId: string;
  /** Agent or caller name (e.g. 'AnalyzerAgent', 'ai-optimization'). */
  agentName?: string;
  /** Optional ticket correlation id for downstream log join. */
  ticketId?: string;
}

/** Single usage row appended by the model client. */
export interface TokenRecord {
  sessionId: string;
  agentName?: string;
  ticketId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock ms when the call returned. */
  timestamp: number;
}

/**
 * Narrow interface implemented by the TokenTracker service and consumed
 * by model clients.  Recording is fire-and-forget from the caller's
 * perspective - implementations must not throw and must not do
 * network I/O on the hot path.
 */
export interface ITokenRecorder {
  record(record: TokenRecord): void;
}
