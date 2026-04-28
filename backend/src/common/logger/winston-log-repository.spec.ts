/// <reference types="jest" />

import { WinstonLogRepository } from './winston-log-repository';
import { StructuredLogger } from './structured-logger.service';
import { PipelineLogEvent } from '../../agents/orchestrator/ports/orchestrator-ports';

interface CapturedCall {
  level: string;
  message: string;
  meta: Record<string, any>;
}

function buildAdapter() {
  const calls: CapturedCall[] = [];
  const winstonStub = {
    log: jest.fn((level: string, message: string, meta: any) => {
      calls.push({ level, message, meta });
    }),
  };
  const logger = new StructuredLogger({}, winstonStub as any);
  const repo = new WinstonLogRepository(logger);
  return { repo, calls };
}

describe('WinstonLogRepository', () => {
  describe('Agent events', () => {
    it('appendAgentStart logs at info level with agent context + ticket correlation', () => {
      const { repo, calls } = buildAdapter();
      repo.appendAgentStart({
        agentName: 'analyzer',
        sessionId: 's1',
        taskId: 't1',
        ticketId: 'tkt-9',
        timestamp: 1000,
      } as any);

      expect(calls).toHaveLength(1);
      expect(calls[0].level).toBe('info');
      expect(calls[0].message).toBe('agent.start');
      expect(calls[0].meta).toMatchObject({
        context: 'Agent',
        correlationId: 'tkt-9',
        eventType: 'agent.start',
      });
    });

    it('appendAgentIteration logs at debug level (kept off info to reduce noise)', () => {
      const { repo, calls } = buildAdapter();
      repo.appendAgentIteration({
        agentName: 'searcher',
        sessionId: 's1',
        taskId: 't1',
        ticketId: 'tkt-10',
        iteration: 1,
        timestamp: 1001,
      } as any);
      expect(calls[0].level).toBe('debug');
      expect(calls[0].meta.eventType).toBe('agent.iteration');
    });

    it('appendAgentError logs at error level', () => {
      const { repo, calls } = buildAdapter();
      repo.appendAgentError({
        agentName: 'generator',
        sessionId: 's2',
        taskId: 't2',
        ticketId: 'tkt-11',
        error: 'boom',
        timestamp: 1002,
      } as any);
      expect(calls[0].level).toBe('error');
    });
  });

  describe('Pipeline / cascade / queue events', () => {
    function fire(type: PipelineLogEvent['type']): CapturedCall {
      const { repo, calls } = buildAdapter();
      repo.appendPipelineEvent({
        pipelineId: 'p',
        type,
        ticketId: 'tkt-1',
        timestamp: 5,
      });
      return calls[0];
    }

    it('routes failure-shaped events to warn level', () => {
      expect(fire('queue.failure').level).toBe('warn');
      expect(fire('queue.dlq').level).toBe('warn');
      expect(fire('queue.retry').level).toBe('warn');
      expect(fire('cascade.error').level).toBe('warn');
      expect(fire('pipeline.error').level).toBe('warn');
    });

    it('routes happy-path events to info level', () => {
      expect(fire('queue.start').level).toBe('info');
      expect(fire('queue.success').level).toBe('info');
      expect(fire('cascade.level1_hit').level).toBe('info');
      expect(fire('cascade.level2_miss').level).toBe('info');
      expect(fire('pipeline.start').level).toBe('info');
    });

    it('tags context based on event prefix', () => {
      expect(fire('cascade.start').meta.context).toBe('Cascade');
      expect(fire('queue.submit').meta.context).toBe('Queue');
      expect(fire('pipeline.start').meta.context).toBe('Pipeline');
    });

    it('preserves the original event payload as structured meta', () => {
      const { repo, calls } = buildAdapter();
      repo.appendPipelineEvent({
        pipelineId: 'p1',
        type: 'queue.success',
        ticketId: 'tkt-77',
        sessionId: 'sess-1',
        timestamp: 999,
        payload: { durationMs: 42 },
      });
      expect(calls[0].meta).toMatchObject({
        eventType: 'queue.success',
        pipelineId: 'p1',
        sessionId: 'sess-1',
        payload: { durationMs: 42 },
        correlationId: 'tkt-77',
      });
    });
  });
});
