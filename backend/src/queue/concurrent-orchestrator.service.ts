/**
 * ConcurrentOrchestrator - top-of-stack queue that fans incoming
 * tickets out to the CascadeOrchestrator under a concurrency limit.
 *
 * Responsibilities (see program plan Phase A.7):
 *   1. Accept a SubmitTicket (or a batch) and enqueue one task per
 *      ticket.
 *   2. Cap in-flight tasks via ConcurrencyQueue so that a burst of
 *      submissions does not blow past Gemini's rate limit or starve
 *      other system work.
 *   3. Build an ISessionContext per ticket via SessionContextFactory
 *      and hand it to CascadeOrchestrator.processTicket().
 *   4. Isolate failures: a throwing cascade for ticket X MUST NOT
 *      affect sibling tickets Y/Z.  Each task has its own try/catch.
 *   5. Optional queue-level retry with DLQ (disabled by default; set
 *      `maxRetries > 0` to enable).  The cascade + agent layers
 *      already retry transient failures, so queue-level retry is
 *      reserved for "pipeline was structurally broken" situations
 *      an operator wants to auto-recover from.
 *   6. Append queue.* events to the optional ILogRepository so the
 *      TicketLog reader can reconstruct queue-wait times and DLQ
 *      occurrences.
 *
 * Not responsible for:
 *   - Persisting Ticket rows.  That is A.8 (TicketRepository).
 *   - Emitting WebSocket events.  MultiAgentOrchestrator handles
 *     per-stage pushes; the controller layer (B.1) owns the final
 *     accept/complete response.
 *   - Deciding whether an answer is safe enough to ship.  That is
 *     A.4's SafetyGate hook (downstream from cascade).
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CascadeOrchestrator, CascadeResult } from '../cascade/cascade-orchestrator.service';
import {
  ILogRepository,
  LOG_REPOSITORY,
  PipelineLogEvent,
} from '../agents/orchestrator/ports/orchestrator-ports';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { ConcurrencyQueue, ConcurrencyQueueStats } from './concurrency-queue';
import { SessionContextFactory, SubmitTicket } from './session-context.factory';

/** DI token for queue options.  Optional; defaults are reasonable. */
export const CONCURRENT_ORCHESTRATOR_OPTIONS = Symbol(
  'CONCURRENT_ORCHESTRATOR_OPTIONS',
);

export interface ConcurrentOrchestratorOptions {
  /** Max tasks executing in parallel.  Defaults to 5 (plan's target). */
  concurrency?: number;
  /**
   * Queue-level retries on top of any retry the cascade/agent layer
   * already does.  0 = never retry at the queue level (default).  When
   * > 0, a task that keeps failing is promoted to DLQ and a
   * `queue.dlq` event is appended.
   */
  maxRetries?: number;
  /** Base delay between queue-level retries (ms).  Default 250. */
  retryDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<ConcurrentOrchestratorOptions> = {
  concurrency: 5,
  maxRetries: 0,
  retryDelayMs: 250,
};

/** Outcome envelope returned to callers for a single ticket. */
export interface ConcurrentTaskResult {
  ticketId: string;
  sessionId: string;
  taskId: string;
  success: boolean;
  /** Set when the cascade completed (success or business-level failure). */
  cascadeResult?: CascadeResult;
  /** Set when the task threw before producing a cascadeResult. */
  error?: string;
  /** Wall-clock ms from submit() to final resolve/reject. */
  durationMs: number;
  /** ms spent sitting in the queue before acquiring a slot. */
  queueWaitMs: number;
  /** Number of queue-level retries that were needed (0 in the default path). */
  retriesUsed: number;
  /** True if all retries were exhausted and the task was DLQ'd. */
  dlq: boolean;
}

@Injectable()
export class ConcurrentOrchestrator {
  private readonly logger = new Logger(ConcurrentOrchestrator.name);
  private readonly options: Required<ConcurrentOrchestratorOptions>;
  private readonly queue: ConcurrencyQueue;
  private dlqCount = 0;

