/**
 * Heuristic-based safety scorer using 5 dimensions.
 * 
 * Dimensions:
 * 1. Length reasonableness (too short/long penalties)
 * 2. Structural completeness (greeting, closing)
 * 3. Specificity (concrete guidance, URLs, numbers)
 * 4. Source attribution (based on searcherResult)
 * 5. Confidence score from analyzer/classifier
 */

export interface HeuristicScoreDetails {
  lengthScore: number;
  structureScore: number;
  specificityScore: number;
  sourceScore: number;
  confidenceScore: number;
  totalScore: number;
  breakdown: string[];
}

export class HeuristicScorer {
  /**
   * Score response content across 5 dimensions.
   * Each dimension scores 0-1, total = average.
   */
  score(input: {
    content: string;
    analyzerConfidence?: number;
    hasSearchResults?: boolean;
    searchResultCount?: number;
  }): HeuristicScoreDetails {
    const breakdown: string[] = [];

    // 1. Length reasonableness (optimal: 100-1000 chars)
    const lengthScore = this.scoreLengthReasableness(input.content, breakdown);

    // 2. Structural completeness
    const structureScore = this.scoreStructuralCompleteness(
      input.content,
      breakdown,
    );

    // 3. Specificity (URLs, numbers, concrete guidance)
    const specificityScore = this.scoreSpecificity(input.content, breakdown);

    // 4. Source attribution
    const sourceScore = this.scoreSourceAttribution(
      input.hasSearchResults,
      input.searchResultCount,
      breakdown,
    );

    // 5. Confidence score from upstream
    const confidenceScore = this.scoreConfidence(
      input.analyzerConfidence,
      breakdown,
    );

    const totalScore =
      (lengthScore +
        structureScore +
        specificityScore +
        sourceScore +
        confidenceScore) /
      5;

    return {
      lengthScore,
      structureScore,
      specificityScore,
      sourceScore,
      confidenceScore,
      totalScore: Math.min(1.0, totalScore),
      breakdown,
    };
  }

  private scoreLengthReasableness(
    content: string,
    breakdown: string[],
  ): number {
    const len = content.length;

    if (len < 20) {
      breakdown.push('length: too short (<20 chars) = 0');
      return 0;
    }
    if (len < 50) {
      breakdown.push('length: short (50-100 chars) = 0.5');
      return 0.5;
    }
    if (len <= 2000) {
      breakdown.push('length: reasonable = 1.0');
      return 1.0;
    }
    if (len <= 5000) {
      breakdown.push('length: long (2000-5000 chars) = 0.8');
      return 0.8;
    }

    breakdown.push('length: too long (>5000 chars) = 0.4');
    return 0.4;
  }

  private scoreStructuralCompleteness(
    content: string,
    breakdown: string[],
  ): number {
    let score = 0.6; // baseline

    // Check for greeting patterns
    if (/^(hi|hello|dear|thank|thanks)/i.test(content)) {
      score += 0.15;
      breakdown.push('structure: has greeting = +0.15');
    }

    // Check for closing patterns
    if (
      /\b(regards|sincerely|thanks|best|cheers)[\s,.!]*$/i.test(
        content,
      )
    ) {
      score += 0.15;
      breakdown.push('structure: has closing = +0.15');
    } else {
      breakdown.push('structure: no proper closing = -0.1');
      score -= 0.1;
    }

    // Check for structural elements (lists, sections)
    const hasStructure =
      /(\n\s*[-*•]\s|\n\d\.\s|\n#{1,3}\s)/.test(content);
    if (hasStructure) {
      score += 0.1;
      breakdown.push('structure: has lists/sections = +0.1');
    }

    return Math.min(1.0, Math.max(0, score));
  }

  private scoreSpecificity(
    content: string,
    breakdown: string[],
  ): number {
    let score = 0.5; // baseline

    // Count URLs
    const urlCount = (content.match(/https?:\/\/\S+/g) || []).length;
    if (urlCount > 0) {
      score += 0.2;
      breakdown.push(`specificity: has ${urlCount} URLs = +0.2`);
    }

    // Count numbers (step numbers, statistics, etc.)
    const numberCount = (content.match(/\d+/g) || []).length;
    if (numberCount >= 3) {
      score += 0.15;
      breakdown.push(`specificity: has ${numberCount} numbers = +0.15`);
    } else if (numberCount > 0) {
      score += 0.08;
      breakdown.push(`specificity: has ${numberCount} numbers = +0.08`);
    }

    // Check for code blocks or technical details
    if (/`{1,3}[\s\S]*`{1,3}|\<code\>|\[code\]/.test(content)) {
      score += 0.15;
      breakdown.push('specificity: has code blocks = +0.15');
    }

    return Math.min(1.0, Math.max(0, score));
  }

  private scoreSourceAttribution(
    hasSearchResults: boolean | undefined,
    searchResultCount: number | undefined,
    breakdown: string[],
  ): number {
    if (!hasSearchResults) {
      breakdown.push('source: no search results used = 0.3');
      return 0.3;
    }

    const count = searchResultCount ?? 0;
    if (count === 0) {
      breakdown.push('source: has search results but count=0 = 0.5');
      return 0.5;
    }
    if (count === 1) {
      breakdown.push('source: single search result = 0.7');
      return 0.7;
    }

    breakdown.push(`source: ${count} search results = 1.0`);
    return 1.0;
  }

  private scoreConfidence(
    analyzerConfidence: number | undefined,
    breakdown: string[],
  ): number {
    if (analyzerConfidence === undefined) {
      breakdown.push('confidence: undefined = 0.5');
      return 0.5;
    }

    const normalized = Math.min(1.0, Math.max(0, analyzerConfidence));
    breakdown.push(
      `confidence: analyzer=${normalized.toFixed(2)} = ${normalized}`,
    );
    return normalized;
  }
}
