/// <reference types="jest" />

/**
 * DefaultPipelineProvider tests.
 *
 * Covers the static pipeline shape plus the shouldRunSearcher condition
 * logic.  The provider itself is thin (it wires DI-provided agents into
 * a fixed structure), so most of the value in these tests comes from
 * pinning down the condition behaviour before A.4 starts reading it.
 */

import {
  DefaultPipelineProvider,
  DEFAULT_PIPELINE_ID,
  DEFAULT_PIPELINE_ROUTES,
  SKIP_SEARCHER_CONFIDENCE_THRESHOLD,
  shouldRunSearcher,
} from './default-pipeline.provider';
import { assertValidPipeline } from './pipeline.interface';
import { AnalyzerAgent } from '../impl/analyzer.agent';
import { SearcherAgent } from '../impl/searcher.agent';
import { GeneratorAgent } from '../impl/generator.agent';
import { ISessionContext } from '../core/execution-context.interface';
import { SharedAnalyzerResult } from '../core/shared-state';

function stubAgent<T>(name: string): T {
  return {
    name,
    description: `${name} stub`,
    async execute() {
      return { success: true, output: null, iterations: 0 };
    },
  } as unknown as T;
}

function makeContext(
  stateInit: Record<string, unknown> = {},
): ISessionContext {
  return {
    sessionId: 'sess_1',
    taskId: 'task_1',
    input: 'hello',
    state: new Map<string, any>(Object.entries(stateInit)),
    history: [],
    toolRegistry: {
      getTool: () => undefined,
      listTools: () => [],
      registerTool: () => {
        /* no-op */
      },
      hasTool: () => false,
    },
    modelClient: {
      call: async () => '',
      getLastTokenUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    } as any,
    metadata: { createdAt: new Date() },
  };
}

describe('DefaultPipelineProvider', () => {
  let provider: DefaultPipelineProvider;

  beforeEach(() => {
    provider = new DefaultPipelineProvider(
      stubAgent<AnalyzerAgent>('AnalyzerAgent'),
      stubAgent<SearcherAgent>('SearcherAgent'),
      stubAgent<GeneratorAgent>('GeneratorAgent'),
    );
  });

  describe('getPipeline()', () => {
    test('returns a pipeline with the canonical id', async () => {
      const pipeline = await provider.getPipeline(makeContext());
      expect(pipeline.id).toBe(DEFAULT_PIPELINE_ID);
    });

    test('returns three routes in the canonical order', async () => {
      const pipeline = await provider.getPipeline(makeContext());
      expect(pipeline.routes).toHaveLength(3);
      expect(pipeline.routes.map((r) => r.id)).toEqual([
        DEFAULT_PIPELINE_ROUTES.analyzer,
        DEFAULT_PIPELINE_ROUTES.searcher,
        DEFAULT_PIPELINE_ROUTES.generator,
      ]);
    });

    test('only the searcher route carries a condition', async () => {
      const pipeline = await provider.getPipeline(makeContext());
      const analyzer = pipeline.routes[0];
      const searcher = pipeline.routes[1];
      const generator = pipeline.routes[2];
      expect(analyzer.condition).toBeUndefined();
      expect(searcher.condition).toBeDefined();
      expect(generator.condition).toBeUndefined();
    });

    test('routes reference the DI-provided agents by reference', async () => {
      const analyzer = stubAgent<AnalyzerAgent>('A');
      const searcher = stubAgent<SearcherAgent>('B');
      const generator = stubAgent<GeneratorAgent>('C');
      const p = new DefaultPipelineProvider(analyzer, searcher, generator);
      const pipeline = await p.getPipeline(makeContext());
      expect(pipeline.routes[0].agent).toBe(analyzer);
      expect(pipeline.routes[1].agent).toBe(searcher);
      expect(pipeline.routes[2].agent).toBe(generator);
    });

    test('produced pipeline passes assertValidPipeline', async () => {
      const pipeline = await provider.getPipeline(makeContext());
      expect(() => assertValidPipeline(pipeline)).not.toThrow();
    });
  });

  describe('shouldRunSearcher()', () => {
    function contextWithAnalyzer(
      analyzer: Partial<SharedAnalyzerResult> | undefined,
    ): ISessionContext {
      const state: Record<string, unknown> = {};
      if (analyzer !== undefined) {
        state.analyzerResult = analyzer;
      }
      return makeContext(state);
    }

    // shouldRunSearcher returns `boolean | Promise<boolean>`; normalise
    // via `await` so the tests work regardless of whether it stays
    // synchronous or becomes async in the future.

    test('runs searcher when analyzer has not populated shared state', async () => {
      expect(await shouldRunSearcher(contextWithAnalyzer(undefined))).toBe(
        true,
      );
    });

    test('runs searcher when analyzer confidence is missing', async () => {
      const ctx = contextWithAnalyzer({
        category: 'shipping',
        priority: 'medium',
        keywords: ['delay'],
      });
      expect(await shouldRunSearcher(ctx)).toBe(true);
    });

    test('runs searcher when analyzer confidence is below threshold', async () => {
      const ctx = contextWithAnalyzer({
        category: 'shipping',
        priority: 'medium',
        keywords: ['delay'],
        confidence: SKIP_SEARCHER_CONFIDENCE_THRESHOLD - 0.05,
      });
      expect(await shouldRunSearcher(ctx)).toBe(true);
    });

    test('skips searcher when analyzer confidence meets the threshold', async () => {
      const ctx = contextWithAnalyzer({
        category: 'shipping',
        priority: 'medium',
        keywords: ['delay'],
        confidence: SKIP_SEARCHER_CONFIDENCE_THRESHOLD,
      });
      expect(await shouldRunSearcher(ctx)).toBe(false);
    });

    test('skips searcher when analyzer confidence is above threshold', async () => {
      const ctx = contextWithAnalyzer({
        category: 'shipping',
        priority: 'medium',
        keywords: ['delay'],
        confidence: 0.95,
      });
      expect(await shouldRunSearcher(ctx)).toBe(false);
    });
  });
});
