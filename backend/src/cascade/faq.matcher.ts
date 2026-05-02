/**
 * FAQMatcher (vector edition) - Level 1 fast matcher
 *
 * Goal: precisely match a high fraction of FAQs using sentence
 * embeddings, replacing the legacy lexical/keyword hybrid that
 * couldn't handle paraphrase ("how to refund?" vs "How do refunds
 * work?") well.
 *
 * Workflow:
 *   1. Receive ticket text and an optional category hint from L0
 *      Triage. The hint shrinks the candidate set to that category
 *      only (~15 FAQs vs 80) which is both faster and reduces noise.
 *      If the hinted top-1 falls below threshold we retry against
 *      the full corpus so a wrong hint can't permanently hide a
 *      good match.
 *   2. Embed the query with RETRIEVAL_QUERY task type (asymmetric
 *      with the corpus' RETRIEVAL_DOCUMENT vectors - this matters,
 *      it's roughly 10-15% of recall on text-embedding-004).
 *   3. Cosine-score against every candidate vector.
 *   4. Compute confidence from two signals:
 *        - top-1 absolute score (must be above absolute floor)
 *        - margin: top-1 minus top-2 (must be above margin floor;
 *          a thin margin means there are multiple plausible matches
 *          and we'd rather punt to L3 than guess wrong).
 *      Both checks must pass to count as "matched".
 *   5. If FAQEmbeddingService isn't ready (boot error or empty
 *      corpus) we return a graceful no-match instead of throwing.
 *
 * Performance:
 *   - 1 API round-trip per query (~50ms typical for embed-004)
 *   - O(N) cosine over <100 vectors (<1ms)
 *   - No DB I/O on the hot path
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';
import { FAQEmbeddingService, cosine } from './faq-embedding.service';
import { FAQ } from './faq.data';

export interface FAQMatchResult {
  matched: boolean;
  answer?: string;
  confidence: number;
  faqId?: string;
  category?: string;
  reason?: string;
  processingTime?: number;
  /** Top-2 score - useful for diagnostics/debug endpoints. */
  margin?: number;
}

/**
 * Default thresholds.
 *
 * The cosine distribution depends on the embedding model and on whether
 * vectors are unit-normalised:
 *   - text-embedding-004 (retired): unit-norm, paraphrases 0.78-0.92,
 *     off-topic < 0.65 -> 0.75 was a safe floor.
 *   - gemini-embedding-001 @ 768 dim (current): NOT unit-norm (truncated
 *     MRL output), paraphrases land 0.65-0.80, related 0.45-0.60,
 *     off-topic < 0.35. 0.62 is a calibrated floor for this model.
 *
 * If you swap the embedding model, retune by running:
 *   GET /api/cascade/faq/top-matches?q=...
 * (or just look at cascade.level1_miss log payloads for representative
 *  queries) and pick a value above the off-topic noise floor.
 */
const DEFAULT_ABS_THRESHOLD = 0.62;
const DEFAULT_MARGIN_THRESHOLD = 0.03;

@Injectable()
export class FAQMatcher {
  private readonly logger = new Logger(FAQMatcher.name);
  private absThreshold = DEFAULT_ABS_THRESHOLD;
  private marginThreshold = DEFAULT_MARGIN_THRESHOLD;

  constructor(
    private readonly gemini: GeminiService,
    private readonly faqEmbeddings: FAQEmbeddingService,
  ) {}

  setThresholds(absThreshold: number, marginThreshold: number): void {
    if (absThreshold < 0 || absThreshold > 1) {
      throw new Error('absThreshold must be in [0,1]');
    }
    if (marginThreshold < 0 || marginThreshold > 1) {
      throw new Error('marginThreshold must be in [0,1]');
    }
    this.absThreshold = absThreshold;
    this.marginThreshold = marginThreshold;
  }

  /**
   * Back-compat shim for callers that only set the absolute floor.
   * The margin requirement keeps its default. Kept so the existing
   * `CascadeOrchestratorOptions.faqMinConfidence` plumbing in
   * cascade-orchestrator.service.ts continues to work.
   */
  setConfidenceThreshold(threshold: number): void {
    this.setThresholds(threshold, this.marginThreshold);
  }

