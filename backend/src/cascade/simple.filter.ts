/**
 * SimpleFilter - Level 2 rule-based filter
 * Goal: quickly classify ~20% of tickets with medium confidence.
 *
 * Workflow:
 * 1. Receive ticket text
 * 2. For each category, count matched keywords. Single-word keywords
 *    use a tokenSet lookup; multi-word keywords (e.g. "tracking number",
 *    "credit card") use a lowercased substring match against the raw
 *    ticket text - the previous tokenSet-only impl could never match
 *    multi-word keys (TD-1 fix).
 * 3. Compute confidence with a saturation formula:
 *      confidence = min(matchedKeywords.length / 3, 1.0)
 *    Rationale: hitting 3 distinct keywords is enough to be sure of
 *    the category. The old formula `matched / totalCategoryKeywords`
 *    was dominated by category size (60+ keywords) and never reached
 *    the configured threshold band. (TD-1 fix.)
 * 4. Return the category with highest confidence
 * 5. Accept the classification only if confidence is within
 *    [confidenceThresholdMin, confidenceThresholdMax].
 *
 * Performance targets:
 * - Response time: < 50ms
 * - Cost: $0
 */

import { chineseTokenize } from './similarity.utils';
import FILTER_RULES, { FilterRuleLibrary } from './rules.data';

export type FilterCategory = 'shipping' | 'billing' | 'account' | 'product' | 'policy';

export interface SimpleFilterResult {
  classified: boolean;              // Whether classification succeeded
  category?: FilterCategory;        // Classification result
  confidence: number;               // Confidence score (0-1)
  reason?: string;                  // Reason for classify/no-classify
  matchedKeywords?: string[];       // Matched keywords
  processingTime?: number;          // Processing time (ms)
}

/**
 * SimpleFilter class
 * Uses keyword matching for fast classification.
 */
export class SimpleFilter {
  private rules: FilterRuleLibrary;
  private confidenceThresholdMin: number;
  private confidenceThresholdMax: number;

  constructor(
    rules: FilterRuleLibrary = FILTER_RULES,
    confidenceThresholdMin: number = 0.7,
    confidenceThresholdMax: number = 0.9
  ) {
    this.rules = rules;
    this.confidenceThresholdMin = confidenceThresholdMin;
    this.confidenceThresholdMax = confidenceThresholdMax;
  }

