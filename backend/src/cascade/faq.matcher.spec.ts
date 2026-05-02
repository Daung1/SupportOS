/// <reference types="jest" />

/**
 * FAQMatcher (vector edition) unit tests.
 *
 * The new matcher delegates embedding to GeminiService and the corpus
 * cache to FAQEmbeddingService - both are stubbed here so the test
 * stays hermetic and deterministic. We synthesize tiny 4-dim vectors
 * to keep the cosine math easy to reason about.
 */

import { FAQMatcher } from './faq.matcher';
import { FAQEmbeddingService } from './faq-embedding.service';
import { GeminiService } from '../gemini/gemini.service';
import { FAQ } from './faq.data';

const FAQ_FIXTURES: FAQ[] = [
  {
    id: 'billing_003',
    question: 'How do refunds work?',
    answer: 'Refunds processed within 5-7 business days.',
    keywords: ['refund', 'money back', 'return'],
    category: 'billing',
    frequency: 89,
  },
  {
    id: 'shipping_001',
    question: 'How long does standard shipping take?',
    answer: 'Standard shipping typically takes 5-7 business days.',
    keywords: ['shipping', 'delivery', 'time'],
    category: 'shipping',
    frequency: 95,
  },
  {
    id: 'account_002',
    question: 'How do I reset my password?',
    answer: 'Click "Forgot Password" on login page.',
    keywords: ['password', 'reset'],
    category: 'account',
    frequency: 94,
  },
];

const FAQ_VECTORS: Record<string, number[]> = {
  billing_003: [1, 0, 0, 0],
  shipping_001: [0, 1, 0, 0],
  account_002: [0, 0, 1, 0],
};

function makeFakeEmbeddingService(): FAQEmbeddingService {
  return {
    isReady: () => true,
    getEmbeddings: () =>
      FAQ_FIXTURES.map((faq) => ({ faq, vector: FAQ_VECTORS[faq.id] })),
  } as unknown as FAQEmbeddingService;
}

function makeFakeGemini(queryVectorMap: Record<string, number[]>): GeminiService {
  return {
    embed: jest.fn(async (text: string) => {
      const v = queryVectorMap[text];
      if (!v) throw new Error(`unmocked query: "${text}"`);
      return v;
    }),
  } as unknown as GeminiService;
}

describe('FAQMatcher (vector)', () => {
  let matcher: FAQMatcher;
  let gemini: GeminiService;
  let embeddings: FAQEmbeddingService;

  beforeEach(() => {
    embeddings = makeFakeEmbeddingService();
  });

  it('returns a hit when top-1 cosine and margin both pass thresholds', async () => {
    // Unit query close to billing axis -> cos_billing ≈ 0.99.
    gemini = makeFakeGemini({
      'how to refund?': [0.99, 0.141, 0, 0],
    });
    matcher = new FAQMatcher(gemini, embeddings);

    const result = await matcher.match('how to refund?');

    expect(result.matched).toBe(true);
    expect(result.faqId).toBe('billing_003');
    expect(result.category).toBe('billing');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.margin).toBeGreaterThan(0);
  });

  it('returns no-match when absolute score below threshold', async () => {
    // Unit query distributed across all axes - cosines all 0.5.
    gemini = makeFakeGemini({
      vague: [0.5, 0.5, 0.5, 0.5],
    });
    matcher = new FAQMatcher(gemini, embeddings);

    const result = await matcher.match('vague');

    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/threshold/);
  });

  it('returns no-match when margin too thin (ambiguous)', async () => {
    // Query roughly equidistant from billing and shipping. With
    // orthonormal FAQ basis vectors the maximum simultaneously-
    // achievable abs score for two candidates is bounded by the
    // unit-norm constraint, so we relax the abs threshold here
    // and let the margin check do the talking.
    gemini = makeFakeGemini({
      ambiguous: [0.71, 0.7, 0, 0],
    });
    matcher = new FAQMatcher(gemini, embeddings);
    matcher.setThresholds(0.6, 0.03);

    const result = await matcher.match('ambiguous');

    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/margin|ambiguous/i);
  });

  it('uses category hint to bias toward the right corpus slice', async () => {
    // Query is fractionally closer to shipping than billing in the
    // unrestricted ranking, but L0 hinted "billing". The category
    // filter restricts the candidate set so billing wins cleanly.
    gemini = makeFakeGemini({
      'refund please': [0.7, 0.71, 0.05, 0],
    });
    matcher = new FAQMatcher(gemini, embeddings);
    matcher.setThresholds(0.6, 0.0);

    const result = await matcher.match('refund please', 'billing');

    expect(result.matched).toBe(true);
    expect(result.faqId).toBe('billing_003');
  });

  it('handles empty input without calling embed', async () => {
    const embedSpy = jest.fn();
    gemini = { embed: embedSpy } as unknown as GeminiService;
    matcher = new FAQMatcher(gemini, embeddings);

    const result = await matcher.match('');
    expect(result.matched).toBe(false);
    expect(result.reason).toBe('Ticket text is empty');
    expect(embedSpy).not.toHaveBeenCalled();
  });

  it('returns graceful no-match when corpus not ready', async () => {
    const notReady = {
      isReady: () => false,
      getEmbeddings: () => [],
    } as unknown as FAQEmbeddingService;
    gemini = makeFakeGemini({});
    matcher = new FAQMatcher(gemini, notReady);

    const result = await matcher.match('any question');

    expect(result.matched).toBe(false);
    expect(result.reason).toBe('FAQ embeddings not ready');
  });

  it('returns graceful no-match when embed API throws', async () => {
    gemini = {
      embed: jest.fn(async () => {
        throw new Error('boom');
      }),
    } as unknown as GeminiService;
    matcher = new FAQMatcher(gemini, embeddings);

    const result = await matcher.match('how to refund?');

    expect(result.matched).toBe(false);
    expect(result.reason).toMatch(/Embedding API failed/);
  });

  it('respects custom thresholds', async () => {
    // Unit query [0.78, 0.626, 0, 0] -> cos_billing = 0.78,
    // cos_shipping = 0.626, margin = 0.154.
    gemini = makeFakeGemini({
      borderline: [0.78, 0.626, 0, 0],
    });
    matcher = new FAQMatcher(gemini, embeddings);

    matcher.setThresholds(0.9, 0.03);
    const strictResult = await matcher.match('borderline');
    expect(strictResult.matched).toBe(false);

    matcher.setThresholds(0.5, 0.0);
    const lenientResult = await matcher.match('borderline');
    expect(lenientResult.matched).toBe(true);
  });
});
