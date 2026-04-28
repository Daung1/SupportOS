import { TokenTracker } from './token-tracker.service';
import { TokenRecord } from './token-recorder.interface';

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  function row(partial: Partial<TokenRecord>): TokenRecord {
    return {
      sessionId: 'sess-1',
      agentName: 'Analyzer',
      ticketId: 'ticket-1',
      model: 'gemini-2.5-flash-lite',
      inputTokens: 1000,
      outputTokens: 500,
      timestamp: Date.now(),
      ...partial,
    };
  }

  describe('record', () => {
    it('stores a row under the given sessionId', () => {
      tracker.record(row({}));
      const snap = tracker.getUsage('sess-1');
      expect(snap.rows).toHaveLength(1);
      expect(snap.inputTokens).toBe(1000);
      expect(snap.outputTokens).toBe(500);
      expect(snap.totalTokens).toBe(1500);
    });

    it('accumulates multiple rows for the same session', () => {
      tracker.record(row({ inputTokens: 1000, outputTokens: 500 }));
      tracker.record(row({ inputTokens: 2000, outputTokens: 1500, agentName: 'Generator' }));
      const snap = tracker.getUsage('sess-1');
      expect(snap.rows).toHaveLength(2);
      expect(snap.inputTokens).toBe(3000);
      expect(snap.outputTokens).toBe(2000);
    });

    it('keeps rows from different sessions isolated', () => {
      tracker.record(row({ sessionId: 'sess-1', inputTokens: 100 }));
      tracker.record(row({ sessionId: 'sess-2', inputTokens: 999 }));
      expect(tracker.getUsage('sess-1').inputTokens).toBe(100);
      expect(tracker.getUsage('sess-2').inputTokens).toBe(999);
      expect(tracker.sessionCount()).toBe(2);
    });

    it('drops records with missing sessionId without throwing', () => {
      tracker.record(row({ sessionId: '' as any }));
      expect(tracker.sessionCount()).toBe(0);
    });
  });

  describe('flush', () => {
    it('returns an aggregate summary for a session', async () => {
      tracker.record(row({ inputTokens: 100_000, outputTokens: 50_000 }));
      const summary = await tracker.flush('sess-1');

      expect(summary).toBeDefined();
      expect(summary!.sessionId).toBe('sess-1');
      expect(summary!.inputTokens).toBe(100_000);
      expect(summary!.outputTokens).toBe(50_000);
      expect(summary!.totalTokens).toBe(150_000);
      // flash-lite: 0.1M input * $0.10/M = $0.01 + 0.05M output * $0.40/M = $0.02 = $0.03
      expect(summary!.costUsd).toBeCloseTo(0.03, 6);
    });

    it('evicts the session after flushing', async () => {
      tracker.record(row({}));
      expect(tracker.sessionCount()).toBe(1);
      await tracker.flush('sess-1');
      expect(tracker.sessionCount()).toBe(0);
    });

    it('returns zeroed summary for unknown sessionIds', async () => {
      const summary = await tracker.flush('ghost-session');
      expect(summary).toEqual({
        sessionId: 'ghost-session',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      });
    });

    it('double-flush returns zeros on the second call', async () => {
      tracker.record(row({ inputTokens: 1000, outputTokens: 500 }));
      const first = await tracker.flush('sess-1');
      const second = await tracker.flush('sess-1');

      expect(first!.inputTokens).toBe(1000);
      expect(second!.inputTokens).toBe(0);
    });
  });

  describe('getUsage', () => {
    it('does not mutate the buffer (non-destructive read)', () => {
      tracker.record(row({}));
      const before = tracker.sessionCount();
      tracker.getUsage('sess-1');
      tracker.getUsage('sess-1');
      expect(tracker.sessionCount()).toBe(before);
    });

    it('returns a copy of rows (callers cannot mutate internal state)', () => {
      tracker.record(row({}));
      const snap = tracker.getUsage('sess-1');
      (snap.rows as TokenRecord[]).push(row({ inputTokens: 9999 }));
      expect(tracker.getUsage('sess-1').rows).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('wipes every session', () => {
      tracker.record(row({ sessionId: 'a' }));
      tracker.record(row({ sessionId: 'b' }));
      tracker.clearAll();
      expect(tracker.sessionCount()).toBe(0);
    });
  });

  describe('port bindings', () => {
    it('implements both ITokenRecorder.record and ITokenTracker.flush', () => {
      expect(typeof tracker.record).toBe('function');
      expect(typeof tracker.flush).toBe('function');
    });
  });
});