  /**
   * Classify ticket text.
   *
   * @param ticketText Ticket text
   * @returns SimpleFilterResult
   */
  async classify(ticketText: string): Promise<SimpleFilterResult> {
    const startTime = performance.now();

    try {
      // Input validation
      if (!ticketText || ticketText.trim().length === 0) {
        return {
          classified: false,
          confidence: 0,
          reason: 'Ticket text is empty',
          processingTime: performance.now() - startTime
        };
      }

      // Tokenization (single-word keywords) + lowercased raw text
      // (multi-word keyword substring lookup).
      const tokens = chineseTokenize(ticketText);
      const tokenSet = new Set(tokens);
      const lowerText = ticketText.toLowerCase();

      // Calculate score for each category
      const categoryScores = this.calculateCategoryScores(tokenSet, lowerText);

      // Find highest-scoring category
      let bestCategory: FilterCategory | null = null;
      let bestConfidence = 0;
      let bestMatchedKeywords: string[] = [];

      for (const [category, { confidence, matchedKeywords }] of Object.entries(
        categoryScores
      )) {
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestCategory = category as FilterCategory;
          bestMatchedKeywords = matchedKeywords;
        }
      }

      const processingTime = performance.now() - startTime;

      // Check whether confidence is within target range
      if (
        bestCategory &&
        bestConfidence >= this.confidenceThresholdMin &&
        bestConfidence <= this.confidenceThresholdMax
      ) {
        return {
          classified: true,
          category: bestCategory,
          confidence: bestConfidence,
          matchedKeywords: bestMatchedKeywords,
          reason: `Classified as "${bestCategory}" (confidence: ${(bestConfidence * 100).toFixed(
            1
          )}%, matched ${bestMatchedKeywords.length} keywords)`,
          processingTime
        };
      }

      // Confidence out of range (too high or too low)
      if (bestCategory && bestConfidence > this.confidenceThresholdMax) {
        return {
          classified: false,
          confidence: bestConfidence,
          reason: `Confidence ${(bestConfidence * 100).toFixed(
            1
          )}% > ${(this.confidenceThresholdMax * 100).toFixed(
            1
          )}% upper bound, pass to next level`,
          processingTime
        };
      }

      // Below lower bound (covers both "best category was weak" AND
      // "no category matched any keyword" - both are operationally
      // the same outcome: cascade should escalate to L3).  Reason
      // string always mentions "lower bound" so log readers can
      // group L2 misses uniformly.
      if (!bestCategory) {
        return {
          classified: false,
          confidence: 0,
          reason: `No matching category found (below ${(this.confidenceThresholdMin * 100).toFixed(
            1
          )}% lower bound)`,
          processingTime
        };
      }

      return {
        classified: false,
        confidence: bestConfidence,
        reason: `Confidence ${(bestConfidence * 100).toFixed(
          1
        )}% < ${(this.confidenceThresholdMin * 100).toFixed(
          1
        )}% lower bound, pass to next level`,
        processingTime
      };
    } catch (error) {
      return {
        classified: false,
        confidence: 0,
        reason: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingTime: performance.now() - startTime
      };
    }
  }

  /**
   * Saturation-based confidence:
   *   0 keywords  -> 0
   *   1 keyword   -> 0.33
   *   2 keywords  -> 0.67
   *   3+ keywords -> 1.0
   *
   * Capped at 1.0 so dense matches don't overshoot the upper threshold.
   */
  private static readonly SATURATION_KEYWORDS = 3;
  private confidenceFor(matchCount: number): number {
    if (matchCount <= 0) return 0;
    return Math.min(matchCount / SimpleFilter.SATURATION_KEYWORDS, 1.0);
  }

  /**
   * Calculate matching scores for each category.
   *
   * Single-word keywords are looked up via tokenSet.has() (O(1)).
   * Multi-word keywords (containing whitespace) are matched via a
   * lowercased substring scan against the raw ticket text - they
   * could never match the prior tokenSet-only impl, so a sizeable
   * fraction of the rule library was effectively dead.
   *
   * @param tokenSet Set of tokenized ticket text (single-word lookup)
   * @param lowerText Lowercased raw ticket text (multi-word lookup)
   * @returns Confidence and matched keywords for each category
   */
  private calculateCategoryScores(
    tokenSet: Set<string>,
    lowerText: string
  ): Record<
    string,
    { confidence: number; matchedKeywords: string[] }
  > {
    const scores: Record<
      string,
      { confidence: number; matchedKeywords: string[] }
    > = {};

    for (const [categoryName, category] of Object.entries(this.rules)) {
      const matchedKeywords = this.matchKeywords(
        category.keywords,
        tokenSet,
        lowerText
      );

      scores[categoryName] = {
        confidence: this.confidenceFor(matchedKeywords.length),
        matchedKeywords
      };
    }

    return scores;
  }

  /** Shared keyword-matching helper; used by classify() and getDetailedScores(). */
  private matchKeywords(
    keywords: string[],
    tokenSet: Set<string>,
    lowerText: string
  ): string[] {
    const matched: string[] = [];
    const seen = new Set<string>();

    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue; // dedupe defensive

      const isMultiWord = key.includes(' ') || key.includes('-');
      const hit = isMultiWord ? lowerText.includes(key) : tokenSet.has(key);

      if (hit) {
        matched.push(keyword);
        seen.add(key);
      }
    }

    return matched;
  }

  /**
   * Get detailed scores for all categories (debug/analysis).
   *
   * @param ticketText Ticket text
   * @returns Detailed score info for all categories
   */
  async getDetailedScores(
    ticketText: string
  ): Promise<
    Record<
      FilterCategory,
      {
        confidence: number;
        matchedKeywords: string[];
        totalKeywords: number;
      }
    >
  > {
    const tokens = chineseTokenize(ticketText);
    const tokenSet = new Set(tokens);
    const lowerText = ticketText.toLowerCase();

    const detailed: Record<
      FilterCategory,
      {
        confidence: number;
        matchedKeywords: string[];
        totalKeywords: number;
      }
    > = {} as any;

    for (const [categoryName, category] of Object.entries(this.rules)) {
      const matchedKeywords = this.matchKeywords(
        category.keywords,
        tokenSet,
        lowerText
      );

      detailed[categoryName as FilterCategory] = {
        confidence: this.confidenceFor(matchedKeywords.length),
        matchedKeywords,
        totalKeywords: category.keywords.length
      };
    }

    return detailed;
  }

  /**
   * Get statistics.
   */
  getStats(): Record<
    FilterCategory,
    {
      keywordCount: number;
      description: string;
    }
  > {
    const stats: Record<
      FilterCategory,
      {
        keywordCount: number;
        description: string;
      }
    > = {} as any;

    for (const [categoryName, category] of Object.entries(this.rules)) {
      stats[categoryName as FilterCategory] = {
        keywordCount: category.keywords.length,
        description: category.description
      };
    }

    return stats;
  }

  /**
   * Update confidence thresholds.
   */
  setConfidenceThresholds(min: number, max: number): void {
    if (min < 0 || min > 1) {
      throw new Error('Minimum confidence threshold must be between 0 and 1');
    }
    if (max < 0 || max > 1) {
      throw new Error('Maximum confidence threshold must be between 0 and 1');
    }
    if (min > max) {
      throw new Error('Minimum confidence threshold cannot be greater than maximum');
    }
    this.confidenceThresholdMin = min;
    this.confidenceThresholdMax = max;
  }
}

export default SimpleFilter;
