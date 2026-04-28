/**
 * StructuredLogger - thin facade over Winston that always emits JSON
 * lines with a fixed envelope:
 *
 *   { timestamp, level, message, context, correlationId, ...extra }
 *
 * `correlationId` defaults to the ticketId (set via `withCorrelationId`)
 * so a single ticket's lifecycle can be grepped end-to-end across the
 * orchestrator stack.  `context` is a free-form short tag identifying
 * the emitting subsystem (`Cascade`, `Queue`, `Pipeline`, etc.); it is
 * conceptually the same as Nest's built-in `Logger` "context" but is
 * persisted as a structured field rather than coloured stdout text.
 *
 * Design notes:
 *
 * - Winston is configured once at module load (see `createWinston`).
 *   The transport list is intentionally minimal (stdout-only) - the
 *   programplan defers file/Loki/Elasticsearch sinks to "future
 *   extension".  Adding a transport is a one-line change in
 *   `createWinston`.
 *
 * - The class is `@Injectable()` and exported from a `@Global()`
 *   module so any service can `constructor(logger: StructuredLogger)`
 *   without re-importing the module.
 *
 * - `child()` returns a *plain* StructuredLogger sharing the same
 *   underlying Winston instance but with merged default fields, so
 *   passing a child into a long-lived service does not multiply
 *   transports.
 */

import { Injectable } from '@nestjs/common';
import * as winston from 'winston';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  /** Subsystem tag (e.g. "Cascade", "Queue").  Free-form. */
  context?: string;
  /** Per-ticket correlation id (== ticketId) for cross-component tracing. */
  correlationId?: string;
  /** Any other structured fields callers want to attach. */
  [key: string]: any;
}

let cachedWinston: winston.Logger | null = null;

function createWinston(): winston.Logger {
  if (cachedWinston) return cachedWinston;
  cachedWinston = winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    // The format pipeline collapses all metadata into a JSON line so
    // downstream tooling (jq / Datadog / Loki) can index any field.
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        // Avoid Winston's default coloriser - JSON lines should stay
        // machine-readable in containerised environments.
        format: winston.format.json(),
        // Send EVERYTHING (including errors) to stdout; stderr is
        // reserved for the runtime to flag actually-fatal events.
        stderrLevels: [],
      }),
    ],
  });
  return cachedWinston;
}

/** Test-only hook: drop the cached singleton so a spec can rewire transports. */
export function _resetWinstonForTests(): void {
  cachedWinston = null;
}

@Injectable()
export class StructuredLogger {
  private readonly winston: winston.Logger;
  private readonly defaults: LogFields;

  constructor(defaults: LogFields = {}, instance?: winston.Logger) {
    this.winston = instance ?? createWinston();
    this.defaults = defaults;
  }

  // ---------------------------------------------------------------------------
  // Level helpers
  // ---------------------------------------------------------------------------

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }

  log(level: LogLevel, message: string, fields?: LogFields): void {
    this.emit(level, message, fields);
  }

  // ---------------------------------------------------------------------------
  // Scoping
  // ---------------------------------------------------------------------------

  /**
   * Returns a logger pre-bound with extra default fields.  Used by the
   * orchestrators / cascade / queue layers to attach `correlationId`
   * once per ticket and forget about it.
   */
  child(extra: LogFields): StructuredLogger {
    return new StructuredLogger(
      { ...this.defaults, ...extra },
      this.winston,
    );
  }

  /** Convenience: child logger bound to a single ticketId. */
  withCorrelationId(correlationId: string): StructuredLogger {
    return this.child({ correlationId });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    // Winston accepts arbitrary metadata as the second arg; the json
    // formatter splats them into the top-level envelope.
    this.winston.log(level, message, { ...this.defaults, ...(fields ?? {}) });
  }
}
