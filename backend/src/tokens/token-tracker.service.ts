/**
 * TokenTracker - per-session token + cost aggregator.
 *
 * Implements two interfaces so each consumer only sees what it needs:
 *   - `ITokenRecorder` (producers): model clients append raw rows here.
 *   - `ITokenTracker`  (consumer):  orchestrator calls `flush(sessionId)`
 *                                   at the end of the pipeline and gets
 *                                   back the aggregate summary.
 *
 * Lifecycle of a session's usage data:
 *   1. GeminiService.call()  -> record({ sessionId, inputTokens, ... })
 *   2. ...many more calls across multiple agents in the same session...
 *   3. MultiAgentOrchestrator.execute() finishes -> flush(sessionId)
 *      - sums input / output tokens
 *      - computes cost via cost.calculator
 *      - returns TokenFlushSummary
 *      - evicts the session entry so the map does not grow forever
 *
 * Design choices worth calling out:
 *   - In-memory only.  DB persistence is A.8's job; that layer can
 *     subscribe by implementing ILogRepository or by reading the
 *     TokenFlushSummary the orchestrator already emits as a
 *     'ticket.cost' WebSocket event.  Keeping persistence out of the
 *     tracker keeps it fast and unit-testable.
 *   - No locking / concurrency guards.  Node.js is single-threaded
 *     and the ops (Array.push, iterate, delete) are atomic at the
 *     JS level; no race window exists.
 *   - `flush` always returns a summary (even for unknown sessionIds)
 *     to keep the orchestrator's code path unconditional.
 *   - `getUsage` is public (but read-only) so future controllers can
 *     implement `GET /tickets/:id/token-usage` without flushing.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ITokenTracker, TokenFlushSummary } from '../agents/orchestrator/ports/orchestrator-ports';
import { ITokenRecorder, TokenRecord } from './token-recorder.interface';
import { aggregateCostUsd } from './cost.calculator';

/** Read-only snapshot of a session's accumulated usage. */
export interface TokenUsageSnapshot {
  sessionId: string;
  rows: readonly TokenRecord[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

@Injectable()
export class TokenTracker implements ITokenRecorder, ITokenTracker {
  private readonly logger = new Logger(TokenTracker.name);
  private readonly sessions = new Map<string, TokenRecord[]>();

  // ---------------------------------------------------------------------------
  // Producer side (ITokenRecorder)
  // ---------------------------------------------------------------------------

  record(record: TokenRecord): void {
    if (!record?.sessionId) {
      // Guard against callers forgetting to pass context; log once but
      // never throw because we are on the LLM hot path.
      this.logger.warn(
        `record() called without sessionId; dropping row (model=${record?.model})`,
      );
      return;
    }

    const list = this.sessions.get(record.sessionId);
    if (list) {
      list.push(record);
    } else {
      this.sessions.set(record.sessionId, [record]);
    }
  }

  // ---------------------------------------------------------------------------
  // Consumer side (ITokenTracker)
  // ---------------------------------------------------------------------------

  async flush(sessionId: string): Promise<TokenFlushSummary> {
    const rows = this.sessions.get(sessionId) ?? [];
    const summary = this.summarize(sessionId, rows);

    // Evict after summarizing so a second flush on the same sessionId
    // returns zeroed totals instead of double-counting.
    this.sessions.delete(sessionId);

    return summary;
  }

  // ---------------------------------------------------------------------------
  // Read-only helpers (not on either port interface)
  // ---------------------------------------------------------------------------

  /**
   * Non-destructive read.  Useful for tests and for a future HTTP
   * endpoint that wants to show live cost before the pipeline ends.
   */
  getUsage(sessionId: string): TokenUsageSnapshot {
    const rows = this.sessions.get(sessionId) ?? [];
    const summary = this.summarize(sessionId, rows);
    return {
      sessionId,
      rows: rows.slice(),
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
      totalTokens: summary.totalTokens,
      estimatedCostUsd: summary.costUsd ?? 0,
    };
  }

  /** Exposed for tests; returns the number of live sessions in the buffer. */
  sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Reset everything.  Mainly for tests or operational recovery; in
   * production the per-session `flush` should keep the map bounded.
   */
  clearAll(): void {
    this.sessions.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private summarize(
    sessionId: string,
    rows: TokenRecord[],
  ): TokenFlushSummary {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const r of rows) {
      inputTokens += r.inputTokens ?? 0;
      outputTokens += r.outputTokens ?? 0;
    }
    const totalTokens = inputTokens + outputTokens;
    const costUsd = aggregateCostUsd(
      rows.map((r) => ({
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
      })),
    );
    return {
      sessionId,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
    };
  }
}
