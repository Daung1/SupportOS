/// <reference types="jest" />

import { HealthController } from './health.controller';
import { HealthService, HealthReport } from './health.service';

describe('HealthController', () => {
  it('delegates GET /api/health to HealthService.report()', () => {
    const stub: HealthReport = {
      status: 'ok',
      timestamp: '2026-04-24T00:00:00.000Z',
      uptimeMs: 12345,
      version: '0.0.1',
      queue: { active: 0, pending: 0, completed: 0, failed: 0, dlq: 0 },
      metrics: {
        windowSize: 100,
        sampledCount: 0,
        succeeded: 0,
        failed: 0,
        dlq: 0,
        errorRate: 0,
        latency: { avgMs: 0, p95Ms: 0 },
        totals: { succeeded: 0, failed: 0, dlq: 0 },
        uptimeMs: 12345,
      },
    };
    const svc = { report: jest.fn(() => stub) };
    const ctrl = new HealthController(svc as any);

    const result = ctrl.getHealth();
    expect(result).toBe(stub);
    expect(svc.report).toHaveBeenCalledTimes(1);
  });
});
