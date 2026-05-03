/**
 * AI Optimization Service
 * Provides Chat-with-AI features for optimizing responses
 * Supports various optimization suggestions like "make friendlier", "add examples", "shorten", etc.
 */

import { Inject, Injectable } from '@nestjs/common';
import { IModelClient, ModelCallContext } from '../agents/core/model-client.interface';

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
  /**
   * Optional attribution passed through to the model client so the
   * TokenTracker can bill this call against a session / ticket.
   * When omitted, the LLM call still runs but usage is not recorded.
   */
  callContext?: ModelCallContext;
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
        {
          ...(request.callContext ?? {}),
          agentName: request.callContext?.agentName ?? 'ai-optimization',
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
      make_friendlier: `You are a seasoned customer support specialist. Rewrite the email body to sound warmer and more genuinely human — the kind of reply a knowledgeable colleague would send, not a corporate template. Use natural contractions, show real empathy, and keep the factual content intact. No bullet points.`,

      add_examples: `You are a seasoned customer support specialist. Enrich the email body by weaving in a brief, concrete example or scenario that helps the customer understand the point more easily. Keep it conversational and relevant. No bullet points.`,

      shorten: `You are a seasoned customer support specialist. Tighten the email body to its essential message — cut redundancy and filler without losing warmth or key information. Aim for 2 short, punchy paragraphs.`,

      extend: `You are a seasoned customer support specialist. Expand the email body with a little more helpful context or a gentle next-step suggestion. Keep the tone natural and conversational. Add at most one extra paragraph.`,

      formalize: `You are a seasoned customer support specialist. Rewrite the email body in a more professional tone — polished and precise, but still warm and human. Avoid stiff corporate language; think senior support advisor, not legal brief.`,

      simplify: `You are a seasoned customer support specialist. Rewrite the email body using simpler, everyday language so any customer can understand it immediately. Short sentences, plain words, no jargon. Keep it friendly.`,

      emphasize: `You are a seasoned customer support specialist. Rewrite the email body so the single most important point stands out clearly. You can lead with it or reinforce it at the end — but keep the overall tone natural, not promotional.`,

      custom: customInstruction
        ? `You are a seasoned customer support specialist. Rewrite the email body following this instruction: ${customInstruction}. Keep the tone warm, professional, and human. No bullet points unless explicitly asked.`
        : 'Rewrite the email body as a seasoned customer support specialist would — warm, clear, and human.',
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
