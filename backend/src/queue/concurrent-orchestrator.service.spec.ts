import { CascadeOrchestrator, CascadeResult } from '../cascade/cascade-orchestrator.service';
import {
  ILogRepository,
  PipelineLogEvent,
} from '../agents/orchestrator/ports/orchestrator-ports';
import { ConcurrentOrchestrator } from './concurrent-orchestrator.service';
import {
  SessionContextFactory,
  SubmitTicket,
} from './session-context.factory';
import { ISessionContext } from '../agents/core/execution-context.interface';

/**
 * Minimal CascadeOrchestrator stub.  We test the queue layer in
 * isolation from real FAQ / filter / agent wiring.
 */
class StubCascade {
  public calls: ISessionContext[] = [];
  constructor(
    private readonly handler: (ctx: ISessionContext) => Promise<CascadeResult>,
  ) {}
  processTicket(context: ISessionContext): Promise<CascadeResult> {
    this.calls.push(context);
    return this.handler(context);
  }
}

/** Minimal SessionContextFactory stub - no real ToolRegistry/Gemini. */
class StubContextFactory {
  build(ticket: SubmitTicket): ISessionContext {
    return {
      sessionId: ticket.sessionId ?? `session-${ticket.id}`,
      taskId: ticket.taskId ?? `task-${ticket.id}`,
      input: ticket.content,
      state: new Map(),
      history: [],
      toolRegistry: { getTool: () => undefined, listTools: () => [], registerTool: () => {}, hasTool: () => false },
      modelClient: {
        call: async () => '',
        getLastTokenUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
      },
      metadata: { ticketId: ticket.id, priority: ticket.priority, createdAt: new Date() },
    };
  }
}

