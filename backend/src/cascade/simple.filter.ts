/**
 * SimpleFilter - Level 2 rule-based filter
 * Goal: quickly classify 20% of tickets with confidence 0.7-0.9.
 *
 * Workflow:
 * 1. Receive ticket text
 * 2. Iterate keywords by category
 * 3. Count matched keywords per category
 * 4. Compute confidence = matched keywords / total category keywords
 * 5. Return the category with highest confidence
 * 6. Return classification only if confidence is between 0.7 and 0.9
 *
 * Performance targets:
 * - Response time: < 50ms
 * - Cost: $0
 * - Accuracy target: > 80% (for medium-confidence matches)
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
    const startTime = Date.now();

    try {
      // Input validation
      if (!ticketText || ticketText.trim().length === 0) {
        return {
          classified: false,
          confidence: 0,
          reason: 'Ticket text is empty',
          processingTime: Date.now() - startTime
        };
      }

      // Tokenization
      const tokens = chineseTokenize(ticketText);
      const tokenSet = new Set(tokens);

      // Calculate score for each category
      const categoryScores = this.calculateCategoryScores(tokenSet);

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

      const processingTime = Date.now() - startTime;

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

      if (bestCategory && bestConfidence < this.confidenceThresholdMin) {
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
      }

      // No category found
      return {
        classified: false,
        confidence: 0,
        reason: 'No matching category found',
        processingTime
      };
    } catch (error) {
      return {
        classified: false,
        confidence: 0,
        reason: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate matching scores for each category.
   *
   * @param tokenSet Set of tokenized ticket text
   * @returns Confidence and matched keywords for each category
   */
  private calculateCategoryScores(
    tokenSet: Set<string>
  ): Record<
    string,
    { confidence: number; matchedKeywords: string[] }
  > {
    const scores: Record<
      string,
      { confidence: number; matchedKeywords: string[] }
    > = {};

    for (const [categoryName, category] of Object.entries(this.rules)) {
      const matchedKeywords: string[] = [];

      // Calculate matched keywords
      for (const keyword of category.keywords) {
        if (tokenSet.has(keyword)) {
          matchedKeywords.push(keyword);
        }
      }

      // Calculate confidence (matched keywords / total keywords)
      const confidence =
        category.keywords.length > 0
          ? matchedKeywords.length / category.keywords.length
          : 0;

      scores[categoryName] = {
        confidence,
        matchedKeywords
      };
    }

    return scores;
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

    const detailed: Record<
      FilterCategory,
      {
        confidence: number;
        matchedKeywords: string[];
        totalKeywords: number;
      }
    > = {} as any;

    for (const [categoryName, category] of Object.entries(this.rules)) {
      const matchedKeywords: string[] = [];

      for (const keyword of category.keywords) {
        if (tokenSet.has(keyword)) {
          matchedKeywords.push(keyword);
        }
      }

      detailed[categoryName as FilterCategory] = {
        confidence:
          category.keywords.length > 0
            ? matchedKeywords.length / category.keywords.length
            : 0,
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
