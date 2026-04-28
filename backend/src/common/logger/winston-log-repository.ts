/**
 * WinstonLogRepository - implements ILogRepository by writing each
 * orchestrator event as a structured Winston log line.
 *
 * Why: A.8 ships before the Prisma-backed `TicketLogRepository`
 * (Phase B.2) lands.  The plumbing in MultiAgentOrchestrator,
 * CascadeOrchestrator and ConcurrentOrchestrator already calls into
 * an `@Optional() ILogRepository`; pointing that port at this
 * Winston-backed adapter means TAO / cascade / queue events become
 * grep-friendly stdout lines immediately, no DB required.
 *
 * When B.2 lands we will switch `LOG_REPOSITORY` to a `Composite`
 * provider that fans events out to BOTH this Winston adapter and the
 * Prisma adapter, so the structured stream stays available for Loki /
 * Datadog ingestion in production.
 *
 * Mapping rules (kept symmetric so the JSON shape is predictable):
 *
 *   agent.start / agent.end  -> info
 *   agent.iteration          -> debug   (these are very chatty)
 *   agent.error              -> error
 *   pipeline.* / cascade.* / queue.* -> info, plus level "warn"
 *     when the type ends in "_miss" / "failure" / "dlq" / "error".
 *
 * The full event object (minus the discriminator) is splatted into
 * the structured payload so downstream tools can index any field.
 */

import { Injectable } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.service';
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

@Injectable()
export class WinstonLogRepository implements ILogRepository {
  constructor(private readonly logger: StructuredLogger) {}

  appendAgentStart(event: AgentStartEvent): void {
    this.logger.info('agent.start', {
      context: 'Agent',
      correlationId: event.ticketId,
      eventType: 'agent.start',
      ...event,
    });
  }

  appendAgentIteration(event: AgentIterationEvent): void {
    this.logger.debug('agent.iteration', {
      context: 'Agent',
      correlationId: event.ticketId,
      eventType: 'agent.iteration',
      ...event,
    });
  }

  appendAgentError(event: AgentErrorEvent): void {
    this.logger.error('agent.error', {
      context: 'Agent',
      correlationId: event.ticketId,
      eventType: 'agent.error',
      ...event,
    });
  }

  appendAgentEnd(event: AgentEndEvent): void {
    this.logger.info('agent.end', {
      context: 'Agent',
      correlationId: event.ticketId,
      eventType: 'agent.end',
      ...event,
    });
  }

  appendPipelineEvent(event: PipelineLogEvent): void {
    const level = WinstonLogRepository.levelFor(event.type);
    this.logger.log(level, event.type, {
      context: WinstonLogRepository.contextFor(event.type),
      correlationId: event.ticketId,
      eventType: event.type,
      ...event,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal classifiers
  // ---------------------------------------------------------------------------

  /** "warn" for explicit failure-shape events, "info" otherwise. */
  private static levelFor(type: PipelineLogEvent['type']): 'info' | 'warn' {
    if (
      type === 'pipeline.error' ||
      type === 'cascade.error' ||
      type === 'queue.failure' ||
      type === 'queue.retry' ||
      type === 'queue.dlq'
    ) {
      return 'warn';
    }
    return 'info';
  }

  /** Subsystem tag used by log readers and dashboards. */
  private static contextFor(type: PipelineLogEvent['type']): string {
    if (type.startsWith('cascade.')) return 'Cascade';
    if (type.startsWith('queue.')) return 'Queue';
    return 'Pipeline';
  }
}
