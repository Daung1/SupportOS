/**
 * FAQMatcher - Level 1 fast matcher
 * Goal: precisely match 60% of tickets with confidence >= 0.9.
 *
 * Workflow:
 * 1. Receive ticket text
 * 2. Iterate through FAQ database and compute similarity
 * 3. Find the most similar FAQ
 * 4. Return answer if similarity >= 0.9
 * 5. Otherwise return null (pass to next level)
 *
 * Performance targets:
 * - Response time: < 10ms
 * - Cost: $0
 * - Accuracy target: > 90% (for high-confidence matches)
 */

import { calculateSimilarity } from './similarity.utils';
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
    const startTime = Date.now();

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

      const processingTime = Date.now() - startTime;

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

      // Confidence below threshold
      if (bestMatch) {
        return {
          matched: false,
          confidence: bestMatch.similarity,
          faqId: bestMatch.faq.id,
          reason: `translated ${(bestMatch.similarity * 100).toFixed(
            1
          )}% < ${(this.confidenceThreshold * 100).toFixed(
            1
          )}% threshold, pass to next level`,
          processingTime
        };
      }

      // No similar FAQ found
      return {
        matched: false,
        confidence: 0,
        reason: 'No similar FAQ found',
        processingTime
      };
    } catch (error) {
      return {
        matched: false,
        confidence: 0,
        reason: `Matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingTime: Date.now() - startTime
      };
    }
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
      // Compute similarity with this FAQ
      const similarity = calculateSimilarity(ticketText, faq.question);

      // Track highest similarity
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
      similarity: calculateSimilarity(ticketText, faq.question)
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
