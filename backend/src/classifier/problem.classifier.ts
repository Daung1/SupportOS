/**
 * Problem Classifier Service
 * Analyzes tickets and classifies them into different problem types:
 * - FAQ: High confidence questions with direct answers
 * - DOC_ANSWER: Questions that can be answered from documentation
 * - TECH_ISSUE: Technical problems that need ticket assignment
 * - OTHER: Everything else
 */

import { Injectable } from '@nestjs/common';
import {
  CLASSIFICATION_RULES,
  ClassificationResult,
  ProblemType,
} from './classification-rules';
import { ISessionContext } from '../agents/core/execution-context.interface';
import {
  SharedState,
  SharedAnalyzerResult,
  SharedSearcherResult,
  SharedTriageResult,
} from '../agents/core/shared-state';

/**
 * Legacy local alias retained for backward compatibility with existing
 * consumers that import `AnalyzerResult` from this module.  New code
 * should import `SharedAnalyzerResult` from `agents/core/shared-state`.
 */
export type AnalyzerResult = Partial<SharedAnalyzerResult>;

@Injectable()
export class ProblemClassifier {
  /**
   * Classify a problem based on ticket content and analyzer result
   * Returns the problem type and confidence score
   */
  async classifyProblem(
    context: ISessionContext,
  ): Promise<ClassificationResult> {
    const input = context.input || '';
    const shared = SharedState.from(context);
    const analyzerResult: Partial<SharedAnalyzerResult> =
      shared.get('analyzerResult') ?? {};
    const triage: SharedTriageResult | undefined = shared.get('triageResult');

    const lowerInput = input.toLowerCase();
    const keywords = analyzerResult.keywords || [];

    // Rule 1: Detect Tech Issues (highest priority).
    //
    // Two paths into TECH_ISSUE:
    //   a) Strong keyword signal (>= 3 malfunction keywords -> 0.9+ raw
    //      confidence > threshold).  This is the original lexical gate
    //      and stays for inputs we got before L0 was wired through.
    //   b) L0 triage labelled the topic as `product` AND we see at least
    //      one malfunction keyword.  This is the "buy button doesn't
    //      work" case: short, only 1-2 lexical hits, but L0 already
    //      semantically nailed it as a product-area problem so we
    //      shouldn't make the user clear an artificially high lexical
    //      bar to reach Scenario C.  We boost confidence to a value
    //      that comfortably clears the keyword threshold so downstream
    //      logging sees a single source of truth.
    const techIssueResult = this.detectTechIssue(lowerInput, keywords);
    const triageProductPrior =
      triage?.inDomain === true &&
      triage?.intent === 'question' &&
      triage?.category === 'product' &&
      techIssueResult.matchedKeywords.length >= 1;

    if (techIssueResult.confidence > 0.7) {
      return {
        type: ProblemType.TECH_ISSUE,
        confidence: techIssueResult.confidence,
        reason: triageProductPrior
          ? `${techIssueResult.reason} (triage=product reinforced)`
          : techIssueResult.reason,
        matchedKeywords: techIssueResult.matchedKeywords,
      };
    }
    if (triageProductPrior) {
      return {
        type: ProblemType.TECH_ISSUE,
        confidence: 0.85,
        reason:
          `Triage classified as 'product' question and ` +
          `${techIssueResult.matchedKeywords.length} malfunction keyword(s) ` +
          `present (${techIssueResult.matchedKeywords.join(', ')})`,
        matchedKeywords: techIssueResult.matchedKeywords,
      };
    }

    // Rule 2: Detect FAQ (high confidence, short direct answers)
    const faqResult = this.detectFAQ(lowerInput, keywords);
    if (faqResult.confidence > 0.8) {
      return {
        type: ProblemType.FAQ,
        confidence: faqResult.confidence,
        reason: faqResult.reason,
        matchedKeywords: faqResult.matchedKeywords,
      };
    }

    // Rule 3: Check if we can answer from documentation
    const searcherResult = shared.get('searcherResult');
    if (searcherResult && searcherResult.documentsFound > 0) {
      return {
        type: ProblemType.DOC_ANSWER,
        confidence: this.calculateDocAnswerConfidence(searcherResult),
        reason: `Found ${searcherResult.documentsFound} relevant documents`,
        matchedKeywords: keywords,
      };
    }

    // Rule 4: Detect documentable keywords (before deciding it's OTHER)
    const docResult = this.detectDocumentable(lowerInput, keywords);
    if (docResult.confidence > 0.6) {
      return {
        type: ProblemType.DOC_ANSWER,
        confidence: docResult.confidence,
        reason: docResult.reason,
        matchedKeywords: docResult.matchedKeywords,
      };
    }

    // Default: OTHER
    return {
      type: ProblemType.OTHER,
      confidence: analyzerResult.confidence || 0.5,
      reason: 'Could not classify into specific categories',
      matchedKeywords: keywords,
    };
  }

