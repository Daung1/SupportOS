/// <reference types="jest" />

/**
 * CascadeOrchestrator unit tests (post-refactor).
 *
 * Topology under test:
 *   L0 TriageService (LLM Flash router)
 *   L1 FAQMatcher (vector)
 *   L3 MultiAgent (full pipeline)
 *   - Legacy L2 SimpleFilter has been retired.
 *
 * The L0/L1 services here are stubbed so we can simulate every
 * relevant triage outcome without hitting the model. MultiAgent
 * is also stubbed.
 */

import { CascadeOrchestrator } from './cascade-orchestrator.service';
import { FAQMatcher, FAQMatchResult } from './faq.matcher';
import { TriageResult, TriageService } from './triage.service';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { MultiAgentResult } from '../agents/orchestrator/multi-agent-orchestrator.service';
import {
  ILogRepository,
  PipelineLogEvent,
} from '../agents/orchestrator/ports/orchestrator-ports';

class StubMultiAgentOrchestrator {
  execute = jest.fn<Promise<MultiAgentResult>, [ISessionContext]>();
}

function makeLogRepo(): jest.Mocked<ILogRepository> {
  return {
    appendAgentStart: jest.fn(),
    appendAgentIteration: jest.fn(),
    appendAgentError: jest.fn(),
    appendAgentEnd: jest.fn(),
    appendPipelineEvent: jest.fn(),
  };
}

function makeContext(input: string): ISessionContext {
  return {
    sessionId: 'sess_1',
    taskId: 'task_1',
    input,
    state: new Map<string, any>(),
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
    metadata: {
      createdAt: new Date(),
      ticketId: 'ticket_99',
    },
  };
}

function makeStubMultiAgentResult(
  answer: string,
  success = true,
): MultiAgentResult {
  return {
    pipelineId: 'default-pipeline',
    success,
    generatorOutput: {
      content: answer,
      category: 'general',
      confidence: 0.85,
    },
    routes: [],
    durationMs: 10,
    error: success ? undefined : 'boom',
  };
}

function makeStubTriage(
  result: Partial<TriageResult> = {},
): TriageService {
  const full: TriageResult = {
    inDomain: true,
    intent: 'question',
    category: null,
    confidence: 0.9,
    reformulated: null,
    reason: 'stub',
    ...result,
  };
  return {
    triage: jest.fn(async () => full),
  } as unknown as TriageService;
}

function makeStubFaq(result: Partial<FAQMatchResult>): FAQMatcher {
  const full: FAQMatchResult = {
    matched: false,
    confidence: 0,
    reason: 'stub',
    ...result,
  };
  return {
    match: jest.fn(async () => full),
    setConfidenceThreshold: jest.fn(),
  } as unknown as FAQMatcher;
}

