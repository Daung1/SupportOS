/// <reference types="jest" />

/**
 * CascadeOrchestrator unit tests.
 *
 * These tests focus on the three-layer escalation logic:
 *   - L1 FAQ hit short-circuits before L2/L3 are touched
 *   - L2 Filter hit short-circuits before L3 is touched
 *   - L3 runs only when both L1 and L2 miss
 *   - L3 failures are surfaced via CascadeResult.success=false
 *   - L1/L2/L3 hits each emit distinct cascade.* log events
 *   - a broken LogRepository never aborts the cascade
 *
 * FAQMatcher and SimpleFilter are real instances (cheap, pure-JS
 * objects), but MultiAgentOrchestrator is stubbed out so we do not
 * need a full agent/pipeline stack for these cases.
 */

import { FAQMatcher } from './faq.matcher';
import { SimpleFilter } from './simple.filter';
import { CascadeOrchestrator } from './cascade-orchestrator.service';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { MultiAgentResult } from '../agents/orchestrator/multi-agent-orchestrator.service';
import {
  ILogRepository,
  PipelineLogEvent,
} from '../agents/orchestrator/ports/orchestrator-ports';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

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

function buildFaqDb(): any[] {
  return [
    {
      id: 'shipping_001',
      question: 'How long does standard shipping take?',
      answer: 'Standard shipping takes 3-5 business days.',
      keywords: ['shipping', 'standard', 'take'],
      category: 'shipping',
      frequency: 100,
    },
  ];
}

function buildFilterRules() {
  return {
    shipping: {
      keywords: [
        'shipping',
        'delivery',
        'tracking',
        'package',
        'ship',
        'dispatch',
      ],
      description: 'Shipping related',
    },
    billing: {
      keywords: ['billing', 'payment', 'charge', 'refund', 'invoice'],
      description: 'Billing related',
    },
  };
}

