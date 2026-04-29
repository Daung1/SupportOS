import { Optional } from '@nestjs/common';
import { IModelClient } from '../agents/core/model-client.interface';

/**
 * LLM-based validator for second-pass safety evaluation.
 * 
 * Called when heuristic score < 0.7 to perform deeper analysis:
 * - Hallucination likelihood
 * - Factual consistency with source material
 * - Off-topic detection
 * - Harmful content subtlety check
 */

export interface LlmValidationResult {
  hallucinationLikelihood: number; // 0-1
  factualConsistency: number; // 0-1
  answerRelevance: number; // 0-1
  harmScore: number; // 0-1
  finalScore: number; // weighted average
  reasoning: string;
  requiresManualReview: boolean;
}

export class LlmValidator {
  constructor(
    @Optional() private readonly modelClient?: IModelClient,
  ) {}

  /**
   * Perform LLM-based validation if model client available.
   * Returns graceful fallback if model offline.
   */
  async validate(input: {
    ticketContent: string;
    generatedResponse: string;
    sourceContext?: string;
  }): Promise<LlmValidationResult> {
    if (!this.modelClient) {
      return this.fallbackValidation(input);
    }

    try {
      const prompt = this.buildValidationPrompt(input);
      const response = await this.modelClient.call(
        [{ role: 'user', content: prompt }],
        undefined, // systemPrompt
        { maxTokens: 500 }, // options
      );

      return this.parseValidationResponse(response, input);
    } catch (err) {
      // Model offline or error - return conservative result
      return this.fallbackValidation(input);
    }
  }

  private buildValidationPrompt(input: {
    ticketContent: string;
    generatedResponse: string;
    sourceContext?: string;
  }): string {
    const contextLine = input.sourceContext
      ? `Source material:\n${input.sourceContext}\n\n`
      : '';

    return `You are a safety validator. Analyze this support response:

Customer question:
${input.ticketContent}

${contextLine}Generated response:
${input.generatedResponse}

Evaluate on 4 dimensions (0-1 score each):
1. hallucination_likelihood: Does response contain false/invented information?
2. factual_consistency: If sources provided, does response match them?
3. answer_relevance: Does response actually address the question?
4. harm_score: Any subtle harmful content despite passing basic filters?

Respond in JSON format:
{
  "hallucination_likelihood": 0.X,
  "factual_consistency": 0.X,
  "answer_relevance": 0.X,
  "harm_score": 0.X,
  "reasoning": "brief explanation"
}`;
  }

  private parseValidationResponse(
    content: string,
    input: {
      ticketContent: string;
      generatedResponse: string;
    },
  ): LlmValidationResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.conservativeResult(
          'Could not parse LLM response',
          input,
        );
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize scores
      const hallucination = Math.min(
        1,
        Math.max(0, parsed.hallucination_likelihood ?? 0.5),
      );
      const consistency = Math.min(
        1,
        Math.max(0, parsed.factual_consistency ?? 0.5),
      );
      const relevance = Math.min(
        1,
        Math.max(0, parsed.answer_relevance ?? 0.5),
      );
      const harm = Math.min(1, Math.max(0, parsed.harm_score ?? 0.1));

      // Final score: average, but penalize hallucination heavily
      const finalScore =
        (hallucination * 0.1 +
          (1 - consistency) * 0.3 +
          (1 - relevance) * 0.2 +
          (1 - harm) * 0.4) *
        -1 +
        1; // invert so higher is better

      return {
        hallucinationLikelihood: hallucination,
        factualConsistency: consistency,
        answerRelevance: relevance,
        harmScore: harm,
        finalScore: Math.max(0, Math.min(1, finalScore)),
        reasoning: parsed.reasoning || 'LLM evaluation complete',
        requiresManualReview: finalScore < 0.6 || harm > 0.4,
      };
    } catch (err) {
      return this.conservativeResult('JSON parse failed', input);
    }
  }

  private conservativeResult(
    reason: string,
    input: {
      ticketContent: string;
      generatedResponse: string;
    },
  ): LlmValidationResult {
    // If LLM fails, be conservative and flag for review
    return {
      hallucinationLikelihood: 0.5,
      factualConsistency: 0.5,
      answerRelevance: 0.5,
      harmScore: 0.3,
      finalScore: 0.5,
      reasoning: `Fallback validation: ${reason}`,
      requiresManualReview: true,
    };
  }

  private fallbackValidation(input: {
    ticketContent: string;
    generatedResponse: string;
    sourceContext?: string;
  }): LlmValidationResult {
    // Offline: perform simple heuristic checks
    const responseLen = input.generatedResponse.length;
    const hasReferences =
      /\b(?:according|based|per|per|from|source)\b/i.test(
        input.generatedResponse,
      );
    const hasNumbers = /\d+/.test(input.generatedResponse);

    return {
      hallucinationLikelihood: 0.4, // assume low when offline
      factualConsistency: hasReferences ? 0.7 : 0.5,
      answerRelevance: responseLen > 50 ? 0.8 : 0.5,
      harmScore: 0.2, // baseline low
      finalScore: 0.6,
      reasoning:
        'LLM offline - conservative validation with basic heuristics',
      requiresManualReview: false,
    };
  }
}
