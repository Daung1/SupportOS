/**
 * HealthModule - wires HealthController + HealthService.
 *
 * Imports QueueModule because HealthService injects
 * ConcurrentOrchestrator, and depends on the global MetricsModule
 * for the MetricsCollector.  MetricsModule is `@Global()`, so we
 * only have to ensure it is imported once at the root (AppModule).
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
