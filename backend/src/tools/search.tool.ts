/**
 * SearchTool — vector retrieval over the KB Document corpus.
 *
 * Used exclusively by SearcherAgent. The tool is intentionally thin:
 * embed the query once via Gemini, cosine against the in-memory
 * cache populated by DocumentEmbeddingService at boot, return top-K.
 *
 * Why no DB read on the hot path:
 *   - DocumentEmbeddingService already loaded every Document and its
 *     vector into memory at OnModuleInit. Re-reading them per query
 *     would just thrash the DB pool to no benefit.
 *   - The cache parses the JSON-serialised vectors once. Doing it per
 *     query (as the previous implementation did) was the dominant
 *     cost on hits with large KBs.
 *
 * Failure modes:
 *   - Embedding service not ready (boot still racing, or first-time
 *     embedding failed): return success=false with empty results.
 *     The caller (SearcherAgent) will surface this as a TAO
 *     observation; the orchestrator's Searcher route is marked
 *     failurePolicy='continue' so the pipeline still flows on to
 *     Generator + Scenario C / D.
 *   - Query embedding throws (Gemini 503, network): same shape -
 *     the agent handles it as a tool error rather than crashing.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ITool } from '../agents/core/execution-context.interface';
import { GeminiService } from '../gemini/gemini.service';
import {
  DocumentEmbeddingService,
  cosine,
} from './document-embedding.service';

interface SearchToolInput {
  query: string;
  topK?: number;
  /** Override the relevance floor for this call. Defaults to 0.55. */
  threshold?: number;
}

interface SearchToolHit {
  id: string;
  title: string;
  content: string;
  source: string | null;
  score: number;
}

interface SearchToolResult {
  success: boolean;
  query: string;
  results: SearchToolHit[];
  count: number;
  error?: string;
}

/**
 * Cosine cutoff below which we drop a hit even if it lands in the
 * top-K. Tuned for `gemini-embedding-001` (768d, non-unit vectors,
 * see FAQMatcher decisions). 0.55 keeps recall high enough that
 * Searcher's TAO loop sees signal on most well-scoped queries while
 * still rejecting the noisy "everything weakly correlates" tail.
 */
const DEFAULT_RELEVANCE_THRESHOLD = 0.55;

@Injectable()
export class SearchTool implements ITool {
  name = 'search';
  description =
    'Search knowledge base documents using semantic vector similarity (Gemini embeddings)';

  private readonly logger = new Logger(SearchTool.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly embeddings: DocumentEmbeddingService,
  ) {}

  async execute(input: SearchToolInput): Promise<SearchToolResult> {
    const query = (input.query ?? '').trim();
    const topK = input.topK ?? 5;
    const threshold = input.threshold ?? DEFAULT_RELEVANCE_THRESHOLD;

    if (query.length === 0) {
      return {
        success: false,
        query,
        results: [],
        count: 0,
        error: 'Query cannot be empty',
      };
    }

    if (!this.embeddings.isReady()) {
      this.logger.warn(
        'SearchTool called before DocumentEmbeddingService finished bootstrapping; returning empty results.',
      );
      return {
        success: false,
        query,
        results: [],
        count: 0,
        error: 'Document embeddings not ready',
      };
    }

    let queryVec: number[];
    try {
      queryVec = await this.gemini.embed(query, 'RETRIEVAL_QUERY');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Query embedding failed: ${message}`);
      return {
        success: false,
        query,
        results: [],
        count: 0,
        error: `Failed to embed query: ${message}`,
      };
    }

    const corpus = this.embeddings.getEmbeddings();
    const scored = corpus.map(({ doc, vector }) => ({
      doc,
      score: cosine(queryVec, vector),
    }));

    const ranked = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((s) => s.score >= threshold);

    return {
      success: true,
      query,
      results: ranked.map(({ doc, score }) => ({
        id: doc.id,
        title: doc.title,
        // Preserve the previous tool contract: callers expect a
        // bounded preview rather than the full content. Keeps prompt
        // sizes predictable when Searcher feeds these into Gemini.
        content: doc.content.slice(0, 500),
        source: doc.source,
        score: parseFloat(score.toFixed(4)),
      })),
      count: ranked.length,
    };
  }
}
