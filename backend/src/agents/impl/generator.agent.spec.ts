/**
 * GeneratorAgent Unit Tests
 *
 * Covers the four scenarios of the Day 14 plan:
 *   A) FAQ           - direct answer, ready to send, not editable
 *   B) DOC_ANSWER    - editable draft + searched document sources
 *   C) TECH_ISSUE    - bug report + customer acknowledgement email
 *   D) OTHER         - suggestion + next-step guidance for support staff
 */

import { GeneratorAgent, GeneratorAgentOutput } from './generator.agent';
import { ProblemClassifier } from '../../classifier/problem.classifier';
import { ProblemType } from '../../classifier/classification-rules';
import { EditableContentManager } from '../../generator/editable-content.manager';
import { TechAssignmentManager } from '../../generator/tech-assignment.manager';
import { FAQMatcher } from '../../cascade/faq.matcher';
import { ISessionContext } from '../core/execution-context.interface';
import { ExecutionResult } from '../core/types';

type PartialContext = Partial<ISessionContext> & {
  state: Map<string, any>;
};

/**
 * Build a lightweight session context good enough for unit-testing the
 * generator.  The `modelClient` is a jest mock so we can assert LLM use
 * without making real API calls.
 */
function makeContext(
  input: string,
  options: {
    state?: Record<string, any>;
    llmResponse?: string;
    metadata?: Record<string, any>;
  } = {},
): PartialContext & ISessionContext {
  const state = new Map<string, any>(
    Object.entries(options.state ?? {}),
  );

  const callMock = jest.fn().mockResolvedValue(options.llmResponse ?? '');

  return {
    sessionId: 'session_test',
    taskId: 'task_test',
    input,
    state,
    history: [],
    toolRegistry: {
      getTool: jest.fn(),
      listTools: jest.fn().mockReturnValue([]),
      registerTool: jest.fn(),
      hasTool: jest.fn().mockReturnValue(false),
    },
    modelClient: {
      call: callMock,
      getLastTokenUsage: jest
        .fn()
        .mockReturnValue({ inputTokens: 0, outputTokens: 0 }),
    },
    metadata: {
      createdAt: new Date(),
      ...(options.metadata ?? {}),
    },
  };
}