function makeResult(partial?: Partial<CascadeResult>): CascadeResult {
  return {
    level: 1,
    source: 'FAQMatcher',
    success: true,
    category: 'shipping',
    answer: 'stub answer',
    confidence: 0.95,
    processingTimeMs: 5,
    ...partial,
  };
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

describe('ConcurrentOrchestrator', () => {
  function build(
    cascadeHandler: (ctx: ISessionContext) => Promise<CascadeResult>,
    options?: {
      log?: ILogRepository;
      concurrency?: number;
      maxRetries?: number;
      retryDelayMs?: number;
    },
  ) {
    const cascade = new StubCascade(cascadeHandler);
    const factory = new StubContextFactory();
    const svc = new ConcurrentOrchestrator(
      cascade as unknown as CascadeOrchestrator,
      factory as unknown as SessionContextFactory,
      options?.log,
      {
        concurrency: options?.concurrency ?? 2,
        maxRetries: options?.maxRetries ?? 0,
        retryDelayMs: options?.retryDelayMs ?? 1,
      },
    );
    return { svc, cascade };
  }

  function ticket(id: string, extras?: Partial<SubmitTicket>): SubmitTicket {
    return { id, content: `ticket body ${id}`, ...extras };
  }

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('submits a single ticket, gets a success envelope', async () => {
    const { svc, cascade } = build(async () => makeResult());

    const result = await svc.submit(ticket('t-1'));
    expect(result.success).toBe(true);
    expect(result.ticketId).toBe('t-1');
    expect(result.cascadeResult?.level).toBe(1);
    expect(result.dlq).toBe(false);
    expect(cascade.calls).toHaveLength(1);
    expect(cascade.calls[0].input).toBe('ticket body t-1');
  });

  it('carries the business ticketId into the session metadata', async () => {
    const { svc, cascade } = build(async () => makeResult());
    await svc.submit(ticket('biz-99'));
    expect(cascade.calls[0].metadata?.ticketId).toBe('biz-99');
  });

  it('fans a batch across concurrency slots and isolates failures', async () => {
    let inflight = 0;
    let maxInflight = 0;
    const { svc } = build(
      async (ctx) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        if (ctx.metadata?.ticketId === 't-bad') {
          throw new Error('cascade blew up');
        }
        return makeResult();
      },
      { concurrency: 2 },
    );

    const results = await svc.submitBatch([
      ticket('t-1'),
      ticket('t-bad'),
      ticket('t-2'),
      ticket('t-3'),
    ]);

    expect(results).toHaveLength(4);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('cascade blew up');
    expect(results[2].success).toBe(true);
    expect(results[3].success).toBe(true);
    expect(maxInflight).toBeLessThanOrEqual(2);
  });

  it('returns an empty array for an empty batch without logging', async () => {
    const log = makeLogRepo();
    const { svc } = build(async () => makeResult(), { log });
    const results = await svc.submitBatch([]);
    expect(results).toEqual([]);
    expect(log.appendPipelineEvent).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Failure isolation and envelope shape
  // ---------------------------------------------------------------------------

  it('captures cascade business-failure into envelope.success=false', async () => {
    const { svc } = build(async () =>
      makeResult({ success: false, level: 3, source: 'MultiAgent', error: 'generator failed' }),
    );
    const result = await svc.submit(ticket('t-biz-fail'));
    expect(result.success).toBe(false);
    expect(result.cascadeResult?.error).toBe('generator failed');
    expect(result.error).toBeUndefined();
    expect(result.dlq).toBe(false);
  });

  it('captures cascade throw into envelope.error', async () => {
    const { svc } = build(async () => {
      throw new Error('network down');
    });
    const result = await svc.submit(ticket('t-throw'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
    expect(result.cascadeResult).toBeUndefined();
  });

  it('never rejects - siblings in a batch survive a sync throw', async () => {
    const { svc } = build(async (ctx) => {
      if (ctx.metadata?.ticketId === 't-sync') {
        throw new Error('sync throw');
      }
      return makeResult();
    });
    const results = await svc.submitBatch([ticket('t-sync'), ticket('t-ok')]);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Retry + DLQ
  // ---------------------------------------------------------------------------

  it('retries when maxRetries > 0 and succeeds on a later attempt', async () => {
    let attempts = 0;
    const { svc } = build(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error(`attempt ${attempts} fails`);
        return makeResult();
      },
      { maxRetries: 3, retryDelayMs: 1 },
    );

    const result = await svc.submit(ticket('t-flaky'));
    expect(result.success).toBe(true);
    expect(result.retriesUsed).toBe(2);
    expect(result.dlq).toBe(false);
    expect(attempts).toBe(3);
  });

  it('routes a permanently failing ticket to DLQ after maxRetries', async () => {
    let attempts = 0;
    const { svc } = build(
      async () => {
        attempts++;
        throw new Error('always fails');
      },
      { maxRetries: 2, retryDelayMs: 1 },
    );

    const result = await svc.submit(ticket('t-doomed'));
    expect(result.success).toBe(false);
    expect(result.dlq).toBe(true);
    expect(result.retriesUsed).toBe(2);
    expect(attempts).toBe(3);
    expect(svc.stats().dlq).toBe(1);
  });

  it('DLQ stays 0 when maxRetries = 0 but task still fails', async () => {
    const { svc } = build(async () => {
      throw new Error('x');
    });
    const result = await svc.submit(ticket('t-f'));
    expect(result.success).toBe(false);
    expect(result.dlq).toBe(false);
    expect(svc.stats().dlq).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // LogRepository integration
  // ---------------------------------------------------------------------------

  it('emits queue.submit / queue.start / queue.success on the happy path', async () => {
    const log = makeLogRepo();
    const { svc } = build(async () => makeResult(), { log });
    await svc.submit(ticket('t-1'));

    const types = log.appendPipelineEvent.mock.calls.map(
      (c) => (c[0] as PipelineLogEvent).type,
    );
    expect(types).toEqual(
      expect.arrayContaining(['queue.submit', 'queue.start', 'queue.success']),
    );
  });

  it('emits queue.retry + queue.dlq when the retry budget is blown', async () => {
    const log = makeLogRepo();
    const { svc } = build(
      async () => {
        throw new Error('x');
      },
      { log, maxRetries: 2, retryDelayMs: 1 },
    );

    await svc.submit(ticket('t-dlq'));

    const types = log.appendPipelineEvent.mock.calls.map(
      (c) => (c[0] as PipelineLogEvent).type,
    );
    expect(types.filter((t) => t === 'queue.retry')).toHaveLength(2);
    expect(types).toContain('queue.dlq');
  });

  it('emits queue.batch.start and queue.batch.end around a batch', async () => {
    const log = makeLogRepo();
    const { svc } = build(async () => makeResult(), { log });
    await svc.submitBatch([ticket('a'), ticket('b')]);

    const batchEvents = log.appendPipelineEvent.mock.calls
      .map((c) => c[0] as PipelineLogEvent)
      .filter((e) => e.type.startsWith('queue.batch'));

    expect(batchEvents.map((e) => e.type)).toEqual([
      'queue.batch.start',
      'queue.batch.end',
    ]);
    expect(batchEvents[1].payload).toMatchObject({
      count: 2,
      successes: 2,
      failures: 0,
      dlq: 0,
    });
  });

  it('tolerates a throwing log repository without aborting the ticket', async () => {
    const log: ILogRepository = {
      appendAgentStart: jest.fn(),
      appendAgentIteration: jest.fn(),
      appendAgentError: jest.fn(),
      appendAgentEnd: jest.fn(),
      appendPipelineEvent: jest.fn(() => {
        throw new Error('db down');
      }),
    };
    const { svc } = build(async () => makeResult(), { log });
    const result = await svc.submit(ticket('t-1'));
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  it('reports queue stats after an idle batch', async () => {
    const { svc } = build(async () => makeResult());
    await svc.submitBatch([ticket('a'), ticket('b'), ticket('c')]);
    await svc.onIdle();
    const stats = svc.stats();
    expect(stats.active).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.completed).toBe(3);
    expect(stats.failed).toBe(0);
    expect(stats.dlq).toBe(0);
  });
});
