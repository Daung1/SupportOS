/// <reference types="jest" />

/**
 * StructuredLogger tests focus on the wrapper contract, not on
 * Winston itself.  We replace the underlying winston instance with a
 * stub that captures every call so we can assert the merged-fields
 * envelope.
 */

import { StructuredLogger } from './structured-logger.service';

interface CapturedCall {
  level: string;
  message: string;
  meta: Record<string, any>;
}

function makeWinstonStub(): {
  log: jest.Mock;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const log = jest.fn((level: string, message: string, meta: any) => {
    calls.push({ level, message, meta });
  });
  return { log, calls };
}

function buildLogger(defaults: Record<string, any> = {}) {
  const winstonStub = makeWinstonStub();
  const logger = new StructuredLogger(defaults, winstonStub as any);
  return { logger, winstonStub };
}

describe('StructuredLogger', () => {
  describe('Level helpers', () => {
    it('routes info() to winston.log("info", ...)', () => {
      const { logger, winstonStub } = buildLogger();
      logger.info('hello', { x: 1 });
      expect(winstonStub.log).toHaveBeenCalledTimes(1);
      expect(winstonStub.calls[0]).toEqual({
        level: 'info',
        message: 'hello',
        meta: { x: 1 },
      });
    });

    it('supports debug / warn / error', () => {
      const { logger, winstonStub } = buildLogger();
      logger.debug('d');
      logger.warn('w');
      logger.error('e');
      expect(winstonStub.calls.map((c) => c.level)).toEqual([
        'debug',
        'warn',
        'error',
      ]);
    });

    it('log(level, ...) is a generic dispatcher', () => {
      const { logger, winstonStub } = buildLogger();
      logger.log('warn', 'generic');
      expect(winstonStub.calls[0].level).toBe('warn');
      expect(winstonStub.calls[0].message).toBe('generic');
    });
  });

  describe('Default fields + child()', () => {
    it('always merges instance-level defaults into meta', () => {
      const { logger, winstonStub } = buildLogger({ context: 'Cascade' });
      logger.info('hit', { ticketId: 't1' });
      expect(winstonStub.calls[0].meta).toEqual({
        context: 'Cascade',
        ticketId: 't1',
      });
    });

    it('child() inherits + extends defaults without mutating parent', () => {
      const { logger, winstonStub } = buildLogger({ context: 'Cascade' });
      const child = logger.child({ correlationId: 'tkt-99' });
      child.info('inside child');
      logger.info('outside child');

      expect(winstonStub.calls).toHaveLength(2);
      expect(winstonStub.calls[0].meta).toEqual({
        context: 'Cascade',
        correlationId: 'tkt-99',
      });
      expect(winstonStub.calls[1].meta).toEqual({
        context: 'Cascade',
      });
    });

    it('withCorrelationId(id) is shorthand for child({ correlationId: id })', () => {
      const { logger, winstonStub } = buildLogger();
      logger.withCorrelationId('tkt-7').info('check');
      expect(winstonStub.calls[0].meta).toEqual({ correlationId: 'tkt-7' });
    });

    it('per-call fields override defaults if both keys are present', () => {
      const { logger, winstonStub } = buildLogger({ context: 'A' });
      logger.info('hi', { context: 'B' });
      expect(winstonStub.calls[0].meta).toEqual({ context: 'B' });
    });
  });
});
