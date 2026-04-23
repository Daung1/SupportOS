/**
 * DefaultPipelineProvider - the static Level 3 pipeline.
 *
 * Returns the canonical "Analyze, then fetch docs if unsure, then
 * generate" flow:
 *
 *   Analyzer -> Searcher (skipped when analyzer is confident) -> Generator
 *
 * The Searcher condition reads the analyzer output from SharedState
 * (populated by the orchestrator after the analyzer route completes).
 * When analyzer confidence is >= 0.8 we skip the knowledge-base lookup
 * to save one LLM call + vector-store round-trip; the generator's FAQ
 * / classification logic can still handle the ticket with just the
 * analyzer output.
 *
 * This class is a pure factory - it owns no state between calls, so a
 * single provider instance can serve concurrent sessions safely.
 *
 * Upgrade path (see decision 2):
 *   Replace this provider with a SmartPipelineProvider that asks an LLM
 *   to propose a pipeline per ticket.  The orchestrator is unaware of
 *   the switch because it only depends on IPipelineProvider.
 */

import { Injectable } from '@nestjs/common';
import { ISessionContext } from '../core/execution-context.interface';
import { SharedState } from '../core/shared-state';
import { AnalyzerAgent } from '../impl/analyzer.agent';
import { SearcherAgent } from '../impl/searcher.agent';
import { GeneratorAgent } from '../impl/generator.agent';
import {
  AgentPipeline,
  AgentRouteCondition,
  IPipelineProvider,
} from './pipeline.interface';

/** Stable pipeline identifier used in logs / metrics / TicketLog rows. */
export const DEFAULT_PIPELINE_ID = 'default.analyzer-searcher-generator';

/**
 * Confidence cut-off for skipping the Searcher route.  When the analyzer
 * reports confidence >= this threshold we trust the classification alone
 * and jump straight to generation.  Tuned for the current classifier
 * which caps confidence at 0.95; adjust together with classifier output.
 */
export const SKIP_SEARCHER_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Route ids used by the default pipeline.  Exported so the orchestrator,
 * persistence layer, and tests can reference the same strings without
 * hard-coding them.
 */
export const DEFAULT_PIPELINE_ROUTES = {
  analyzer: 'analyzer',
  searcher: 'searcher',
  generator: 'generator',
} as const;

/**
 * Condition for the Searcher route.  Exposed as a standalone function so
 * tests can exercise the skip logic without constructing the full
 * provider + pipeline.
 *
 * Behaviour:
 *   - No analyzer result yet        -> run searcher (safe default)
 *   - Analyzer confidence undefined -> run searcher (assume low)
 *   - Analyzer confidence >= 0.8    -> skip searcher
 *   - Analyzer confidence < 0.8     -> run searcher
 */
export const shouldRunSearcher: AgentRouteCondition = (
  context: ISessionContext,
) => {
  const analyzer = SharedState.from(context).get('analyzerResult');
  if (!analyzer) return true;
  const confidence = analyzer.confidence;
  if (typeof confidence !== 'number') return true;
  return confidence < SKIP_SEARCHER_CONFIDENCE_THRESHOLD;
};

@Injectable()
export class DefaultPipelineProvider implements IPipelineProvider {
  constructor(
    private readonly analyzerAgent: AnalyzerAgent,
    private readonly searcherAgent: SearcherAgent,
    private readonly generatorAgent: GeneratorAgent,
  ) {}

  /**
   * Build the default pipeline.  The context argument is unused today
   * but is part of the interface so future providers can vary the
   * pipeline by ticket content, tenant, etc.
   */
  async getPipeline(_context: ISessionContext): Promise<AgentPipeline> {
    return {
      id: DEFAULT_PIPELINE_ID,
      description:
        'Analyzer -> Searcher (skipped when analyzer is confident) -> Generator',
      routes: [
        {
          id: DEFAULT_PIPELINE_ROUTES.analyzer,
          agent: this.analyzerAgent,
          publishAs: 'analyzerResult',
        },
        {
          id: DEFAULT_PIPELINE_ROUTES.searcher,
          agent: this.searcherAgent,
          condition: shouldRunSearcher,
          publishAs: 'searcherResult',
        },
        {
          id: DEFAULT_PIPELINE_ROUTES.generator,
          agent: this.generatorAgent,
          publishAs: 'generatorResult',
        },
      ],
    };
  }
}
