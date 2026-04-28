/// <reference types="jest" />

import { HealthService } from './health.service';
import { MetricsCollector } from '../common/metrics/metrics.collector';
import { ConcurrentOrchestrator } from '../queue/concurrent-orchestrator.service';

function fakeOrchestrator(stats: {
  active: number;
  pending: number;
  completed: number;
  failed: number;
  dlq: number;
}): ConcurrentOrchestrator {
  return { stats: () => stats } as any;
}

describe('HealthService', () => {
  it('reports status=ok on a quiet system', () => {
    const orch = fakeOrchestrator({
      active: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      dlq: 0,
    });
    const metrics = new MetricsCollector();
    const svc = new HealthService(orch, metrics);

    const report = svc.report();
    expect(report.status).toBe('ok');
    expect(report.queue.pending).toBe(0);
    expect(report.metrics.sampledCount).toBe(0);
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('flips to degraded when errorRate is between 0.1 and 0.5', () => {
    const orch = fakeOrchestrator({
      active: 1,
      pending: 0,
      completed: 0,
      failed: 0,
      dlq: 0,
    });
    const metrics = new MetricsCollector();
    // 8 success + 2 failure -> errorRate 0.2 -> degraded
    for (let i = 0; i < 8; i++) {
      metrics.appendPipelineEvent({
        pipelineId: 'q',
        ticketId: `s${i}`,
        type: 'queue.start',
        timestamp: 0,
      });
      metrics.appendPipelineEvent({
        pipelineId: 'q',
        ticketId: `s${i}`,
        type: 'queue.success',
        timestamp: 100,
      });
    }
    for (let i = 0; i < 2; i++) {
      metrics.appendPipelineEvent({
        pipelineId: 'q',
        ticketId: `f${i}`,
        type: 'queue.start',
        timestamp: 0,
      });
      metrics.appendPipelineEvent({
        pipelineId: 'q',
        ticketId: `f${i}`,
        type: 'queue.failure',
        timestamp: 100,
      });
    }

    const svc = new HealthService(orch, metrics);
    const report = svc.report();
    expect(report.metrics.errorRate).toBeCloseTo(0.2, 5);
    expect(report.status).toBe('degraded');
  });

  it('flips to unhealthy when DLQ has occurred in the window', () => {
    const orch = fakeOrchestrator({
      active: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      dlq: 1,
    });
    const metrics = new MetricsCollector();
    metrics.appendPipelineEvent({
      pipelineId: 'q',
      ticketId: 'd1',
      type: 'queue.start',
      timestamp: 0,
    });
    metrics.appendPipelineEvent({
      pipelineId: 'q',
      ticketId: 'd1',
      type: 'queue.dlq',
      timestamp: 100,
    });

    const svc = new HealthService(orch, metrics);
    expect(svc.report().status).toBe('unhealthy');
  });

  it('flips to unhealthy when errorRate >= 0.5', () => {
    const orch = fakeOrchestrator({
      active: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      dlq: 0,
    });
    const metrics = new MetricsCollector();
    for (let i = 0; i < 3; i++) {
      metrics.appendPipelineEvent({
        pipelineId: 'q',
        ticketId: `f${i}`,
        type: 'queue.failure',
        timestamp: 100,
      });
    }
    metrics.appendPipelineEvent({
      pipelineId: 'q',
      ticketId: 's1',
      type: 'queue.success',
      timestamp: 100,
    });

    const svc = new HealthService(orch, metrics);
    expect(svc.report().status).toBe('unhealthy');
  });

  it('queue payload mirrors ConcurrentOrchestrator.stats() including DLQ', () => {
    const orch = fakeOrchestrator({
      active: 2,
      pending: 7,
      completed: 1234,
      failed: 5,
      dlq: 3,
    });
    const svc = new HealthService(orch, new MetricsCollector());
    const report = svc.report();
    expect(report.queue).toEqual({
      active: 2,
      pending: 7,
      completed: 1234,
      failed: 5,
      dlq: 3,
    });
  });
});
