/**
 * CompositeLogRepository - fans every ILogRepository call out to a
 * fixed list of subscribers.
 *
 * Why this exists: the orchestrator stack only knows the single
 * `LOG_REPOSITORY` DI token, but at runtime we want at least two
 * sinks (Winston for grep-friendly stdout + MetricsCollector for the
 * health endpoint), and a third sink (Prisma `TicketLogRepository`)
 * will join in Phase B.  Rather than retrofit a multi-port pattern
 * into every orchestrator, we expose this composite as the single
 * `LOG_REPOSITORY` provider and let it deal with the fan-out.
 *
 * Design notes:
 *
 * - Each subscriber's call is wrapped in try/catch so a buggy or
 *   slow sink can never break a sibling sink or the orchestrator.
 *   A failure is forwarded to the StructuredLogger if available,
 *   otherwise written to console.warn (we cannot let logging
 *   failures cascade).
 *
 * - Async sinks (returning Promise) are detected and their
 *   rejections attached so unhandled-promise warnings are not
 *   triggered.  We do NOT await them - the log fan-out has to be
 *   fire-and-forget on the orchestrator hot path.
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
import { StructuredLogger } from '../logger/structured-logger.service';

@Injectable()
export class CompositeLogRepository implements ILogRepository {
  constructor(
    private readonly subscribers: ILogRepository[],
    private readonly logger?: StructuredLogger,
  ) {}

  appendAgentStart(event: AgentStartEvent): void {
    this.fanOut('appendAgentStart', (s) => s.appendAgentStart(event));
  }

  appendAgentIteration(event: AgentIterationEvent): void {
    this.fanOut('appendAgentIteration', (s) => s.appendAgentIteration(event));
  }

  appendAgentError(event: AgentErrorEvent): void {
    this.fanOut('appendAgentError', (s) => s.appendAgentError(event));
  }

  appendAgentEnd(event: AgentEndEvent): void {
    this.fanOut('appendAgentEnd', (s) => s.appendAgentEnd(event));
  }

  appendPipelineEvent(event: PipelineLogEvent): void {
    this.fanOut('appendPipelineEvent', (s) => s.appendPipelineEvent(event));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private fanOut(
    method: string,
    invoke: (subscriber: ILogRepository) => void | Promise<void>,
  ): void {
    for (const subscriber of this.subscribers) {
      try {
        const maybe = invoke(subscriber);
        if (maybe && typeof (maybe as Promise<void>).catch === 'function') {
          (maybe as Promise<void>).catch((err) =>
            this.warnSinkFailure(method, subscriber, err),
          );
        }
      } catch (err) {
        this.warnSinkFailure(method, subscriber, err);
      }
    }
  }

  private warnSinkFailure(
    method: string,
    subscriber: ILogRepository,
    err: unknown,
  ): void {
    const name = (subscriber as any)?.constructor?.name ?? 'Unknown';
    const message = err instanceof Error ? err.message : String(err);
    if (this.logger) {
      this.logger.warn(`Log sink "${name}" failed for ${method}`, {
        context: 'CompositeLogRepository',
        sink: name,
        method,
        error: message,
      });
    } else {
      // Last-resort fallback - StructuredLogger not wired in this test.
      console.warn(
        `[CompositeLogRepository] Log sink "${name}" failed for ${method}: ${message}`,
      );
    }
  }
}