describe('CascadeOrchestrator (post-refactor)', () => {
  describe('L0 Triage out-of-domain', () => {
    it('returns the friendly OOD message and skips L1/L3', async () => {
      const triage = makeStubTriage({
        inDomain: false,
        intent: 'greeting',
      });
      const faq = makeStubFaq({});
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(makeContext('hello!'));

      expect(result.level).toBe(0);
      expect(result.source).toBe('Triage');
      expect(result.outOfDomain).toBe(true);
      expect(result.requiresTicket).toBe(false);
      expect(result.answer).toMatch(/help/i);
      expect(faq.match).not.toHaveBeenCalled();
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });

    it('treats abuse the same as OOD', async () => {
      const triage = makeStubTriage({ inDomain: true, intent: 'abuse' });
      const faq = makeStubFaq({});
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(makeContext('garbage'));

      expect(result.outOfDomain).toBe(true);
      expect(faq.match).not.toHaveBeenCalled();
    });
  });

  describe('L0 unclear / complaint', () => {
    it('asks for clarification but flags requiresTicket=true', async () => {
      const triage = makeStubTriage({ inDomain: true, intent: 'unclear' });
      const faq = makeStubFaq({});
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(makeContext('?'));

      expect(result.level).toBe(0);
      expect(result.source).toBe('Triage');
      expect(result.outOfDomain).toBe(false);
      expect(result.requiresTicket).toBe(true);
      expect(faq.match).not.toHaveBeenCalled();
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });
  });

  describe('L1 FAQ vector hit', () => {
    it('returns the FAQ answer without invoking L3', async () => {
      const triage = makeStubTriage({
        intent: 'question',
        category: 'billing',
        reformulated: 'How do I get a refund?',
      });
      const faq = makeStubFaq({
        matched: true,
        answer: 'Refunds processed within 5-7 business days.',
        confidence: 0.91,
        faqId: 'billing_003',
        category: 'billing',
        margin: 0.1,
      });
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(makeContext('how to refund?'));

      expect(faq.match).toHaveBeenCalledWith(
        'How do I get a refund?',
        'billing',
      );
      expect(result.level).toBe(1);
      expect(result.source).toBe('FAQMatcher');
      expect(result.faqId).toBe('billing_003');
      expect(result.faqMargin).toBe(0.1);
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });

    it('passes raw text to FAQMatcher when no reformulation', async () => {
      const triage = makeStubTriage({ intent: 'question', reformulated: null });
      const faq = makeStubFaq({ matched: true, confidence: 0.9 });
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      await orch.processTicket(makeContext('original text'));

      expect(faq.match).toHaveBeenCalledWith('original text', undefined);
    });
  });

  describe('L1 miss → L3 fallback', () => {
    it('escalates to MultiAgent when L1 below threshold', async () => {
      const triage = makeStubTriage({ intent: 'question' });
      const faq = makeStubFaq({ matched: false, confidence: 0.4 });
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(
        makeStubMultiAgentResult('LLM-generated answer'),
      );
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const ctx = makeContext('truly novel question');
      const result = await orch.processTicket(ctx);

      expect(multiAgent.execute).toHaveBeenCalledWith(ctx);
      expect(result.level).toBe(3);
      expect(result.source).toBe('MultiAgent');
      expect(result.answer).toBe('LLM-generated answer');
    });

    it('returns level=0 + requiresTicket when skipLevel3 and L1 misses', async () => {
      const triage = makeStubTriage({ intent: 'question', category: 'shipping' });
      const faq = makeStubFaq({ matched: false, confidence: 0.5 });
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(
        makeContext('novel question'),
        true,
      );

      expect(result.level).toBe(0);
      expect(result.source).toBe('FAQMatcher');
      expect(result.requiresTicket).toBe(true);
      expect(result.category).toBe('shipping');
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps unexpected throws in an Error CascadeResult', async () => {
      const triage = {
        triage: jest.fn(async () => {
          throw new Error('triage exploded');
        }),
      } as unknown as TriageService;
      const faq = makeStubFaq({});
      const multiAgent = new StubMultiAgentOrchestrator();
      const orch = new CascadeOrchestrator(triage, faq, multiAgent as any);

      const result = await orch.processTicket(makeContext('anything'));

      expect(result.level).toBe(0);
      expect(result.source).toBe('Error');
      expect(result.success).toBe(false);
      expect(result.error).toBe('triage exploded');
    });

    it('survives a broken LogRepository', async () => {
      const triage = makeStubTriage({ intent: 'question' });
      const faq = makeStubFaq({ matched: true, confidence: 0.9, answer: 'ok' });
      const multiAgent = new StubMultiAgentOrchestrator();
      const logRepo = makeLogRepo();
      logRepo.appendPipelineEvent.mockImplementation(() => {
        throw new Error('db down');
      });
      const orch = new CascadeOrchestrator(
        triage,
        faq,
        multiAgent as any,
        logRepo,
      );

      const result = await orch.processTicket(makeContext('a question'));

      expect(result.level).toBe(1);
      expect(result.success).toBe(true);
    });
  });

  describe('logging', () => {
    it('emits expected events on L1 hit', async () => {
      const triage = makeStubTriage({ intent: 'question' });
      const faq = makeStubFaq({ matched: true, confidence: 0.9, answer: 'a' });
      const multiAgent = new StubMultiAgentOrchestrator();
      const logRepo = makeLogRepo();
      const orch = new CascadeOrchestrator(
        triage,
        faq,
        multiAgent as any,
        logRepo,
      );

      await orch.processTicket(makeContext('q'));

      const types = logRepo.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'cascade.start',
          'cascade.level0_triage',
          'cascade.level1_hit',
          'cascade.end',
        ]),
      );
      expect(types).not.toContain('cascade.level3_entry');
    });

    it('emits L3 events when escalating', async () => {
      const triage = makeStubTriage({ intent: 'question' });
      const faq = makeStubFaq({ matched: false, confidence: 0.3 });
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(makeStubMultiAgentResult('a'));
      const logRepo = makeLogRepo();
      const orch = new CascadeOrchestrator(
        triage,
        faq,
        multiAgent as any,
        logRepo,
      );

      await orch.processTicket(makeContext('q'));

      const types = logRepo.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'cascade.level0_triage',
          'cascade.level1_miss',
          'cascade.level3_entry',
          'cascade.level3_complete',
          'cascade.end',
        ]),
      );
    });
  });
});
