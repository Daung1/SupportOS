/// <reference types="jest" />

/**
 * SharedState unit tests.
 *
 * Covers:
 *   - get / set round-trip for each declared key
 *   - require() throws SharedStateMissingError on absent keys
 *   - has / delete behaviour
 *   - raw() returns the backing Map (mutations visible through wrapper)
 *   - Factory `SharedState.from(context)` wraps the context's state
 *   - SHARED_STATE_KEYS stays in sync with the SharedStateSchema
 */

import {
  SharedState,
  SharedStateKey,
  SharedStateMissingError,
  SHARED_STATE_KEYS,
  SharedAnalyzerResult,
  SharedSearcherResult,
  SharedFAQResult,
  SharedClassificationResult,
  SharedGeneratorResult,
  SharedSafetyResult,
} from './shared-state';

function makeState(init: Record<string, unknown> = {}): Map<string, any> {
  return new Map(Object.entries(init));
}

const sampleAnalyzer: SharedAnalyzerResult = {
  category: 'shipping',
  priority: 'high',
  keywords: ['delivery', 'delay'],
  sentiment: 'negative',
  confidence: 0.84,
};

const sampleSearcher: SharedSearcherResult = {
  summary: 'Two shipping policy docs',
  documentsFound: 2,
  sources: [
    { id: 'd1', title: 'Shipping policy', score: 0.92 },
    { id: 'd2', title: 'Delivery SLA', score: 0.81 },
  ],
  avgRelevance: 0.865,
};

const sampleFAQ: SharedFAQResult = {
  matched: true,
  answer: 'Standard shipping takes 3-5 business days.',
  confidence: 0.95,
  faqId: 'faq_001',
};

const sampleClassification: SharedClassificationResult = {
  type: 'DOC_ANSWER',
  confidence: 0.8,
  reason: 'Documents found for shipping category',
  matchedKeywords: ['shipping', 'delivery'],
};

const sampleGenerator: SharedGeneratorResult = {
  type: 'EDITABLE_RESPONSE',
  source: 'searcher_docs',
  confidence: 0.78,
  draftContent: 'Draft reply...',
};

const sampleSafety: SharedSafetyResult = {
  decision: 'approve',
  confidence: 0.88,
  scores: { heuristic: 0.9, final: 0.88 },
  reasons: ['high confidence', 'sourced from kb'],
};