  constructor(
    private readonly cascadeOrchestrator: CascadeOrchestrator,
    private readonly sessionContextFactory: SessionContextFactory,
    @Optional()
    @Inject(LOG_REPOSITORY)
    private readonly logRepository?: ILogRepository,
    @Optional()
    @Inject(CONCURRENT_ORCHESTRATOR_OPTIONS)
    options?: ConcurrentOrchestratorOptions,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    this.queue = new ConcurrencyQueue(this.options.concurrency);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Submit a single ticket.  Resolves with the outcome envelope
   * whether the cascade succeeded, failed, or was DLQ'd.  Never
   * rejects - callers that want "fire and collect later" semantics
   * should store the returned promise and not await it.
   */
  async submit(ticket: SubmitTicket): Promise<ConcurrentTaskResult> {
    const submittedAt = Date.now();
    const context = this.sessionContextFactory.build(ticket);

    this.appendLog({
      pipelineId: 'queue',
      ticketId: ticket.id,
      sessionId: context.sessionId,
      taskId: context.taskId,
      type: 'queue.submit',
      timestamp: submittedAt,
      payload: { priority: ticket.priority },
    });

    let queueWaitMs = 0;
    const taskResult = await this.queue
      .add<ConcurrentTaskResult>(async () => {
        queueWaitMs = Date.now() - submittedAt;
        this.appendLog({
          pipelineId: 'queue',
          ticketId: ticket.id,
          sessionId: context.sessionId,
          taskId: context.taskId,
          type: 'queue.start',
          timestamp: Date.now(),
          payload: { queueWaitMs },
        });
        return this.runWithRetries(ticket, context, submittedAt, queueWaitMs);
      })
      .catch((err) => this.buildRejectEnvelope(ticket, context, submittedAt, queueWaitMs, err));

    return taskResult;
  }

  /**
   * Submit many tickets concurrently.  Each ticket gets its own
   * envelope in the returned array; one failing ticket never aborts
   * the batch.  Order matches the input order.
   */
  async submitBatch(
    tickets: SubmitTicket[],
  ): Promise<ConcurrentTaskResult[]> {
    if (tickets.length === 0) return [];

    const batchStartedAt = Date.now();
    this.appendLog({
      pipelineId: 'queue',
      type: 'queue.batch.start',
      timestamp: batchStartedAt,
      payload: { count: tickets.length },
    });

    // Promise.all - ConcurrencyQueue inside .submit() already caps
    // parallelism, so we can fan all tickets in right away and let
    // the queue serialize them.
    const results = await Promise.all(tickets.map((t) => this.submit(t)));

    this.appendLog({
      pipelineId: 'queue',
      type: 'queue.batch.end',
      timestamp: Date.now(),
      payload: {
        count: tickets.length,
        successes: results.filter((r) => r.success).length,
        failures: results.filter((r) => !r.success && !r.dlq).length,
        dlq: results.filter((r) => r.dlq).length,
        durationMs: Date.now() - batchStartedAt,
      },
    });

    return results;
  }

  /** Snapshot of queue state for health endpoints (A.8 consumer). */
  stats(): ConcurrencyQueueStats & { dlq: number } {
    return { ...this.queue.stats(), dlq: this.dlqCount };
  }

  /** Waits until every in-flight + queued task completes.  Test helper. */
  async onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  // ---------------------------------------------------------------------------
  // Core task execution
  // ---------------------------------------------------------------------------

  private async runWithRetries(
    ticket: SubmitTicket,
    context: ISessionContext,
    submittedAt: number,
    queueWaitMs: number,
  ): Promise<ConcurrentTaskResult> {
    const startedAt = Date.now();
    const maxRetries = this.options.maxRetries;
    let retriesUsed = 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const cascadeResult = await this.cascadeOrchestrator.processTicket(context);
        retriesUsed = attempt;
        const envelope: ConcurrentTaskResult = {
          ticketId: ticket.id,
          sessionId: context.sessionId,
          taskId: context.taskId,
          success: cascadeResult.success,
          cascadeResult,
          durationMs: Date.now() - submittedAt,
          queueWaitMs,
          retriesUsed,
          dlq: false,
        };

        this.appendLog({
          pipelineId: 'queue',
          ticketId: ticket.id,
          sessionId: context.sessionId,
          taskId: context.taskId,
          type: cascadeResult.success ? 'queue.success' : 'queue.failure',
          timestamp: Date.now(),
          payload: {
            level: cascadeResult.level,
            source: cascadeResult.source,
            durationMs: envelope.durationMs,
            queueWaitMs,
            retriesUsed,
          },
        });

        return envelope;
      } catch (err) {
        lastError = err;
        retriesUsed = attempt;

        if (attempt < maxRetries) {
          this.appendLog({
            pipelineId: 'queue',
            ticketId: ticket.id,
            sessionId: context.sessionId,
            taskId: context.taskId,
            type: 'queue.retry',
            timestamp: Date.now(),
            payload: {
              attempt: attempt + 1,
              error: this.errorMessage(err),
            },
          });
          await this.sleep(this.options.retryDelayMs * (attempt + 1));
        }
      }
    }

