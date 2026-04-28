/**
 * FAQMatcher - Level 1 fast matcher
 * Goal: precisely match a high fraction of tickets with confidence
 * >= configured threshold (default 0.9).
 *
 * Workflow:
 * 1. Receive ticket text
 * 2. For each FAQ compute a hybrid similarity score:
 *      similarity = max(cosine(text, question),
 *                       jaccard(text, question),
 *                       keyword_score(text, faq.keywords))
 *    The hybrid avoids the "short query vs long FAQ question" pitfall
 *    where pure cosine similarity gets penalised by vector magnitude
 *    for queries that are much shorter than the indexed question.
 *    `faq.keywords` is the curated tag list per FAQ row and was
 *    previously unused; the hybrid lets a 2-keyword query still hit
 *    the right FAQ (TD-1 fix).
 * 3. Pick the highest-scoring FAQ.
 * 4. Return its answer if similarity >= confidenceThreshold.
 * 5. Otherwise return matched=false with a reason that always
 *    mentions the threshold (TD-1 fix).
 *
 * Performance targets:
 * - Response time: < 10ms
 * - Cost: $0
 */

import { calculateSimilarity, chineseTokenize, tokenOverlap } from './similarity.utils';
import FAQ_DATABASE, { FAQ } from './faq.data';

export interface FAQMatchResult {
  matched: boolean;                    // Whether a match is found
  answer?: string;                     // Matched answer
  confidence: number;                  // Confidence score (0-1)
  faqId?: string;                      // Matched FAQ ID
  reason?: string;                     // Match or no-match reason
  processingTime?: number;             // Processing time (ms)
}

/**
 * FAQMatcher class
 * Uses cosine similarity for text matching.
 */
export class FAQMatcher {
  private faqDatabase: FAQ[];
  private confidenceThreshold: number;

  constructor(
    faqDatabase: FAQ[] = FAQ_DATABASE,
    confidenceThreshold: number = 0.9
  ) {
    this.faqDatabase = faqDatabase;
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Match ticket text to FAQ.
   *
   * @param ticketText Ticket text
   * @returns FAQMatchResult
   */
  async match(ticketText: string): Promise<FAQMatchResult> {
    const startTime = performance.now();

    try {
      // Input validation
      if (!ticketText || ticketText.trim().length === 0) {
        return {
          matched: false,
          confidence: 0,
          reason: 'Ticket text is empty'
        };
      }

      // Find the most similar FAQ
      const bestMatch = this.findBestMatch(ticketText);

      const processingTime = performance.now() - startTime;
      const thresholdPct = (this.confidenceThreshold * 100).toFixed(1);

      // Check whether confidence meets threshold
      if (
        bestMatch &&
        bestMatch.similarity >= this.confidenceThreshold
      ) {
        return {
          matched: true,
          answer: bestMatch.faq.answer,
          confidence: bestMatch.similarity,
          faqId: bestMatch.faq.id,
          reason: `Matched FAQ: "${bestMatch.faq.question}" (similarity: ${(
            bestMatch.similarity * 100
          ).toFixed(1)}%)`,
          processingTime
        };
      }

      // Confidence below threshold (best-but-not-good-enough match found)
      if (bestMatch) {
        return {
          matched: false,
          confidence: bestMatch.similarity,
          faqId: bestMatch.faq.id,
          reason: `similarity ${(bestMatch.similarity * 100).toFixed(
            1
          )}% < ${thresholdPct}% threshold, pass to next level`,
          processingTime
        };
      }

      // No FAQ scored above zero - still a "below threshold" outcome.
      // We keep the word "threshold" in the reason so downstream
      // observers can group all L1 misses uniformly.
      return {
        matched: false,
        confidence: 0,
        reason: `No FAQ above ${thresholdPct}% similarity threshold`,
        processingTime
      };
    } catch (error) {
      return {
        matched: false,
        confidence: 0,
        reason: `Matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingTime: performance.now() - startTime
      };
    }
  }

  /**
   * Hybrid similarity: max of
   *   - cosine over chineseTokenize TF vectors (long-text strength)
   *   - Jaccard token overlap                  (short-text resilience)
   *   - keyword score over faq.keywords        (tag-list shortcut)
   *
   * The `* 0.9` factor on the keyword score prevents a single tag hit
   * (1/N keywords) from claiming maximum confidence; it stays a strong
   * but not absolute signal.
   */
  private hybridSimilarity(ticketText: string, faq: FAQ): number {
    const cosine = calculateSimilarity(ticketText, faq.question);
    const overlap = tokenOverlap(ticketText, faq.question);

    let keywordScore = 0;
    if (faq.keywords.length > 0) {
      const queryTokens = new Set(chineseTokenize(ticketText));
      const hits = faq.keywords.filter((k) =>
        queryTokens.has(k.toLowerCase())
      ).length;
      keywordScore = (hits / faq.keywords.length) * 0.9;
    }

    return Math.max(cosine, overlap, keywordScore);
  }

  /**
   * Find the most similar FAQ and return its similarity score.
   *
   * @param ticketText Ticket text
   * @returns { faq: FAQ, similarity: number } or null
   */
  private findBestMatch(
    ticketText: string
  ): { faq: FAQ; similarity: number } | null {
    let bestMatch = null;
    let highestSimilarity = 0;

    for (const faq of this.faqDatabase) {
      const similarity = this.hybridSimilarity(ticketText, faq);

      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = { faq, similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Get top-N similar FAQs for debugging and analysis.
   *
   * @param ticketText Ticket text
   * @param topN Number of results to return
   * @returns FAQ list sorted by descending similarity
   */
  getTopMatches(
    ticketText: string,
    topN: number = 5
  ): Array<{ faq: FAQ; similarity: number }> {
    const similarities = this.faqDatabase.map(faq => ({
      faq,
      similarity: this.hybridSimilarity(ticketText, faq)
    }));

    // Sort by descending similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, topN);
  }

  /**
   * Get stats for monitoring and debugging.
   */
  getStats(): {
    faqCount: number;
    confidenceThreshold: number;
    categories: Record<string, number>;
  } {
    const categories: Record<string, number> = {};

    for (const faq of this.faqDatabase) {
      categories[faq.category] = (categories[faq.category] || 0) + 1;
    }

    return {
      faqCount: this.faqDatabase.length,
      confidenceThreshold: this.confidenceThreshold,
      categories
    };
  }

  /**
   * Update confidence threshold.
   */
  setConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
    this.confidenceThreshold = threshold;
  }
}

export default FAQMatcher;
