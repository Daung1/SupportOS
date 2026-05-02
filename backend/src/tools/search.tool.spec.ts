/**
 * SearchTool unit tests.
 *
 * The tool itself is thin: ask the embedding service for the corpus,
 * embed the query, cosine, sort, slice, threshold-filter. We exercise
 * each branch with a mocked `GeminiService` + a mocked
 * `DocumentEmbeddingService` so no DB or network is involved.
 */

import { SearchTool } from './search.tool';
import {
  DocumentEmbeddingService,
  KBDocument,
} from './document-embedding.service';
import { GeminiService } from '../gemini/gemini.service';

function makeGemini(queryVector: number[]): jest.Mocked<GeminiService> {
  return {
    embed: jest.fn().mockResolvedValue(queryVector),
  } as unknown as jest.Mocked<GeminiService>;
}

function makeEmbeddings(
  ready: boolean,
  rows: Array<{ doc: KBDocument; vector: number[] }>,
): jest.Mocked<DocumentEmbeddingService> {
  return {
    isReady: jest.fn().mockReturnValue(ready),
    getEmbeddings: jest.fn().mockReturnValue(rows),
  } as unknown as jest.Mocked<DocumentEmbeddingService>;
}

const docA: KBDocument = {
  id: 'doc_a',
  title: 'Buy button troubleshooting',
  content: 'If the buy button does not respond, clear cache and retry...',
  source: 'kb',
};
const docB: KBDocument = {
  id: 'doc_b',
  title: 'Refund policy',
  content: 'Refunds are processed within 5-7 business days...',
  source: 'kb',
};

describe('SearchTool', () => {
  it('returns ranked, threshold-filtered results when corpus is ready', async () => {
    // Vectors chosen so docA correlates strongly with the query and
    // docB correlates very weakly. Query vector is unit [1,0,0]; docA
    // is [0.95, 0.1, 0] (cosine ~0.99); docB is [0.1, 0.99, 0]
    // (cosine ~0.10).
    const gemini = makeGemini([1, 0, 0]);
    const embeddings = makeEmbeddings(true, [
      { doc: docA, vector: [0.95, 0.1, 0] },
      { doc: docB, vector: [0.1, 0.99, 0] },
    ]);
    const tool = new SearchTool(gemini, embeddings);

    const result = await tool.execute({ query: 'buy button broken' });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.results[0].id).toBe('doc_a');
    expect(result.results[0].score).toBeGreaterThan(0.9);
    expect(gemini.embed).toHaveBeenCalledWith(
      'buy button broken',
      'RETRIEVAL_QUERY',
    );
  });

  it('respects the topK parameter', async () => {
    const gemini = makeGemini([1, 0, 0]);
    const embeddings = makeEmbeddings(true, [
      { doc: docA, vector: [0.99, 0, 0] },
      { doc: docB, vector: [0.95, 0.1, 0] },
    ]);
    const tool = new SearchTool(gemini, embeddings);

    const result = await tool.execute({ query: 'q', topK: 1 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe('doc_a');
  });

  it('returns empty results (and success=false) when the embedding service is not ready', async () => {
    // Bootstrap race: SearchTool was called before the embedding
    // bootstrap finished. Must not crash, must not call Gemini.
    const gemini = makeGemini([1, 0, 0]);
    const embeddings = makeEmbeddings(false, []);
    const tool = new SearchTool(gemini, embeddings);

    const result = await tool.execute({ query: 'anything' });

    expect(result.success).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toMatch(/not ready/i);
    expect(gemini.embed).not.toHaveBeenCalled();
  });

  it('rejects empty queries without calling the embedder', async () => {
    const gemini = makeGemini([1, 0, 0]);
    const embeddings = makeEmbeddings(true, [
      { doc: docA, vector: [1, 0, 0] },
    ]);
    const tool = new SearchTool(gemini, embeddings);

    const result = await tool.execute({ query: '   ' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
    expect(gemini.embed).not.toHaveBeenCalled();
  });

  it('surfaces a Gemini embedding failure as a tool error (no crash)', async () => {
    // Mirrors a transient 503 during the query embedding step. The
    // tool MUST report it as success=false instead of throwing - that
    // pairs with the Searcher route's failurePolicy='continue' so the
    // pipeline still flows.
    const gemini = {
      embed: jest.fn().mockRejectedValue(new Error('503 Service Unavailable')),
    } as unknown as jest.Mocked<GeminiService>;
    const embeddings = makeEmbeddings(true, [
      { doc: docA, vector: [1, 0, 0] },
    ]);
    const tool = new SearchTool(gemini, embeddings);

    const result = await tool.execute({ query: 'q' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/503/);
    expect(result.results).toEqual([]);
  });
});
