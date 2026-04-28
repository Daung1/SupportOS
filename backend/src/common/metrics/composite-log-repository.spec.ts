/// <reference types="jest" />

import { CompositeLogRepository } from './composite-log-repository';
import { ILogRepository } from '../../agents/orchestrator/ports/orchestrator-ports';

function makeSink(): jest.Mocked<ILogRepository> {
  return {
    appendAgentStart: jest.fn(),
    appendAgentIteration: jest.fn(),
    appendAgentError: jest.fn(),
    appendAgentEnd: jest.fn(),
    appendPipelineEvent: jest.fn(),
  };
}

describe('CompositeLogRepository', () => {
  it('fans every method out to all subscribers', () => {
    const a = makeSink();
    const b = makeSink();
    const composite = new CompositeLogRepository([a, b]);

    composite.appendAgentStart({ agentName: 'x', timestamp: 0 } as any);
    composite.appendPipelineEvent({
      pipelineId: 'p',
      type: 'queue.start',
      timestamp: 0,
    });

    expect(a.appendAgentStart).toHaveBeenCalledTimes(1);
    expect(b.appendAgentStart).toHaveBeenCalledTimes(1);
    expect(a.appendPipelineEvent).toHaveBeenCalledTimes(1);
    expect(b.appendPipelineEvent).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not stop sibling subscribers', () => {
    const broken = makeSink();
    broken.appendAgentEnd.mockImplementation(() => {
      throw new Error('disk full');
    });
    const healthy = makeSink();
    const logger = { warn: jest.fn() } as any;
    const composite = new CompositeLogRepository([broken, healthy], logger);

    expect(() =>
      composite.appendAgentEnd({ agentName: 'x', timestamp: 0 } as any),
    ).not.toThrow();

    expect(healthy.appendAgentEnd).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('async-rejecting subscriber does not crash the fan-out', async () => {
    const broken = makeSink();
    broken.appendPipelineEvent.mockImplementation(
      () => Promise.reject(new Error('db down')) as any,
    );
    const healthy = makeSink();
    const logger = { warn: jest.fn() } as any;
    const composite = new CompositeLogRepository([broken, healthy], logger);

    composite.appendPipelineEvent({
      pipelineId: 'p',
      type: 'queue.success',
      timestamp: 0,
    });

    expect(healthy.appendPipelineEvent).toHaveBeenCalledTimes(1);
    // Microtask drain - the catch handler attached by composite must
    // run so the promise does not become an unhandled rejection.
    await new Promise((r) => setImmediate(r));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('routes failure diagnostics through the StructuredLogger when provided', () => {
    const broken = makeSink();
    broken.appendAgentStart.mockImplementation(() => {
      throw new Error('explode');
    });
    const logger = { warn: jest.fn() } as any;
    const composite = new CompositeLogRepository([broken], logger);

    composite.appendAgentStart({ agentName: 'x', timestamp: 0 } as any);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('Log sink');
  });

  it('falls back to console.warn when no StructuredLogger is supplied', () => {
    const broken = makeSink();
    broken.appendAgentStart.mockImplementation(() => {
      throw new Error('explode');
    });
    const composite = new CompositeLogRepository([broken]);
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    try {
      composite.appendAgentStart({ agentName: 'x', timestamp: 0 } as any);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('CompositeLogRepository');
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});
