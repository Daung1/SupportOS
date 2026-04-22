/**
 * AI Optimization Service
 * Provides Chat-with-AI features for optimizing responses
 * Supports various optimization suggestions like "make friendlier", "add examples", "shorten", etc.
 */

import { Inject, Injectable } from '@nestjs/common';
import { IModelClient } from '../agents/core/model-client.interface';

export const MODEL_CLIENT_TOKEN = 'IModelClient';

export type OptimizationType =
  | 'make_friendlier'
  | 'add_examples'
  | 'shorten'
  | 'extend'
  | 'formalize'
  | 'simplify'
  | 'emphasize'
  | 'custom';

export interface OptimizationRequest {
  originalContent: string;
  type: OptimizationType;
  customInstruction?: string;
  context?: string;
}

export interface OptimizedContent {
  original: string;
  optimized: string;
  type: OptimizationType;
  rationale: string;
}

@Injectable()
export class AIOptimizationService {
  constructor(
    @Inject(MODEL_CLIENT_TOKEN) private modelClient: IModelClient,
  ) {}

  /**
   * Apply optimization to content
   */
  async optimizeContent(
    request: OptimizationRequest,
  ): Promise<OptimizedContent> {
    const systemPrompt =
      this.buildSystemPrompt(request.type, request.customInstruction);
    const userPrompt = this.buildUserPrompt(request);

    try {
      const response = await this.modelClient.call(
        [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        systemPrompt,
        {
          temperature: 0.7,
          maxTokens: 1000,
        },
      );

      // Parse response to extract optimized content and rationale
      const { optimized, rationale } = this.parseResponse(response);

      return {
        original: request.originalContent,
        optimized,
        type: request.type,
        rationale,
      };
    } catch (error) {
      throw new Error(
        `Failed to optimize content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Suggest optimization options for content
   */
  async suggestOptimizations(
    content: string,
  ): Promise<{ suggestion: string; description: string }[]> {
    const suggestions = [
      {
        suggestion: 'make_friendlier',
        description: 'Make the tone friendlier and warmer',
      },
      {
        suggestion: 'add_examples',
        description: 'Add concrete examples or scenarios',
      },
      {
        suggestion: 'shorten',
        description: 'Shorten the content while keeping the core message',
      },
      {
        suggestion: 'extend',
        description: 'Expand the content with more details',
      },
      {
        suggestion: 'formalize',
        description: 'Use a more formal tone',
      },
      {
        suggestion: 'simplify',
        description: 'Simplify complex concepts and wording',
      },
      {
        suggestion: 'emphasize',
        description: 'Emphasize key information and highlights',
      },
    ];

    // Filter suggestions based on content characteristics
    const contentLength = content.length;
    const hasComplexTerms = /[^\u0000-\u007F]+/.test(content); // Has non-ASCII

    if (contentLength < 100) {
      // Short content - suggest extension
      return suggestions.filter((s) => s.suggestion !== 'shorten');
    }

    if (contentLength > 500) {
      // Long content - suggest shortening
      return suggestions.filter((s) => s.suggestion !== 'extend');
    }

    return suggestions;
  }

  /**
   * Build system prompt for optimization
   */
  private buildSystemPrompt(
    type: OptimizationType,
    customInstruction?: string,
  ): string {
    const prompts: Record<OptimizationType, string> = {
      make_friendlier: `You are a customer service expert. Rewrite the given text to be more friendly, warm, and conversational while maintaining all important information. Use contractions, personal touches, and empathetic language.`,

      add_examples: `You are a communication specialist. Add specific, concrete examples to the given text to make it clearer and more helpful. Use real-world scenarios that customers can relate to.`,

      shorten: `You are an editor. Condense the given text to its essential points while maintaining clarity. Remove redundancy and unnecessary details. Keep it concise but still complete.`,

      extend: `You are a detail-oriented writer. Expand the given text with more context, examples, and explanations. Provide customers with comprehensive information they might need.`,

      formalize: `You are a professional communication consultant. Rewrite the given text in a more formal, professional tone. Use proper grammar, complete sentences, and business-appropriate language.`,

      simplify: `You are a plain language expert. Rewrite the given text using simpler words and shorter sentences. Make it accessible to all customers, regardless of their background.`,

      emphasize: `You are a marketing specialist. Rewrite the given text to emphasize key points and important information. Use formatting hints (like [IMPORTANT:]) to draw attention to critical details.`,

      custom: customInstruction || 'Modify the text as requested.',
    };

    return prompts[type];
  }

  /**
   * Build user prompt for optimization
   */
  private buildUserPrompt(request: OptimizationRequest): string {
    let prompt = `Please optimize this customer service response:\n\n"${request.originalContent}"\n\n`;

    if (request.context) {
      prompt += `Context: ${request.context}\n\n`;
    }

    prompt +=
      'Provide your optimized version in the response, keeping the same factual content.';

    return prompt;
  }

  /**
   * Parse response from LLM
   */
  private parseResponse(response: string): {
    optimized: string;
    rationale: string;
  } {
    // Try to extract the optimized content and rationale from the response
    // Look for common patterns like "Optimized version:" or "Here's the revised version:"

    const lines = response.split('\n');
    let optimized = '';
    let rationale = '';
    let inOptimized = false;

    for (const line of lines) {
      if (
        line.includes('Optimized version:') ||
        line.includes('Here is the')
      ) {
        inOptimized = true;
        continue;
      }

      if (inOptimized && line.includes('Rationale:')) {
        inOptimized = false;
        continue;
      }

      if (inOptimized && line.trim()) {
        optimized += line + '\n';
      } else if (!inOptimized && rationale.length === 0 && line.trim()) {
        rationale += line + '\n';
      }
    }

    // If we didn't find structure, use the entire response as optimized
    if (!optimized.trim()) {
      optimized = response;
      rationale = 'Content optimized by AI';
    }

    return {
      optimized: optimized.trim(),
      rationale: rationale.trim() || 'Content optimized successfully',
    };
  }
}
