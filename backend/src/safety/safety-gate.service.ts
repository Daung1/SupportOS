import { Injectable, Logger, Optional } from '@nestjs/common';
import { IModelClient } from '../agents/core/model-client.interface';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { SharedSafetyResult } from '../agents/core/shared-state';
import { ISafetyGate } from '../agents/orchestrator/ports/orchestrator-ports';
import { RuleChecker } from './rule.checker';
import { HeuristicScorer } from './heuristic.scorer';
import { LlmValidator } from './llm.validator';

/**
 * SafetyGate: Multi-layer evaluation for AI-generated responses.
 * Implements ISafetyGate port for orchestrator integration.
 * 
 * Layer 1: Rule checker (immediate reject on policy violations)
 * Layer 2: Heuristic scorer (5-dimensional evaluation)
 * Layer 3: LLM validator (deep analysis if heuristic < 0.7)
 * 
 * Decision:
 * - approve: total >= 0.85
 * - review: 0.6 - 0.85 (flag for human)
 * - reject: < 0.6 (strong concerns)
 */
@Injectable()
export class SafetyGate implements ISafetyGate {
  private readonly logger = new Logger(SafetyGate.name);
  private readonly ruleChecker = new RuleChecker();
  private readonly heuristicScorer = new HeuristicScorer();
  private readonly llmValidator: LlmValidator;

  constructor(@Optional() modelClient?: IModelClient) {
    this.llmValidator = new LlmValidator(modelClient);
  }

  /**
   * Evaluate generated response through all safety layers.
   * Implements ISafetyGate.evaluate() port interface.
   */
  async evaluate(
    generatorOutput: unknown,
    context: ISessionContext,
  ): Promise<SharedSafetyResult> {
    const reasoning: string[] = [];

    // Extract response and metadata from generator output
    const response = this.extractResponse(generatorOutput);
    if (!response) {
      return {
        decision: 'reject',
        confidence: 0.0,
        scores: { rule: true, heuristic: 0, llm: 0, final: 0 },
        reasons: ['Generator output missing or invalid'],
      };
    }

    // Layer 1: Rule checker (fast, blocking)
    const ruleResult = this.ruleChecker.check(response);
    if (ruleResult.violated) {
      reasoning.push(`Rule check failed: ${ruleResult.reason}`);
      return {
        decision: 'reject',
        confidence: 0.0,
        scores: { rule: false, heuristic: 0, llm: 0, final: 0 },
        reasons: reasoning,
      };
    }

    reasoning.push('Rule check passed');
    const ruleScore = 1.0;

    // Layer 2: Heuristic scorer
    const heuristicResult = this.heuristicScorer.score({
      content: response,
      analyzerConfidence: context.state?.get('analyzerResult')?.confidence,
      hasSearchResults: Boolean(context.state?.get('searcherResult')),
      searchResultCount: Array.isArray(context.state?.get('searcherResult'))
        ? context.state?.get('searcherResult').length
        : 0,
    });

    reasoning.push(`Heuristic score: ${heuristicResult.totalScore.toFixed(2)}`);
    reasoning.push(...heuristicResult.breakdown);

    let llmScore = 0;

    // Layer 3: LLM validator (only if heuristic < 0.7)
    if (heuristicResult.totalScore < 0.7) {
      const searchResults = context.state?.get('searcherResult');
      const sourceContext = Array.isArray(searchResults)
        ? searchResults
            .map((r: any) => r.content || r)
            .slice(0, 3)
            .join('\n---\n')
        : undefined;

      const llmResult = await this.llmValidator.validate({
        ticketContent: context.metadata?.ticketId || 'unknown',
        generatedResponse: response,
        sourceContext,
      });

      llmScore = llmResult.finalScore;
      reasoning.push(
        `LLM validation triggered (heuristic ${heuristicResult.totalScore.toFixed(2)} < 0.7)`,
      );
      reasoning.push(
        `LLM score: ${llmScore.toFixed(2)} - ${llmResult.reasoning}`,
      );
    } else {
      reasoning.push('LLM validation skipped (heuristic >= 0.7)');
    }

    // Compute final score (weighted average)
    const finalScore =
      ruleScore * 0.2 +
      heuristicResult.totalScore * 0.5 +
      llmScore * 0.3;

    // Determine decision
    let decision: 'approve' | 'review' | 'reject';
    if (finalScore >= 0.85) {
      decision = 'approve';
      reasoning.push(
        `Final score ${finalScore.toFixed(2)} >= 0.85 => APPROVE`,
      );
    } else if (finalScore >= 0.6) {
      decision = 'review';
      reasoning.push(
        `Final score ${finalScore.toFixed(2)} in [0.6, 0.85) => REVIEW`,
      );
    } else {
      decision = 'reject';
      reasoning.push(`Final score ${finalScore.toFixed(2)} < 0.6 => REJECT`);
    }

    return {
      decision,
      confidence: finalScore,
      scores: {
        rule: ruleResult.violated === false,
        heuristic: heuristicResult.totalScore,
        llm: llmScore > 0 ? llmScore : undefined,
        final: finalScore,
      },
      reasons: reasoning,
    };
  }

  /**
   * Extract response string from generator output.
   * Handles different output formats from different generators.
   */
  private extractResponse(output: unknown): string | undefined {
    if (typeof output === 'string') {
      return output;
    }

    if (
      output &&
      typeof output === 'object' &&
      'suggestion' in output &&
      typeof (output as any).suggestion === 'string'
    ) {
      return (output as any).suggestion;
    }

    if (
      output &&
      typeof output === 'object' &&
      'response' in output &&
      typeof (output as any).response === 'string'
    ) {
      return (output as any).response;
    }

    if (
      output &&
      typeof output === 'object' &&
      'content' in output &&
      typeof (output as any).content === 'string'
    ) {
      return (output as any).content;
    }

    return undefined;
  }
}