  /**
   * Detect if this is a tech issue
   */
  private detectTechIssue(
    input: string,
    keywords: string[],
  ): { confidence: number; reason: string; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let matchCount = 0;

    for (const keyword of CLASSIFICATION_RULES.techIssueKeywords) {
      if (this.matchesTechKeyword(input, keyword)) {
        matchedKeywords.push(keyword);
        matchCount++;
      }
    }

    const confidence =
      matchCount === 0 ? 0 : Math.min(0.9, matchCount * 0.3);

    return {
      confidence,
      reason: `Found ${matchCount} tech issue keywords`,
      matchedKeywords,
    };
  }

  /**
   * Multi-word phrases ("does not work", "system error") keep the
   * historical substring behaviour. Single tokens use whole-word
   * matching so short keys like "hang" do not false-positive inside
   * "exchange", and "bug" does not fire inside "debug".
   */
  private matchesTechKeyword(input: string, keyword: string): boolean {
    const lower = keyword.toLowerCase();
    if (/\s/.test(lower)) {
      return input.includes(lower);
    }
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(input);
  }

  /**
   * Detect FAQ questions with high confidence
   */
  private detectFAQ(
    input: string,
    keywords: string[],
  ): { confidence: number; reason: string; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let matchCount = 0;

    // FAQ questions are usually shorter and start with question patterns
    const trimmed = input.trimStart().toLowerCase();
    const isFAQPattern =
      trimmed.startsWith('how') ||
      trimmed.startsWith('what') ||
      trimmed.startsWith('when') ||
      trimmed.startsWith('where') ||
      trimmed.startsWith('why') ||
      trimmed.startsWith('can i') ||
      trimmed.startsWith('do you') ||
      input.includes('?');

    for (const keyword of CLASSIFICATION_RULES.faqMatchKeywords) {
      if (input.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        matchCount++;
      }
    }

    // FAQ should have at least 2 matches and follow question pattern
    let confidence = 0;
    if (isFAQPattern && matchCount > 0) {
      confidence = Math.min(0.95, 0.6 + matchCount * 0.15);
    }

    return {
      confidence,
      reason: `FAQ pattern: ${isFAQPattern}, matched keywords: ${matchCount}`,
      matchedKeywords,
    };
  }

  /**
   * Detect documentable questions
   */
  private detectDocumentable(
    input: string,
    keywords: string[],
  ): { confidence: number; reason: string; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let matchCount = 0;

    for (const keyword of CLASSIFICATION_RULES.documentableKeywords) {
      if (input.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        matchCount++;
      }
    }

    const confidence =
      matchCount === 0 ? 0 : Math.min(0.85, matchCount * 0.2);

    return {
      confidence,
      reason: `Found ${matchCount} documentable keywords`,
      matchedKeywords,
    };
  }

  /**
   * Calculate confidence for DOC_ANSWER based on search results
   */
  private calculateDocAnswerConfidence(
    searcherResult: SharedSearcherResult,
  ): number {
    if (!searcherResult.documentsFound) return 0.5;

    // Confidence based on number of documents found and average relevance
    const docCount = Math.min(searcherResult.documentsFound, 5);
    const avgRelevance = searcherResult.avgRelevance ?? 0.7;

    return Math.min(0.9, 0.5 + docCount * 0.1 + avgRelevance * 0.2);
  }

  /**
   * Check if input contains urgent keywords
   */
  isUrgent(input: string): boolean {
    const lowerInput = input.toLowerCase();

    for (const keyword of CLASSIFICATION_RULES.urgentKeywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  }
}