describe('SharedState', () => {
  describe('get / set round-trip', () => {
    test('stores and retrieves analyzerResult', () => {
      const s = new SharedState(makeState());
      s.set('analyzerResult', sampleAnalyzer);
      expect(s.get('analyzerResult')).toEqual(sampleAnalyzer);
    });

    test('stores and retrieves searcherResult', () => {
      const s = new SharedState(makeState());
      s.set('searcherResult', sampleSearcher);
      expect(s.get('searcherResult')).toEqual(sampleSearcher);
    });

    test('stores and retrieves faqResult', () => {
      const s = new SharedState(makeState());
      s.set('faqResult', sampleFAQ);
      expect(s.get('faqResult')).toEqual(sampleFAQ);
    });

    test('stores and retrieves problemClassification', () => {
      const s = new SharedState(makeState());
      s.set('problemClassification', sampleClassification);
      expect(s.get('problemClassification')).toEqual(sampleClassification);
    });

    test('stores and retrieves generatorResult', () => {
      const s = new SharedState(makeState());
      s.set('generatorResult', sampleGenerator);
      expect(s.get('generatorResult')).toEqual(sampleGenerator);
    });

    test('stores and retrieves safetyResult', () => {
      const s = new SharedState(makeState());
      s.set('safetyResult', sampleSafety);
      expect(s.get('safetyResult')).toEqual(sampleSafety);
    });

    test('get returns undefined for unset keys', () => {
      const s = new SharedState(makeState());
      expect(s.get('analyzerResult')).toBeUndefined();
    });
  });

  describe('require()', () => {
    test('returns the value when present', () => {
      const s = new SharedState(makeState({ analyzerResult: sampleAnalyzer }));
      expect(s.require('analyzerResult')).toEqual(sampleAnalyzer);
    });

    test('throws SharedStateMissingError when value is missing', () => {
      const s = new SharedState(makeState());
      expect(() => s.require('analyzerResult')).toThrow(
        SharedStateMissingError,
      );
    });

    test('throws with a descriptive message that mentions the key', () => {
      const s = new SharedState(makeState());
      try {
        s.require('searcherResult');
        fail('require() should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SharedStateMissingError);
        expect((err as Error).message).toContain('searcherResult');
      }
    });

    test('exposes the missing key via the thrown error', () => {
      const s = new SharedState(makeState());
      try {
        s.require('faqResult');
        fail('require() should have thrown');
      } catch (err) {
        const missing = err as SharedStateMissingError;
        expect(missing.key).toBe('faqResult');
      }
    });

    test('throws for null stored values as well as undefined', () => {
      const raw = makeState();
      raw.set('analyzerResult', null);
      const s = new SharedState(raw);
      expect(() => s.require('analyzerResult')).toThrow(
        SharedStateMissingError,
      );
    });
  });

  describe('has() / delete()', () => {
    test('has returns true for set keys and false otherwise', () => {
      const s = new SharedState(makeState({ analyzerResult: sampleAnalyzer }));
      expect(s.has('analyzerResult')).toBe(true);
      expect(s.has('searcherResult')).toBe(false);
    });

    test('delete removes the key and returns true', () => {
      const s = new SharedState(makeState({ analyzerResult: sampleAnalyzer }));
      const removed = s.delete('analyzerResult');
      expect(removed).toBe(true);
      expect(s.has('analyzerResult')).toBe(false);
    });

    test('delete returns false for missing keys', () => {
      const s = new SharedState(makeState());
      expect(s.delete('analyzerResult')).toBe(false);
    });
  });

  describe('raw() interop', () => {
    test('raw() returns the backing Map', () => {
      const backing = makeState({ analyzerResult: sampleAnalyzer });
      const s = new SharedState(backing);
      expect(s.raw()).toBe(backing);
    });

    test('mutations via raw() are visible through the wrapper', () => {
      const backing = makeState();
      const s = new SharedState(backing);
      backing.set('analyzerResult', sampleAnalyzer);
      expect(s.get('analyzerResult')).toEqual(sampleAnalyzer);
    });

    test('legacy keys (not in schema) remain reachable via raw()', () => {
      const backing = makeState();
      backing.set('iteration_0', { thought: 't', action: {}, observation: {} });
      const s = new SharedState(backing);
      // Schema-typed get cannot see legacy keys, but raw() can.
      expect(s.raw().get('iteration_0')).toBeDefined();
    });
  });

  describe('SharedState.from(context)', () => {
    test('wraps the Map of a session-like context', () => {
      const ctx = { state: makeState({ analyzerResult: sampleAnalyzer }) };
      const s = SharedState.from(ctx);
      expect(s.get('analyzerResult')).toEqual(sampleAnalyzer);
    });

    test('writes through the wrapper are visible on the original Map', () => {
      const ctx = { state: makeState() };
      const s = SharedState.from(ctx);
      s.set('faqResult', sampleFAQ);
      expect(ctx.state.get('faqResult')).toEqual(sampleFAQ);
    });
  });

  describe('SHARED_STATE_KEYS synchronisation', () => {
    test('contains the expected set of keys', () => {
      const expected: SharedStateKey[] = [
        'analyzerResult',
        'searcherResult',
        'faqResult',
        'problemClassification',
        'generatorResult',
        'safetyResult',
      ];
      expect([...SHARED_STATE_KEYS].sort()).toEqual([...expected].sort());
    });

    test('every listed key can be set and retrieved', () => {
      const s = new SharedState(makeState());
      const samples: Record<SharedStateKey, any> = {
        analyzerResult: sampleAnalyzer,
        searcherResult: sampleSearcher,
        faqResult: sampleFAQ,
        problemClassification: sampleClassification,
        generatorResult: sampleGenerator,
        safetyResult: sampleSafety,
      };
      for (const key of SHARED_STATE_KEYS) {
        s.set(key, samples[key]);
        expect(s.get(key)).toEqual(samples[key]);
      }
    });
  });
});
