/**
 * MetricsModule (Global) - registers MetricsCollector + the global
 * `LOG_REPOSITORY` provider.
 *
 * Wiring:
 *
 *   LOG_REPOSITORY  ->  CompositeLogRepository(
 *                         [WinstonLogRepository, MetricsCollector],
 *                         StructuredLogger,
 *                       )
 *
 * Why a useFactory: the composite needs concrete instances of the
 * two sinks at construction time.  Nest's factory pattern is the
 * cleanest way to assemble that without exposing the composite to
 * every feature module's import list.
 *
 * The module is `@Global()` because the LOG_REPOSITORY is consumed
 * by orchestrators living in many feature modules - making it global
 * avoids re-importing MetricsModule in each.
 */

import { Global, Module } from '@nestjs/common';
import { LOG_REPOSITORY } from '../../agents/orchestrator/ports/orchestrator-ports';
import {
  StructuredLogger,
  WinstonLogRepository,
} from '../logger';
import { MetricsCollector } from './metrics.collector';
import { CompositeLogRepository } from './composite-log-repository';

@Global()
@Module({
  providers: [
    {
      provide: MetricsCollector,
      useFactory: () => new MetricsCollector(),
    },
    {
      provide: LOG_REPOSITORY,
      useFactory: (
        winston: WinstonLogRepository,
        metrics: MetricsCollector,
        logger: StructuredLogger,
      ) => new CompositeLogRepository([winston, metrics], logger),
      inject: [WinstonLogRepository, MetricsCollector, StructuredLogger],
    },
  ],
  exports: [MetricsCollector, LOG_REPOSITORY],
})
export class MetricsModule {}
