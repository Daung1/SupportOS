/// <reference types="jest" />

import { MetricsCollector } from './metrics.collector';
import { PipelineLogEvent } from '../../agents/orchestrator/ports/orchestrator-ports';

function start(c: MetricsCollector, ticketId: string, ts = 1000) {
  c.appendPipelineEvent({
    pipelineId: 'queue',
    ticketId,
    type: 'queue.start',
    timestamp: ts,
  });
}

function success(c: MetricsCollector, ticketId: string, ts = 1100) {
  c.appendPipelineEvent({
    pipelineId: 'queue',
    ticketId,
    type: 'queue.success',
    timestamp: ts,
  });
}

function failure(c: MetricsCollector, ticketId: string, ts = 1100) {
  c.appendPipelineEvent({
    pipelineId: 'queue',
    ticketId,
    type: 'queue.failure',
    timestamp: ts,
  });
}

function dlq(c: MetricsCollector, ticketId: string, ts = 1200) {
  c.appendPipelineEvent({
    pipelineId: 'queue',
    ticketId,
    type: 'queue.dlq',
    timestamp: ts,
  });
}

describe('MetricsCollector', () => {
  it('returns a zeroed snapshot when no events have been recorded', () => {
    const c = new MetricsCollector();
    const snap = c.snapshot();
    expect(snap.sampledCount).toBe(0);
    expect(snap.errorRate).toBe(0);
    expect(snap.latency.avgMs).toBe(0);
    expect(snap.latency.p95Ms).toBe(0);
    expect(snap.totals).toEqual({ succeeded: 0, failed: 0, dlq: 0 });
  });

  it('captures duration as endTs - startTs when both are seen', () => {
    const c = new MetricsCollector();
    start(c, 't1', 1000);
    success(c, 't1', 1250);
    const snap = c.snapshot();
    expect(snap.sampledCount).toBe(1);
    expect(snap.succeeded).toBe(1);
    expect(snap.latency.avgMs).toBe(250);
    expect(snap.latency.p95Ms).toBe(250);
    expect(snap.errorRate).toBe(0);
  });

  it('errorRate = (failed + dlq) / sampledCount', () => {
    const c = new MetricsCollector();
    for (let i = 0; i < 7; i++) {
      start(c, `s${i}`, 1000);
      success(c, `s${i}`, 1100);
    }
    for (let i = 0; i < 2; i++) {
      start(c, `f${i}`, 1000);
      failure(c, `f${i}`, 1100);
    }
    start(c, 'd1', 1000);
    dlq(c, 'd1', 1100);

    const snap = c.snapshot();
    expect(snap.sampledCount).toBe(10);
    expect(snap.succeeded).toBe(7);
    expect(snap.failed).toBe(2);
    expect(snap.dlq).toBe(1);
    expect(snap.errorRate).toBeCloseTo(0.3, 5);
  });

  it('rolls over when more than windowSize tasks have completed', () => {
    const c = new MetricsCollector(3);
    for (let i = 0; i < 5; i++) {
      start(c, `t${i}`, 1000);
      success(c, `t${i}`, 1010 + i);
    }
    const snap = c.snapshot();
    expect(snap.sampledCount).toBe(3);
    // Lifetime totals MUST keep counting past the window edge
    expect(snap.totals.succeeded).toBe(5);
  });

  it('p95 picks the highest sample for a 5-element window when q=0.95', () => {
    const c = new MetricsCollector();
    [50, 100, 150, 200, 1000].forEach((dur, i) => {
      start(c, `t${i}`, 0);
      success(c, `t${i}`, dur);
    });
    const snap = c.snapshot();
    expect(snap.latency.p95Ms).toBe(1000);
    // Mean is rounded
    expect(snap.latency.avgMs).toBe(Math.round((50 + 100 + 150 + 200 + 1000) / 5));
  });

  it('records a degenerate duration of 0 when queue.start was never seen', () => {
    const c = new MetricsCollector();
    failure(c, 'orphan', 9000);
    const snap = c.snapshot();
    expect(snap.sampledCount).toBe(1);
    expect(snap.failed).toBe(1);
    expect(snap.latency.avgMs).toBe(0);
  });

  it('ignores agent.* and pipeline.* events (no rolling-window pollution)', () => {
    const c = new MetricsCollector();
    c.appendAgentStart({ agentName: 'a', timestamp: 0 } as any);
    c.appendAgentEnd({ agentName: 'a', timestamp: 1 } as any);
    c.appendPipelineEvent({
      pipelineId: 'p',
      type: 'pipeline.start',
      timestamp: 0,
    });
    c.appendPipelineEvent({
      pipelineId: 'p',
      type: 'cascade.level1_hit',
      timestamp: 0,
    });
    expect(c.snapshot().sampledCount).toBe(0);
  });

  it('reset() empties window + lifetime totals (test helper)', () => {
    const c = new MetricsCollector();
    start(c, 't1');
    success(c, 't1');
    expect(c.snapshot().sampledCount).toBe(1);
    c.reset();
    expect(c.snapshot().sampledCount).toBe(0);
    expect(c.snapshot().totals.succeeded).toBe(0);
  });

  it('throws on windowSize < 1', () => {
    expect(() => new MetricsCollector(0)).toThrow(/windowSize/);
  });
});
