/**
 * MetricsCollector - in-memory rolling-window aggregator that powers
 * the `/api/health` endpoint.  Implements `ILogRepository` so it can
 * piggy-back on the same fan-out the other orchestrators already
 * publish to; no extra plumbing in the orchestrator layer is needed.
 *
 * What we track (last N tickets, default 100):
 *
 *   - durationMs       wall clock from `queue.start` to `queue.success/.failure`
 *   - succeeded        count of `queue.success` in the window
 *   - failed           count of `queue.failure` (non-DLQ) in the window
 *   - dlq              count of `queue.dlq` in the window
 *   - errorRate        (failed + dlq) / total
 *   - latency.avgMs    arithmetic mean of durationMs
 *   - latency.p95Ms    95th percentile of durationMs
 *
 * Why "rolling window" rather than a Prometheus-style counter:
 * the health endpoint is consumed by humans and load balancers, not
 * by a TSDB.  Keeping the last N samples gives a meaningful "current
 * state" snapshot without needing background aggregation jobs.  When
 * we wire Prometheus in a future phase, we expose the same numbers
 * via a `/metrics` route - the collector can stay unchanged.
 *
 * All ILogRepository methods are sync and short; failures are caught
 * so a buggy metric path can never crash an orchestrator.
 */

import { Injectable } from '@nestjs/common';
import {
  ILogRepository,
  PipelineLogEvent,
} from '../../agents/orchestrator/ports/orchestrator-ports';
import {
  AgentEndEvent,
  AgentErrorEvent,
  AgentIterationEvent,
  AgentStartEvent,
} from '../../agents/core/types';

export interface MetricsSnapshot {
  windowSize: number;
  /** Number of completed tasks currently held in the window. */
  sampledCount: number;
  succeeded: number;
  failed: number;
  dlq: number;
  /** (failed + dlq) / sampledCount, in [0, 1].  0 when sampledCount == 0. */
  errorRate: number;
  latency: {
    avgMs: number;
    p95Ms: number;
  };
  /** Counters that survive eviction (lifetime tally since process start). */
  totals: {
    succeeded: number;
    failed: number;
    dlq: number;
  };
  uptimeMs: number;
}

interface SampleRecord {
  ticketId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  outcome: 'success' | 'failure' | 'dlq';
}

@Injectable()
export class MetricsCollector implements ILogRepository {
  private readonly windowSize: number;
  /** Per-ticket start timestamp captured on `queue.start`. */
  private readonly inFlight = new Map<string, number>();
  /** Rolling window of completed samples, oldest first. */
  private readonly samples: SampleRecord[] = [];
  private readonly startedAt = Date.now();

  private lifetimeSucceeded = 0;
  private lifetimeFailed = 0;
  private lifetimeDlq = 0;

  constructor(windowSize = 100) {
    if (windowSize < 1) {
      throw new Error(`MetricsCollector windowSize must be >= 1 (got ${windowSize})`);
    }
    this.windowSize = windowSize;
  }

  // ---------------------------------------------------------------------------
  // ILogRepository - we only react to queue.* events.  Agent and
  // pipeline / cascade events are still fanned in by the composite
  // but we deliberately ignore them here (otherwise the rolling
  // window would be polluted by inner-loop noise).
  // ---------------------------------------------------------------------------

  appendAgentStart(_event: AgentStartEvent): void {
    /* no-op for metrics */
  }

  appendAgentIteration(_event: AgentIterationEvent): void {
    /* no-op for metrics */
  }

  appendAgentError(_event: AgentErrorEvent): void {
    /* no-op for metrics */
  }

  appendAgentEnd(_event: AgentEndEvent): void {
    /* no-op for metrics */
  }

  appendPipelineEvent(event: PipelineLogEvent): void {
    try {
      const ticketId = event.ticketId;
      switch (event.type) {
        case 'queue.start':
          if (ticketId) this.inFlight.set(ticketId, event.timestamp);
          break;
        case 'queue.success':
          this.recordOutcome(event, 'success');
          break;
        case 'queue.failure':
          this.recordOutcome(event, 'failure');
          break;
        case 'queue.dlq':
          this.recordOutcome(event, 'dlq');
          break;
        default:
          // Ignored: queue.submit / queue.retry / queue.batch.* /
          // pipeline.* / cascade.* - these don't move the headline
          // outcome counters.
          break;
      }
    } catch {
      // A metrics path must never crash the orchestrator.  Swallow
      // and rely on the structured logger to surface the original
      // event already.
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  snapshot(): MetricsSnapshot {
    const samples = this.samples;
    const sampledCount = samples.length;

    const succeeded = samples.filter((s) => s.outcome === 'success').length;
    const failed = samples.filter((s) => s.outcome === 'failure').length;
    const dlq = samples.filter((s) => s.outcome === 'dlq').length;
    const errorRate = sampledCount === 0 ? 0 : (failed + dlq) / sampledCount;

    const durations = samples.map((s) => s.durationMs);
    const avgMs =
      durations.length === 0
        ? 0
        : Math.round(
            durations.reduce((acc, n) => acc + n, 0) / durations.length,
          );
    const p95Ms = MetricsCollector.percentile(durations, 0.95);

    return {
      windowSize: this.windowSize,
      sampledCount,
      succeeded,
      failed,
      dlq,
      errorRate: Number(errorRate.toFixed(4)),
      latency: { avgMs, p95Ms },
      totals: {
        succeeded: this.lifetimeSucceeded,
        failed: this.lifetimeFailed,
        dlq: this.lifetimeDlq,
      },
      uptimeMs: Date.now() - this.startedAt,
    };
  }

  /** Test helper - drop the rolling window and counters. */
  reset(): void {
    this.inFlight.clear();
    this.samples.length = 0;
    this.lifetimeSucceeded = 0;
    this.lifetimeFailed = 0;
    this.lifetimeDlq = 0;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private recordOutcome(
    event: PipelineLogEvent,
    outcome: SampleRecord['outcome'],
  ): void {
    const ticketId = event.ticketId;
    if (!ticketId) return;

    const startedAt = this.inFlight.get(ticketId);
    // We may receive a queue.failure without a matching queue.start
    // when an exotic submit-time guard rejects the ticket.  Use the
    // event timestamp itself as a degenerate "duration = 0" marker
    // rather than dropping the outcome, which would silently bias
    // the success rate upward.
    const startTs = startedAt ?? event.timestamp;
    const endTs = event.timestamp;
    const durationMs = Math.max(0, endTs - startTs);

    this.inFlight.delete(ticketId);

    this.samples.push({
      ticketId,
      startedAt: startTs,
      endedAt: endTs,
      durationMs,
      outcome,
    });

    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }

    if (outcome === 'success') this.lifetimeSucceeded++;
    else if (outcome === 'failure') this.lifetimeFailed++;
    else this.lifetimeDlq++;
  }

  /**
   * Simple non-interpolating nearest-rank percentile.  Handles the
   * empty array case explicitly (callers expect 0, not NaN).
   */
  private static percentile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil(q * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
  }
}
