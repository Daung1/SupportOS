/**
 * HealthController - exposes `GET /api/health`.
 *
 * The controller is intentionally thin: it has no business logic of
 * its own and exists only to decorate `HealthService.report()` with
 * an HTTP route + Swagger metadata.  Load balancers / k8s probes can
 * poll this endpoint without authentication; if a future deployment
 * needs auth we will add a guard at this layer rather than inside
 * HealthService.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, HealthReport } from './health.service';

@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'System health check',
    description:
      'Returns queue depth, rolling-window latency / error rate, and an aggregate status flag (ok | degraded | unhealthy).',
  })
  getHealth(): HealthReport {
    return this.health.report();
  }
}
