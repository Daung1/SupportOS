/**
 * ProblemClassifier unit tests.
 *
 * Two specs are intentionally narrow and focused on the behaviour
 * change introduced by Option 1 (passing L0 TriageResult through to the
 * classifier as a strong prior for TECH_ISSUE):
 *
 *   1. Without a triage hint, the original keyword threshold must keep
 *      working - we don't want to silently regress the lexical gate
 *      that historically drives Scenario C.
 *
 *   2. With `triage.category='product'` AND >= 1 malfunction keyword,
 *      short inputs that previously fell below the 0.7 lexical bar
 *      must now route to TECH_ISSUE.  This is the "buy button doesn't
 *      work" case.
 */

import { ProblemClassifier } from './problem.classifier';
import { ProblemType } from './classification-rules';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { SharedTriageResult } from '../agents/core/shared-state';

function makeContext(
  input: string,
  state: Partial<{
    analyzerResult: any;
    triageResult: SharedTriageResult;
  }> = {},
): ISessionContext {
  const map = new Map<string, any>();
  if (state.analyzerResult) map.set('analyzerResult', state.analyzerResult);
  if (state.triageResult) map.set('triageResult', state.triageResult);

  return {
    sessionId: 'sess',
    taskId: 'task',
    input,
    state: map,
    history: [],
    toolRegistry: {
      getTool: () => undefined,
      listTools: () => [],
      registerTool: () => undefined,
      hasTool: () => false,
    },
    modelClient: {
      call: async () => '',
      getLastTokenUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    } as any,
    metadata: { createdAt: new Date() },
  };
}

describe('ProblemClassifier', () => {
  let classifier: ProblemClassifier;

  beforeEach(() => {
    classifier = new ProblemClassifier();
  });

  describe('without triage hint (legacy keyword path)', () => {
    it('classifies as TECH_ISSUE when >= 3 malfunction keywords are present', async () => {
      // Matches: "crash", "cannot", "bug" -> 3 hits -> 0.9 confidence
      const ctx = makeContext(
        'the app crashed and I cannot login because of a bug',
      );
      const result = await classifier.classifyProblem(ctx);

      expect(result.type).toBe(ProblemType.TECH_ISSUE);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('does NOT classify as TECH_ISSUE on a single weak malfunction keyword', async () => {
      // "issue" alone -> matchCount=1 -> 0.3 confidence -> below 0.7
      const ctx = makeContext('there is some issue with the page');
      const result = await classifier.classifyProblem(ctx);

      expect(result.type).not.toBe(ProblemType.TECH_ISSUE);
    });
  });

  describe('with triage.category=product prior', () => {
    it('classifies as TECH_ISSUE for short inputs with just one malfunction keyword', async () => {
      // 1 keyword ("broken") - below the 0.7 lexical bar (0.3 confidence)
      // L0 has already labelled the topic as product, so the prior kicks in.
      const triage: SharedTriageResult = {
        inDomain: true,
        intent: 'question',
        category: 'product',
        confidence: 0.85,
        reformulated: 'The buy button is broken.',
        reason: 'product malfunction',
      };
      const ctx = makeContext('buy button broken', {
        triageResult: triage,
      });

      const result = await classifier.classifyProblem(ctx);

      expect(result.type).toBe(ProblemType.TECH_ISSUE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.matchedKeywords).toContain('broken');
      expect(result.reason).toMatch(/product/);
    });

    it('does NOT route to TECH_ISSUE when triage=product but zero malfunction keywords', async () => {
      // "where can I buy this product" - product topic but no malfunction
      // signal; should fall through to FAQ / DOC_ANSWER / OTHER paths.
      const triage: SharedTriageResult = {
        inDomain: true,
        intent: 'question',
        category: 'product',
        confidence: 0.9,
        reformulated: null,
        reason: 'product question',
      };
      const ctx = makeContext('what colors does this product come in', {
        triageResult: triage,
      });

      const result = await classifier.classifyProblem(ctx);

      expect(result.type).not.toBe(ProblemType.TECH_ISSUE);
    });

    it('does NOT apply the prior when triage.category is shipping/billing/etc.', async () => {
      // Same input as the positive case, but triage says shipping.
      // We should fall through to legacy keyword path - which for a
      // single keyword is below 0.7, so NOT TECH_ISSUE.
      const triage: SharedTriageResult = {
        inDomain: true,
        intent: 'question',
        category: 'shipping',
        confidence: 0.9,
        reformulated: null,
        reason: 'order tracking',
      };
      const ctx = makeContext('package broken', {
        triageResult: triage,
      });

      const result = await classifier.classifyProblem(ctx);

      expect(result.type).not.toBe(ProblemType.TECH_ISSUE);
    });

    it('does NOT treat defective-item / exchange / return as TECH_ISSUE (hang inside exchange)', async () => {
      // Regression: naive substring "hang" matched inside "exchange",
      // combined with triage=product prior, wrongly escalated to Scenario C.
      const triage: SharedTriageResult = {
        inDomain: true,
        intent: 'question',
        category: 'product',
        confidence: 0.9,
        reformulated: null,
        reason: 'defective item policy',
      };
      const ctx = makeContext(
        "I found that the item is defective. Can I exchange it? If an exchange isn't possible, I would like to return it. What is the process for this?",
        { triageResult: triage },
      );

      const result = await classifier.classifyProblem(ctx);

      expect(result.type).not.toBe(ProblemType.TECH_ISSUE);
    });
  });
});