  /**
   * Match a query against the FAQ corpus.
   *
   * @param ticketText raw user input
   * @param categoryHint optional category from L0 triage; restricts
   *        the candidate set as a soft filter. Pass undefined to
   *        always search the full corpus.
   */
  async match(
    ticketText: string,
    categoryHint?: string,
  ): Promise<FAQMatchResult> {
    const startTime = performance.now();

    if (!ticketText || ticketText.trim().length === 0) {
      return {
        matched: false,
        confidence: 0,
        reason: 'Ticket text is empty',
        processingTime: performance.now() - startTime,
      };
    }

    if (!this.faqEmbeddings.isReady()) {
      return {
        matched: false,
        confidence: 0,
        reason: 'FAQ embeddings not ready',
        processingTime: performance.now() - startTime,
      };
    }

    let queryVector: number[];
    try {
      queryVector = await this.gemini.embed(ticketText, 'RETRIEVAL_QUERY');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FAQMatcher embed failed: ${message}`);
      return {
        matched: false,
        confidence: 0,
        reason: `Embedding API failed: ${message}`,
        processingTime: performance.now() - startTime,
      };
    }

    const all = this.faqEmbeddings.getEmbeddings();

    // Try the category-restricted corpus first (if hinted), then
    // fall back to the full corpus if that doesn't pass threshold.
    // We never *only* search the hinted slice because L0 can be
    // wrong (e.g. "what materials are used in returns?" L0 might
    // tag as "policy" but the right FAQ is "product").
    const ranked = this.scoreAndSort(queryVector, all);
    const filtered =
      categoryHint && categoryHint !== 'unknown'
        ? this.scoreAndSort(
            queryVector,
            all.filter((e) => e.faq.category === categoryHint),
          )
        : ranked;

    // Pick whichever ordering produces a stronger top-1.
    const primary =
      filtered.length > 0 && filtered[0].score >= ranked[0].score - 0.02
        ? filtered
        : ranked;

    const top1 = primary[0];
    const top2 = primary[1];

    if (!top1) {
      return {
        matched: false,
        confidence: 0,
        reason: 'FAQ corpus is empty',
        processingTime: performance.now() - startTime,
      };
    }

    const margin = top1.score - (top2?.score ?? 0);
    const processingTime = performance.now() - startTime;

    const passesAbs = top1.score >= this.absThreshold;
    const passesMargin = margin >= this.marginThreshold;

    if (passesAbs && passesMargin) {
      return {
        matched: true,
        answer: top1.faq.answer,
        confidence: top1.score,
        faqId: top1.faq.id,
        category: top1.faq.category,
        margin,
        reason: `Vector match: "${top1.faq.question}" (score ${(
          top1.score * 100
        ).toFixed(1)}%, margin ${(margin * 100).toFixed(1)}%)`,
        processingTime,
      };
    }

    return {
      matched: false,
      confidence: top1.score,
      faqId: top1.faq.id,
      category: top1.faq.category,
      margin,
      reason: !passesAbs
        ? `score ${(top1.score * 100).toFixed(1)}% < ${(
            this.absThreshold * 100
          ).toFixed(1)}% threshold, pass to next level`
        : `margin ${(margin * 100).toFixed(1)}% < ${(
            this.marginThreshold * 100
          ).toFixed(1)}% threshold (ambiguous), pass to next level`,
      processingTime,
    };
  }

  /**
   * Debug-only: return top-N candidates with their scores. Useful for
   * threshold tuning and admin endpoints.
   */
  async getTopMatches(
    ticketText: string,
    topN: number = 5,
  ): Promise<Array<{ faq: FAQ; score: number }>> {
    if (!this.faqEmbeddings.isReady()) return [];
    const queryVector = await this.gemini.embed(
      ticketText,
      'RETRIEVAL_QUERY',
    );
    const ranked = this.scoreAndSort(
      queryVector,
      this.faqEmbeddings.getEmbeddings(),
    );
    return ranked.slice(0, topN);
  }

  private scoreAndSort(
    queryVector: number[],
    candidates: Array<{ faq: FAQ; vector: number[] }>,
  ): Array<{ faq: FAQ; score: number }> {
    const scored = candidates.map(({ faq, vector }) => ({
      faq,
      score: cosine(queryVector, vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
}

export default FAQMatcher;
