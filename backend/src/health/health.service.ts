/**
 * HealthService - assembles the JSON payload returned by
 * `GET /api/health`.
 *
 * It pulls together three independent sources:
 *
 *   - ConcurrentOrchestrator.stats()  current queue depth + DLQ count
 *   - MetricsCollector.snapshot()     rolling-window latency / error rate
 *   - process.uptime / package version environment info
 *
 * Status classification (least-bad rule wins):
 *
 *   ok        when errorRate < 0.1 AND queue.pending < concurrency * 5
 *   degraded  when errorRate in [0.1, 0.5) OR queue.pending is high
 *   unhealthy when errorRate >= 0.5 OR DLQ has grown in the window
 *
 * Why no DB / Gemini ping here: those are external dependencies and
 * a slow ping would block the health endpoint that load balancers
 * poll every few seconds.  Phase B will add a `/api/health/live` vs
 * `/api/health/ready` split if a deeper check is needed.
 */

import { Injectable } from '@nestjs/common';
import { ConcurrentOrchestrator } from '../queue/concurrent-orchestrator.service';
import { MetricsCollector, MetricsSnapshot } from '../common/metrics/metrics.collector';
import { ConcurrencyQueueStats } from '../queue/concurrency-queue';

export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  uptimeMs: number;
  version: string;
  queue: ConcurrencyQueueStats & { dlq: number };
  metrics: MetricsSnapshot;
}

@Injectable()
export class HealthService {
  private readonly version: string;

  constructor(
    private readonly concurrent: ConcurrentOrchestrator,
    private readonly metrics: MetricsCollector,
  ) {
    // Read once at startup; package.json is static at runtime.
    this.version = process.env.npm_package_version ?? '0.0.0';
  }

  report(): HealthReport {
    const queue = this.concurrent.stats();
    const metrics = this.metrics.snapshot();
    const status = HealthService.classify(queue, metrics);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeMs: metrics.uptimeMs,
      version: this.version,
      queue,
      metrics,
    };
  }

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  private static classify(
    queue: ConcurrencyQueueStats & { dlq: number },
    metrics: MetricsSnapshot,
  ): HealthStatus {
    if (metrics.errorRate >= 0.5) return 'unhealthy';
    if (metrics.dlq > 0) return 'unhealthy';

    // "Pending way past concurrency" is a soft signal that we are
    // backing up.  We use 5x concurrency as the degraded threshold:
    // at concurrency=5 that means 25 queued tickets, which is much
    // more than an idle system but well below an outage.
    const isQueueHot = queue.pending >= queue.active * 5 && queue.pending >= 25;
    if (metrics.errorRate >= 0.1 || isQueueHot) return 'degraded';

    return 'ok';
  }
}
