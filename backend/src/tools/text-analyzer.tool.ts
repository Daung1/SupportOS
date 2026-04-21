/**
 * Text Analyzer Tool
 * Performs basic NLP analysis on text using heuristics
 * Extracts category, priority, keywords, sentiment, and summary
 */

import { Injectable } from '@nestjs/common';
import { ITool } from '../agents/core/execution-context.interface';

export interface TextAnalysisResult {
  category: string; // shipping, billing, technical, account, other
  priority: 'low' | 'medium' | 'high' | 'urgent';
  keywords: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  hasOrderNumber: boolean;
  hasSpecificInfo: boolean;
  length: number;
}

@Injectable()
export class TextAnalyzerTool implements ITool {
  name = 'text_analyzer';
  description =
    'Analyzes text content to extract category, priority, keywords, sentiment, and summary';

  /**
   * Execute the text analyzer tool
   * @param input - Input object with text property
   * @returns Analysis result with extracted information
   */
  async execute(input: { text?: string }): Promise<TextAnalysisResult> {
    const text = input.text || '';

    return {
      category: this.categorizeText(text),
      priority: this.determinePriority(text),
      keywords: this.extractKeywords(text),
      sentiment: this.analyzeSentiment(text),
      summary: this.generateSummary(text),
      hasOrderNumber: this.hasOrderNumber(text),
      hasSpecificInfo: this.hasSpecificInfo(text),
      length: text.length,
    };
  }

  /**
   * Categorize the ticket based on keywords
   */
  private categorizeText(text: string): string {
    const lowerText = text.toLowerCase();

    if (
      lowerText.includes('ship') ||
      lowerText.includes('deliver') ||
      lowerText.includes('order') ||
      lowerText.includes('track') ||
      lowerText.includes('package') ||
      lowerText.includes('logistics') ||
      lowerText.includes('freight')
    ) {
      return 'shipping';
    }

    if (
      lowerText.includes('bill') ||
      lowerText.includes('payment') ||
      lowerText.includes('invoice') ||
      lowerText.includes('charge') ||
      lowerText.includes('refund') ||
      lowerText.includes('credit card') ||
      lowerText.includes('subscription')
    ) {
      return 'billing';
    }

    if (
      lowerText.includes('bug') ||
      lowerText.includes('error') ||
      lowerText.includes('crash') ||
      lowerText.includes('broken') ||
      lowerText.includes('technical') ||
      lowerText.includes('issue') ||
      lowerText.includes('problem')
    ) {
      return 'technical';
    }

    if (
      lowerText.includes('account') ||
      lowerText.includes('password') ||
      lowerText.includes('login') ||
      lowerText.includes('profile') ||
      lowerText.includes('email')
    ) {
      return 'account';
    }

    return 'other';
  }

  /**
   * Determine priority level based on keywords and urgency indicators
   */
  private determinePriority(text: string): 'low' | 'medium' | 'high' | 'urgent' {
    const lowerText = text.toLowerCase();

    const urgentKeywords = [
      'urgent',
      'emergency',
      'asap',
      'immediately',
      '紧急',
      '立即',
      'critical',
      'severe',
      'catastrophic',
    ];

    const highKeywords = [
      'important',
      'urgent',
      'important',
      'high priority',
      'quickly',
      'soon',
    ];

    if (urgentKeywords.some((kw) => lowerText.includes(kw))) {
      return 'urgent';
    }

    if (highKeywords.some((kw) => lowerText.includes(kw))) {
      return 'high';
    }

    const negativeKeywords = ['angry', 'frustrated', 'terrible', 'worst'];
    if (negativeKeywords.some((kw) => lowerText.includes(kw))) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Extract important keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .match(/\b\w+\b/g)
      ?.filter((word) => word.length > 3 && !/^\d+$/.test(word)) || [];

    // Count word frequency
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Sort by frequency and get top 5
    const sorted = Array.from(wordFreq.entries())
      .filter(([word]) => !this.isCommonWord(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return sorted;
  }

  /**
   * Analyze sentiment of the text
   */
  private analyzeSentiment(
    text: string,
  ): 'positive' | 'neutral' | 'negative' {
    const lowerText = text.toLowerCase();

    const positiveWords = [
      'thank',
      'appreciate',
      'love',
      'great',
      'excellent',
      'amazing',
      'good',
      'wonderful',
      'perfect',
      'satisfied',
      'happy',
    ];

    const negativeWords = [
      'angry',
      'frustrated',
      'terrible',
      'bad',
      'horrible',
      'awful',
      'hate',
      'disappointed',
      'worst',
      'unacceptable',
      'delayed',
      'delay',
      'late',
      'wrong',
      'broken',
      'damage',
      'lost',
      'missing',
      'error',
      'failed',
      'problem',
      'issue',
      'complaint',
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) positiveCount++;
    }

    for (const word of negativeWords) {
      if (lowerText.includes(word)) negativeCount++;
    }

    if (negativeCount > positiveCount) {
      return 'negative';
    } else if (positiveCount > negativeCount) {
      return 'positive';
    }

    return 'neutral';
  }

  /**
   * Generate a summary of the text
   */
  private generateSummary(text: string): string {
    if (text.length <= 100) {
      return text;
    }
    return text.substring(0, 100) + '...';
  }

  /**
   * Check if text contains order number
   */
  private hasOrderNumber(text: string): boolean {
    return /\b#?\d{4,}\b/.test(text);
  }

  /**
   * Check if text has specific information (not just general complaint)
   */
  private hasSpecificInfo(text: string): boolean {
    // Check for numbers, specific terms, or detailed descriptions
    const hasNumbers = /\d+/.test(text);
    const hasOrderRef = /(order|ticket|#|order number|ticket id)/i.test(text);
    // Consider specific if has order reference with numbers, or has multiple details
    const hasMultipleDetails = text.split(/\s+/).length >= 4;

    return (hasNumbers && hasOrderRef) || (hasOrderRef && hasMultipleDetails);
  }

  /**
   * Check if word is a common word to filter out
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'is',
      'are',
      'was',
      'be',
      'have',
      'has',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'can',
      'may',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
    ]);

    return commonWords.has(word);
  }
}