describe('GeneratorAgent', () => {
  let classifier: ProblemClassifier;
  let editableManager: EditableContentManager;
  let techManager: TechAssignmentManager;
  let agent: GeneratorAgent;

  beforeEach(() => {
    classifier = new ProblemClassifier();
    editableManager = new EditableContentManager();
    techManager = new TechAssignmentManager();
    agent = new GeneratorAgent(classifier, editableManager, techManager);
  });

  // ---------------------------------------------------------------------------
  // Scenario A: FAQ
  // ---------------------------------------------------------------------------
  describe('Scenario A - FAQ (direct answer)', () => {
    it('returns a FAQ answer when ProblemClassifier tags it as FAQ and FAQMatcher finds a match', async () => {
      const fakeFaqMatcher = {
        match: jest.fn().mockResolvedValue({
          matched: true,
          answer: 'Standard shipping takes 3-5 business days.',
          confidence: 0.95,
          faqId: 'faq_shipping_time',
        }),
      } as unknown as FAQMatcher;

      // Force classifier to return FAQ by spying on its async method
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.FAQ,
        confidence: 0.92,
        reason: 'matched FAQ pattern',
        matchedKeywords: ['shipping'],
      });

      const agentWithFaq = new GeneratorAgent(
        classifier,
        editableManager,
        techManager,
        fakeFaqMatcher,
      );
      const ctx = makeContext('How long does standard shipping take?');

      const result = (await agentWithFaq.execute(ctx)) as ExecutionResult;

      expect(result.success).toBe(true);
      const output = result.output as GeneratorAgentOutput;
      expect(output.type).toBe('FAQ');
      expect(output.source).toBe('faq');
      expect(output.answer).toContain('3-5 business days');
      expect(output.faqId).toBe('faq_shipping_time');
      expect(output.editable).toBe(false);
      expect(output.chatOptimizable).toBe(false);
      expect(output.confidence).toBeGreaterThanOrEqual(0.9);
      expect(fakeFaqMatcher.match).toHaveBeenCalledWith(
        'How long does standard shipping take?',
      );
      // LLM should NOT be called for FAQ path
      expect(ctx.modelClient.call).not.toHaveBeenCalled();
    });

    it('demotes FAQ to OTHER when the FAQMatcher returns no match', async () => {
      const fakeFaqMatcher = {
        match: jest.fn().mockResolvedValue({
          matched: false,
          confidence: 0.3,
        }),
      } as unknown as FAQMatcher;

      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.FAQ,
        confidence: 0.82,
        reason: 'ambiguous FAQ pattern',
        matchedKeywords: [],
      });

      const agentWithFaq = new GeneratorAgent(
        classifier,
        editableManager,
        techManager,
        fakeFaqMatcher,
      );
      const ctx = makeContext('Random text no FAQ should match', {
        llmResponse: 'Thanks for reaching out, here is a suggestion.',
      });

      const result = (await agentWithFaq.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.type).toBe('RESULT_WITH_SUGGESTIONS');
      expect(output.source).toBe('other');
      expect(output.requiresHumanJudgment).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario B: DOC_ANSWER
  // ---------------------------------------------------------------------------
  describe('Scenario B - DOC_ANSWER (editable draft)', () => {
    it('generates an editable draft with search sources and registers an edit record', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.DOC_ANSWER,
        confidence: 0.78,
        reason: 'docs found',
        matchedKeywords: ['order'],
      });

      const searcherResult = {
        documentsFound: 2,
        avgRelevance: 0.83,
        documents: [
          {
            id: 'doc1',
            title: 'Shipping Delay Compensation Policy',
            relevance: 0.92,
            excerpt: 'If a shipment is delayed more than 5 business days ...',
          },
          {
            id: 'doc2',
            title: 'Order Tracking Guide',
            relevance: 0.85,
            content: 'You can track your order from the Order Details page.',
          },
        ],
      };

      const ctx = makeContext(
        'My order is running very late, can I get compensation?',
        {
          state: { searcherResult },
          llmResponse:
            'Dear customer,\n\nAccording to our shipping policy ...\n\nLet us know if we can help further.',
        },
      );

      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.type).toBe('EDITABLE_RESPONSE');
      expect(output.source).toBe('searcher_docs');
      expect(output.editable).toBe(true);
      expect(output.chatOptimizable).toBe(true);
      expect(output.draftContent).toBeDefined();
      expect(output.draftContent?.length).toBeGreaterThan(0);
      expect(output.searchResults).toHaveLength(2);
      expect(output.searchResults?.[0].title).toBe(
        'Shipping Delay Compensation Policy',
      );
      expect(output.editableRecordId).toBeDefined();
      expect(output.confidence).toBeCloseTo(0.83, 2);
      // LLM used to synthesize a draft
      expect(ctx.modelClient.call).toHaveBeenCalledTimes(1);

      // Edit record should actually be persisted in manager
      const history = editableManager.getVersionHistory(ctx.taskId);
      expect(history.length).toBe(1);
      expect(history[0].editedBy).toBe('system');
    });

    it('falls back to a deterministic draft when the LLM call fails', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.DOC_ANSWER,
        confidence: 0.7,
        reason: 'docs found',
        matchedKeywords: ['refund'],
      });

      const searcherResult = {
        documents: [
          { id: 'd', title: 'Refund Policy', excerpt: 'Refunds within 30 days' },
        ],
      };

      const ctx = makeContext('Can I get a refund?', {
        state: { searcherResult },
      });
      (ctx.modelClient.call as jest.Mock).mockRejectedValueOnce(
        new Error('llm unavailable'),
      );

      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.type).toBe('EDITABLE_RESPONSE');
      expect(output.draftContent).toContain('Refund Policy');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario C: TECH_ISSUE
  // ---------------------------------------------------------------------------
  describe('Scenario C - TECH_ISSUE (bug report + customer email)', () => {
    it('creates a bug report and customer acknowledgement email when classified as TECH_ISSUE', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.TECH_ISSUE,
        confidence: 0.88,
        reason: 'crash keyword matched',
        matchedKeywords: ['crash'],
      });

      const ctx = makeContext(
        'Our mobile app keeps crashing after I tap the checkout button.',
        {
          state: {
            analyzerResult: {
              os: 'iOS 17.2',
              appVersion: '4.1.0',
              customerEmail: 'user@example.com',
            },
          },
        },
      );

      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.type).toBe('TECH_ISSUE');
      expect(output.source).toBe('tech_assignment');

      expect(output.bugReport).toBeDefined();
      expect(output.bugReport?.title.toLowerCase()).toContain('crash');
      expect(output.bugReport?.severity).toBe('high');
      expect(output.bugReport?.environment.os).toBe('iOS 17.2');

      expect(output.customerEmail).toBeDefined();
      expect(output.customerEmail?.to).toBe('user@example.com');
      expect(output.customerEmail?.subject).toContain('technical issue');
      expect(output.customerEmail?.body.length).toBeGreaterThan(50);

      expect(output.techAssignment).toBeDefined();
      expect(output.techAssignment?.dueDate).toBeInstanceOf(Date);
      expect(output.techAssignment?.status).toBe('new');

      // No LLM call required to produce the bug report
      expect(ctx.modelClient.call).not.toHaveBeenCalled();

      // Persisted by TechAssignmentManager
      const persisted = techManager.getAssignmentByTicket(ctx.taskId);
      expect(persisted).toBeDefined();
      expect(persisted?.id).toBe(output.techAssignment?.id);
    });

    it('falls back to a placeholder customer email when analyzer did not extract one', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.TECH_ISSUE,
        confidence: 0.8,
        reason: 'error keyword matched',
        matchedKeywords: ['error'],
      });

      const ctx = makeContext('Seeing a 500 error every time I log in.');
      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.customerEmail?.to).toBe('customer@unknown.email');
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario D: OTHER
  // ---------------------------------------------------------------------------
  describe('Scenario D - OTHER (suggestion + next steps)', () => {
    it('returns a suggestion and actionable next steps that require human judgement', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.OTHER,
        confidence: 0.65,
        reason: 'no clear category',
        matchedKeywords: [],
      });

      const ctx = makeContext(
        'Why is the product I bought in January now cheaper?',
        {
          state: {
            analyzerResult: {
              category: 'pricing',
              priority: 'medium',
            },
          },
          llmResponse:
            'Thanks for reaching out. We periodically adjust prices. Please let us know if you would like us to check our price protection policy for your order.',
        },
      );

      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      expect(output.type).toBe('RESULT_WITH_SUGGESTIONS');
      expect(output.source).toBe('other');
      expect(output.suggestion).toContain('price');
      expect(output.requiresHumanJudgment).toBe(true);
      expect(output.nextSteps).toBeDefined();
      expect(output.nextSteps!.length).toBeGreaterThanOrEqual(3);
      expect(output.nextSteps![0]).toHaveProperty('action');
      expect(output.nextSteps![0]).toHaveProperty('note');
      expect(ctx.modelClient.call).toHaveBeenCalledTimes(1);
    });

    it('adds escalation guidance for high priority tickets', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.OTHER,
        confidence: 0.55,
        reason: 'ambiguous',
        matchedKeywords: [],
      });

      const ctx = makeContext('I am very upset, this is urgent!', {
        state: {
          analyzerResult: {
            category: 'complaint',
            priority: 'high',
          },
        },
        llmResponse: 'Apologies for the frustration ...',
      });

      const result = (await agent.execute(ctx)) as ExecutionResult;
      const output = result.output as GeneratorAgentOutput;

      const hasEscalation = output.nextSteps?.some((s) =>
        s.action.toLowerCase().includes('escalate'),
      );
      expect(hasEscalation).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // General behavior / regression guards
  // ---------------------------------------------------------------------------
  describe('General behavior', () => {
    it('always terminates the TAO Loop in a single iteration', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.OTHER,
        confidence: 0.5,
        reason: 'test',
        matchedKeywords: [],
      });

      const ctx = makeContext('Some ticket', {
        llmResponse: 'draft',
      });

      const result = (await agent.execute(ctx)) as ExecutionResult;
      expect(result.iterations).toBe(1);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].action.type).toBe('GENERATE_OTHER');
    });

    it('stores the classification result in context.state for downstream consumers', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.OTHER,
        confidence: 0.5,
        reason: 'test',
        matchedKeywords: [],
      });

      const ctx = makeContext('Ticket', { llmResponse: 'reply' });
      await agent.execute(ctx);

      const stored = ctx.state.get('problemClassification');
      expect(stored).toBeDefined();
      expect(stored.type).toBe(ProblemType.OTHER);
    });

    it('returns a failure observation when an unexpected error happens inside a scenario', async () => {
      jest.spyOn(classifier, 'classifyProblem').mockResolvedValue({
        type: ProblemType.TECH_ISSUE,
        confidence: 0.8,
        reason: 'bug',
        matchedKeywords: ['bug'],
      });

      jest
        .spyOn(techManager, 'createBugReport')
        .mockImplementation(() => {
          throw new Error('db down');
        });

      const ctx = makeContext('App is broken');
      const result = (await agent.execute(ctx)) as ExecutionResult;

      expect(result.success).toBe(false);
      expect(result.error).toContain('db down');
    });
  });
});