    // All tries exhausted.  DLQ only applies when queue-level retry
    // was actually enabled - with maxRetries=0 we treat this as a
    // plain failure so callers do not need to re-check config to know
    // whether DLQ was in play.
    const isDlq = maxRetries > 0;
    if (isDlq) this.dlqCount++;
    const envelope: ConcurrentTaskResult = {
      ticketId: ticket.id,
      sessionId: context.sessionId,
      taskId: context.taskId,
      success: false,
      error: this.errorMessage(lastError),
      durationMs: Date.now() - submittedAt,
      queueWaitMs,
      retriesUsed,
      dlq: isDlq,
    };

    this.appendLog({
      pipelineId: 'queue',
      ticketId: ticket.id,
      sessionId: context.sessionId,
      taskId: context.taskId,
      type: maxRetries > 0 ? 'queue.dlq' : 'queue.failure',
      timestamp: Date.now(),
      payload: {
        error: envelope.error,
        retriesUsed,
        durationMs: envelope.durationMs,
      },
    });

    this.logger.warn(
      `Ticket "${ticket.id}" ${maxRetries > 0 ? 'sent to DLQ' : 'failed'} after ${retriesUsed} retries: ${envelope.error}`,
    );
    return envelope;
  }

  /**
   * Fallback envelope for the unlikely case that ConcurrencyQueue
   * itself rejects (e.g. an acquireSlot implementation bug).  Keeps
   * the `submit()` contract intact ("never reject").
   */
  private buildRejectEnvelope(
    ticket: SubmitTicket,
    context: ISessionContext,
    submittedAt: number,
    queueWaitMs: number,
    err: unknown,
  ): ConcurrentTaskResult {
    const message = this.errorMessage(err);
    this.logger.error(
      `Queue acquire failed for ticket "${ticket.id}": ${message}`,
    );
    return {
      ticketId: ticket.id,
      sessionId: context.sessionId,
      taskId: context.taskId,
      success: false,
      error: message,
      durationMs: Date.now() - submittedAt,
      queueWaitMs,
      retriesUsed: 0,
      dlq: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private appendLog(event: PipelineLogEvent): void {
    if (!this.logRepository) return;
    try {
      const maybePromise = this.logRepository.appendPipelineEvent(event);
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
        (maybePromise as Promise<void>).catch((err) =>
          this.logger.warn(
            `Queue log append rejected: ${this.errorMessage(err)}`,
          ),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Queue log append threw: ${this.errorMessage(err)}`,
      );
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