function buildOrchestrator({
  multiAgent,
  logRepo,
  faqThreshold = 0.9,
  filterMin = 0.3,
  filterMax = 0.95,
}: {
  multiAgent: StubMultiAgentOrchestrator;
  logRepo?: ILogRepository;
  faqThreshold?: number;
  filterMin?: number;
  filterMax?: number;
}) {
  const faq = new FAQMatcher(buildFaqDb(), faqThreshold);
  const filter = new SimpleFilter(
    buildFilterRules() as any,
    filterMin,
    filterMax,
  );
  return new CascadeOrchestrator(
    faq,
    filter,
    multiAgent as any,
    logRepo,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CascadeOrchestrator', () => {
  describe('L1 FAQMatcher hit', () => {
    it('returns the canned FAQ answer without touching L2/L3', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      // Lower the L1 threshold so the test FAQ is accepted without
      // needing a perfect similarity score from the tokenizer.
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.4,
      });

      const result = await orchestrator.processTicket(
        makeContext('How long does standard shipping take?'),
      );

      expect(result.level).toBe(1);
      expect(result.source).toBe('FAQMatcher');
      expect(result.success).toBe(true);
      expect(result.answer).toBe('Standard shipping takes 3-5 business days.');
      expect(result.faqId).toBe('shipping_001');
      expect(result.category).toBe('shipping');
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });

    it('emits cascade.start, cascade.level1_hit, cascade.end to the log repo', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      const logRepo = makeLogRepo();
      const orchestrator = buildOrchestrator({
        multiAgent,
        logRepo,
        faqThreshold: 0.4,
      });

      await orchestrator.processTicket(
        makeContext('How long does standard shipping take?'),
      );

      const types = logRepo.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'cascade.start',
          'cascade.level1_hit',
          'cascade.end',
        ]),
      );
      expect(types).not.toContain('cascade.level2_hit');
      expect(types).not.toContain('cascade.level3_entry');
    });
  });

  describe('L2 SimpleFilter hit', () => {
    it('classifies and returns without invoking L3 when L1 misses', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.99,
      });

      const result = await orchestrator.processTicket(
        makeContext('shipping delivery tracking package'),
      );

      expect(result.level).toBe(2);
      expect(result.source).toBe('SimpleFilter');
      expect(result.success).toBe(true);
      expect(result.category).toBe('shipping');
      expect(result.matchedKeywords?.length ?? 0).toBeGreaterThan(0);
      expect(multiAgent.execute).not.toHaveBeenCalled();
    });

    it('emits cascade.level1_miss then cascade.level2_hit', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      const logRepo = makeLogRepo();
      const orchestrator = buildOrchestrator({
        multiAgent,
        logRepo,
        faqThreshold: 0.99,
      });

      await orchestrator.processTicket(
        makeContext('shipping delivery tracking package'),
      );

      const types = logRepo.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'cascade.start',
          'cascade.level1_miss',
          'cascade.level2_hit',
          'cascade.end',
        ]),
      );
      expect(types).not.toContain('cascade.level3_entry');
    });
  });

  describe('L3 MultiAgent fallback', () => {
    it('invokes MultiAgentOrchestrator when both L1 and L2 miss', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(
        makeStubMultiAgentResult('LLM-generated answer'),
      );
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.99,
        filterMin: 0.95, // force filter miss
      });

      const ctx = makeContext('completely random unrelated text xyz');
      const result = await orchestrator.processTicket(ctx);

      expect(multiAgent.execute).toHaveBeenCalledWith(ctx);
      expect(result.level).toBe(3);
      expect(result.source).toBe('MultiAgent');
      expect(result.success).toBe(true);
      expect(result.answer).toBe('LLM-generated answer');
      expect(result.category).toBe('general');
      expect(result.pipelineResult).toBeDefined();
    });

    it('propagates pipeline failure into CascadeResult', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(
        makeStubMultiAgentResult('', false),
      );
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.99,
        filterMin: 0.95,
      });

      const result = await orchestrator.processTicket(
        makeContext('completely random text xyz'),
      );

      expect(result.level).toBe(3);
      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });

    it('returns an error CascadeResult when MultiAgentOrchestrator throws', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockRejectedValue(new Error('network down'));
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.99,
        filterMin: 0.95,
      });

      const result = await orchestrator.processTicket(
        makeContext('completely random text xyz'),
      );

      expect(result.level).toBe(0);
      expect(result.source).toBe('Error');
      expect(result.success).toBe(false);
      expect(result.error).toBe('network down');
    });

    it('emits cascade.level3_entry and cascade.level3_complete', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(
        makeStubMultiAgentResult('answer'),
      );
      const logRepo = makeLogRepo();
      const orchestrator = buildOrchestrator({
        multiAgent,
        logRepo,
        faqThreshold: 0.99,
        filterMin: 0.95,
      });

      await orchestrator.processTicket(
        makeContext('completely random text xyz'),
      );

      const types = logRepo.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'cascade.start',
          'cascade.level1_miss',
          'cascade.level2_miss',
          'cascade.level3_entry',
          'cascade.level3_complete',
          'cascade.end',
        ]),
      );
    });
  });

  describe('robustness', () => {
    it('survives a broken LogRepository', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(
        makeStubMultiAgentResult('answer'),
      );
      const logRepo = makeLogRepo();
      logRepo.appendPipelineEvent.mockImplementation(() => {
        throw new Error('db down');
      });
      const orchestrator = buildOrchestrator({
        multiAgent,
        logRepo,
        faqThreshold: 0.99,
        filterMin: 0.95,
      });

      const result = await orchestrator.processTicket(
        makeContext('random text xyz'),
      );

      expect(result.success).toBe(true);
      expect(result.level).toBe(3);
    });

    it('handles empty input as a cascade miss that falls to L3', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      multiAgent.execute.mockResolvedValue(makeStubMultiAgentResult('n/a'));
      const orchestrator = buildOrchestrator({ multiAgent });

      const result = await orchestrator.processTicket(makeContext(''));

      expect(multiAgent.execute).toHaveBeenCalled();
      expect(result.level).toBe(3);
    });

    it('processTickets runs multiple contexts in parallel', async () => {
      const multiAgent = new StubMultiAgentOrchestrator();
      const orchestrator = buildOrchestrator({
        multiAgent,
        faqThreshold: 0.4,
      });

      const results = await orchestrator.processTickets([
        makeContext('How long does standard shipping take?'),
        makeContext('How long does standard shipping take?'),
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.level === 1)).toBe(true);
    });
  });
});
