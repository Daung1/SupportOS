/**
 * LoggerModule (Global) - exposes:
 *
 *   - StructuredLogger      Winston-backed logger any service can inject
 *   - WinstonLogRepository  ILogRepository implementation built on top
 *                           of StructuredLogger
 *
 * The module is `@Global()` so consumers do not have to re-import it
 * in every feature module - StructuredLogger is the cross-cutting
 * "default" logger of the system.
 *
 * The wiring of `LOG_REPOSITORY` itself happens in `MetricsModule`
 * (so the composite fan-out lives next to the metrics collector); we
 * still export `WinstonLogRepository` from here so the composite has
 * a concrete instance to call.
 */

import { Global, Module } from '@nestjs/common';
import { StructuredLogger } from './structured-logger.service';
import { WinstonLogRepository } from './winston-log-repository';

@Global()
@Module({
  providers: [StructuredLogger, WinstonLogRepository],
  exports: [StructuredLogger, WinstonLogRepository],
})
export class LoggerModule {}
