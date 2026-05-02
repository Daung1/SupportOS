/// <reference types="jest" />

/**
 * MultiAgentOrchestrator integration tests.
 *
 * These tests drive the orchestrator with lightweight BaseAgent stubs
 * so both the execution path (success / skip / failure / retry /
 * timeout) and the event-to-port plumbing can be exercised in isolation
 * from the real Analyzer / Searcher / Generator agents.
 */

import { BaseAgent } from '../base/base.agent';
import { IAgent } from '../core/agent.interface';
import { AgentResult } from '../core/types';
import { ISessionContext } from '../core/execution-context.interface';
import { SharedState } from '../core/shared-state';
import {
  AgentPipeline,
  AgentRoute,
  IPipelineProvider,
} from '../pipeline/pipeline.interface';
import {
  ILogRepository,
  ISafetyGate,
  ISocketGateway,
  ITokenTracker,
  PipelineLogEvent,
  TokenFlushSummary,
} from './ports/orchestrator-ports';
import {
  MultiAgentOrchestrator,
  MultiAgentOrchestratorOptions,
} from './multi-agent-orchestrator.service';

// ---------------------------------------------------------------------------
// Test stubs
// ---------------------------------------------------------------------------

interface StubAgentOptions {
  name: string;
  output?: any;
  success?: boolean;
  errorMessage?: string;
  /** Hang forever; used to verify timeout behaviour on BaseAgent path. */
  hang?: boolean;
}

class StubAgent extends BaseAgent {
  name: string;
  description = 'stub agent for orchestrator tests';

  constructor(private readonly opts: StubAgentOptions) {
    super();
    this.name = opts.name;
  }

  protected async think(): Promise<string> {
    if (this.opts.hang) {
      await new Promise(() => {
        /* never resolves */
      });
    }
    return 'stub-thought';
  }

  protected async parseAction(): Promise<any> {
    return { type: 'FINISH', output: JSON.stringify(this.opts.output ?? {}) };
  }

  protected async executeAction(
    _ctx: ISessionContext,
    _action: any,
  ): Promise<any> {
    if (this.opts.success === false) {
      return { success: false, error: this.opts.errorMessage ?? 'boom' };
    }
    return { success: true, output: this.opts.output ?? { ok: true } };
  }
}

/**
 * Plain IAgent whose execute() throws on the first `failFirstN` calls
 * and then resolves.  Used to verify retryWithBackoff + shouldRetry
 * integration; BaseAgent swallows internal throws into success:false
 * so a non-BaseAgent stub is the cleanest way to exercise the retry
 * wrapper directly.
 */
class ThrowingAgent implements IAgent {
  public callCount = 0;
  constructor(
    public readonly name: string,
    private readonly opts: {
      failFirstN?: number;
      throwTypeError?: boolean;
      output?: any;
    } = {},
  ) {}

  async execute(): Promise<AgentResult> {
    this.callCount++;
    if (this.opts.throwTypeError) {
      throw new TypeError('structural failure');
    }
    if (
      this.opts.failFirstN !== undefined &&
      this.callCount <= this.opts.failFirstN
    ) {
      throw new Error(`attempt ${this.callCount} fails`);
    }
    return {
      success: true,
      output: this.opts.output ?? { ok: true },
      iterations: 1,
    };
  }
}

class StubPipelineProvider implements IPipelineProvider {
  constructor(private readonly pipeline: AgentPipeline) {}
  async getPipeline(): Promise<AgentPipeline> {
    return this.pipeline;
  }
}

function makeContext(metadata: Record<string, any> = {}): ISessionContext {
  return {
    sessionId: 'sess_1',
    taskId: 'task_1',
    input: 'hello',
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
      ticketId: 'ticket_123',
      ...metadata,
    },
  };
}

function makeOrchestrator(
  pipeline: AgentPipeline,
  ports: {
    log?: ILogRepository;
    socket?: ISocketGateway;
    safety?: ISafetyGate;
    token?: ITokenTracker;
  } = {},
  options: MultiAgentOrchestratorOptions = {},
): MultiAgentOrchestrator {
  return new MultiAgentOrchestrator(
    new StubPipelineProvider(pipeline),
    ports.log,
    ports.socket,
    ports.safety,
    ports.token,
    {
      defaultTimeoutMs: 200,
      defaultRetries: 1,
      retryMinDelayMs: 1,
      retryMaxDelayMs: 2,
      ...options,
    },
  );
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('MultiAgentOrchestrator', () => {
  describe('happy path', () => {
    it('runs every route in order, publishes outputs to SharedState, and returns generator output', async () => {
      const analyzer = new StubAgent({
        name: 'AnalyzerAgent',
        output: { confidence: 0.9 },
      });
      const searcher = new StubAgent({
        name: 'SearcherAgent',
        output: { documentsFound: 2 },
      });
      const generator = new StubAgent({
        name: 'GeneratorAgent',
        output: { content: 'reply', confidence: 0.8 },
      });

      const pipeline: AgentPipeline = {
        id: 'test-pipeline',
        routes: [
          { id: 'analyzer', agent: analyzer, publishAs: 'analyzerResult' },
          { id: 'searcher', agent: searcher, publishAs: 'searcherResult' },
          { id: 'generator', agent: generator, publishAs: 'generatorResult' },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const ctx = makeContext();
      const result = await orchestrator.execute(ctx);

      expect(result.success).toBe(true);
      expect(result.pipelineId).toBe('test-pipeline');
      expect(result.routes.map((r) => r.routeId)).toEqual([
        'analyzer',
        'searcher',
        'generator',
      ]);
      expect(result.routes.every((r) => r.success)).toBe(true);

      const shared = SharedState.from(ctx);
      expect(shared.get('analyzerResult')).toMatchObject({ confidence: 0.9 });
      expect(shared.get('searcherResult')).toMatchObject({ documentsFound: 2 });
      expect(shared.get('generatorResult')).toMatchObject({ content: 'reply' });

      expect(result.generatorOutput).toMatchObject({ content: 'reply' });
    });
  });

  describe('skip conditions', () => {
    it('skips a non-required route when condition returns false', async () => {
      const a = new StubAgent({ name: 'a', output: {} });
      const b = new StubAgent({ name: 'b', output: {} });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'a', agent: a, publishAs: 'analyzerResult' },
          {
            id: 'b',
            agent: b,
            condition: () => false,
            publishAs: 'searcherResult',
          },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.routes[1].skipped).toBe(true);
      expect(result.routes[1].success).toBe(true);
    });

    it('aborts with failure when a required route is skipped', async () => {
      const a = new StubAgent({ name: 'a', output: {} });
      const b = new StubAgent({ name: 'b', output: {} });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'a', agent: a },
          { id: 'b', agent: b, condition: () => false, required: true },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Required route "b" was skipped/);
    });

    it('supports async conditions', async () => {
      const a = new StubAgent({ name: 'a', output: {} });
      const b = new StubAgent({ name: 'b', output: {} });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'a', agent: a },
          { id: 'b', agent: b, condition: async () => true },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.routes[1].skipped).toBe(false);
    });
  });

  describe('failures and retries', () => {
    it('retries transient failures and succeeds when retries suffice', async () => {
      const flaky = new ThrowingAgent('flaky', {
        failFirstN: 2,
        output: { ok: true },
      });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'flaky', agent: flaky, retries: 3 }],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.routes[0].success).toBe(true);
      expect(flaky.callCount).toBe(3);
      expect(result.routes[0].retriesUsed).toBeGreaterThanOrEqual(1);
    });

    it('aborts the pipeline when an agent exhausts its retries', async () => {
      const failing = new ThrowingAgent('failing', { failFirstN: 100 });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'failing', agent: failing, retries: 1 }],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.routes[0].success).toBe(false);
      expect(result.error).toBeDefined();
      // retries=1 means 2 attempts total.
      expect(failing.callCount).toBe(2);
    });

    it('does not retry TypeError (structural failure)', async () => {
      const broken = new ThrowingAgent('broken', { throwTypeError: true });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'broken', agent: broken, retries: 5 }],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.routes[0].success).toBe(false);
      expect(broken.callCount).toBe(1);
    });

    it("continues to the next route when failurePolicy='continue' and publishes fallbackOutput", async () => {
      // Real-world analogue: SearcherAgent fails (Gemini 503 mid-think
      // or KB returns nothing useful).  The orchestrator must NOT abort -
      // it must publish the fallback empty searcher result and let
      // GeneratorAgent run with whatever analyzer + triage hints exist.
      const analyzer = new StubAgent({
        name: 'AnalyzerAgent',
        output: { confidence: 0.7 },
      });
      const flakySearcher = new ThrowingAgent('SearcherAgent', {
        failFirstN: 100,
      });
      const generator = new StubAgent({
        name: 'GeneratorAgent',
        output: { type: 'TECH_ISSUE' },
      });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'analyzer', agent: analyzer, publishAs: 'analyzerResult' },
          {
            id: 'searcher',
            agent: flakySearcher,
            publishAs: 'searcherResult',
            retries: 0,
            failurePolicy: 'continue',
            fallbackOutput: {
              documentsFound: 0,
              documents: [],
              avgRelevance: 0,
            },
          },
          { id: 'generator', agent: generator, publishAs: 'generatorResult' },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const ctx = makeContext();
      const result = await orchestrator.execute(ctx);

      expect(result.success).toBe(true);
      expect(result.routes[1].success).toBe(false);
      expect(result.routes[2].success).toBe(true);
      const shared = SharedState.from(ctx);
      expect(shared.get('searcherResult')).toMatchObject({
        documentsFound: 0,
      });
      expect(shared.get('generatorResult')).toMatchObject({ type: 'TECH_ISSUE' });
    });

    it("does not overwrite a pre-existing publishAs value when fallbackOutput is set", async () => {
      // If something earlier (or the agent itself before throwing) put
      // a value at publishAs, we keep it.  Fallback is only for the
      // genuine "nothing was published" case.
      const flaky = new ThrowingAgent('flaky', { failFirstN: 100 });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          {
            id: 'flaky',
            agent: flaky,
            publishAs: 'searcherResult',
            retries: 0,
            failurePolicy: 'continue',
            fallbackOutput: { documentsFound: 0 },
          },
        ],
      };

      const ctx = makeContext();
      SharedState.from(ctx).set('searcherResult', {
        documentsFound: 7,
        avgRelevance: 0.9,
      });
      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(ctx);

      expect(result.success).toBe(true);
      expect(SharedState.from(ctx).get('searcherResult')).toMatchObject({
        documentsFound: 7,
      });
    });

    it("aborts (default) when failurePolicy is unset and a route fails", async () => {
      const flaky = new ThrowingAgent('flaky', { failFirstN: 100 });
      const generator = new StubAgent({ name: 'gen', output: { x: 1 } });

      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'flaky', agent: flaky, retries: 0 },
          { id: 'gen', agent: generator, publishAs: 'generatorResult' },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      // generator must NOT have run
      expect(result.routes.find((r) => r.routeId === 'gen')).toBeUndefined();
    });

    it('reports BaseAgent with success=false as failed', async () => {
      const bad = new StubAgent({
        name: 'bad',
        success: false,
        errorMessage: 'tool-error',
      });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'bad', agent: bad, retries: 0 }],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.routes[0].success).toBe(false);
    });
  });

  describe('timeouts', () => {
    it('kills hung agents after timeoutMs', async () => {
      const hanging = new StubAgent({ name: 'hang', hang: true });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [
          { id: 'hang', agent: hanging, timeoutMs: 20, retries: 0 },
        ],
      };

      const orchestrator = makeOrchestrator(pipeline);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.routes[0].error).toMatch(/timed out/i);
    }, 5000);
  });

  describe('port integration', () => {
    function makePorts() {
      const log: jest.Mocked<ILogRepository> = {
        appendAgentStart: jest.fn(),
        appendAgentIteration: jest.fn(),
        appendAgentError: jest.fn(),
        appendAgentEnd: jest.fn(),
        appendPipelineEvent: jest.fn(),
      };
      const socket: jest.Mocked<ISocketGateway> = {
        emitToTicket: jest.fn(),
      };
      const safety: jest.Mocked<ISafetyGate> = {
        evaluate: jest.fn(),
      };
      const token: jest.Mocked<ITokenTracker> = {
        flush: jest.fn(),
      };
      return { log, socket, safety, token };
    }

    it('forwards TAO events to LogRepository and SocketGateway', async () => {
      const agent = new StubAgent({ name: 'a', output: { ok: true } });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'a', agent, publishAs: 'analyzerResult' }],
      };
      const ports = makePorts();
      ports.safety.evaluate.mockResolvedValue({
        decision: 'approve',
        confidence: 1,
        scores: { final: 1 },
        reasons: [],
      });

      const orchestrator = makeOrchestrator(pipeline, ports);
      await orchestrator.execute(makeContext());

      expect(ports.log.appendAgentStart).toHaveBeenCalledTimes(1);
      expect(ports.log.appendAgentIteration).toHaveBeenCalled();
      expect(ports.log.appendAgentEnd).toHaveBeenCalledTimes(1);
      expect(ports.log.appendPipelineEvent).toHaveBeenCalled();

      const pipelineEvents = ports.log.appendPipelineEvent.mock.calls.map(
        (c) => (c[0] as PipelineLogEvent).type,
      );
      expect(pipelineEvents).toEqual(
        expect.arrayContaining(['pipeline.start', 'pipeline.end']),
      );

      const emittedEvents = ports.socket.emitToTicket.mock.calls.map(
        (c) => c[1],
      );
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          'ticket.stage',
          'ticket.iteration',
          'ticket.completed',
        ]),
      );
    });

    it('calls SafetyGate with the generator output and stores the decision', async () => {
      const agent = new StubAgent({
        name: 'Generator',
        output: { content: 'hi' },
      });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'g', agent, publishAs: 'generatorResult' }],
      };
      const ports = makePorts();
      ports.safety.evaluate.mockResolvedValue({
        decision: 'approve',
        confidence: 0.9,
        scores: { final: 0.9 },
        reasons: ['ok'],
      });

      const orchestrator = makeOrchestrator(pipeline, ports);
      const ctx = makeContext();
      const result = await orchestrator.execute(ctx);

      expect(ports.safety.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'hi' }),
        ctx,
      );
      expect(result.safetyDecision?.decision).toBe('approve');
      expect(SharedState.from(ctx).get('safetyResult')?.decision).toBe(
        'approve',
      );
    });

    it('fails closed to a review decision when SafetyGate throws', async () => {
      const agent = new StubAgent({
        name: 'Generator',
        output: { content: 'hi' },
      });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'g', agent, publishAs: 'generatorResult' }],
      };
      const ports = makePorts();
      ports.safety.evaluate.mockRejectedValue(new Error('safety offline'));

      const orchestrator = makeOrchestrator(pipeline, ports);
      const result = await orchestrator.execute(makeContext());

      expect(result.safetyDecision?.decision).toBe('review');
      expect(result.safetyDecision?.confidence).toBe(0);
    });

    it('flushes the TokenTracker and emits a ticket.cost event', async () => {
      const agent = new StubAgent({
        name: 'Generator',
        output: { content: 'hi' },
      });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'g', agent, publishAs: 'generatorResult' }],
      };
      const ports = makePorts();
      const summary: TokenFlushSummary = {
        sessionId: 'sess_1',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        costUsd: 0.01,
      };
      ports.token.flush.mockResolvedValue(summary);

      const orchestrator = makeOrchestrator(pipeline, ports);
      const result = await orchestrator.execute(makeContext());

      expect(ports.token.flush).toHaveBeenCalledWith('sess_1');
      expect(result.tokenUsage).toEqual(summary);

      const costEvent = ports.socket.emitToTicket.mock.calls.find(
        (c) => c[1] === 'ticket.cost',
      );
      expect(costEvent).toBeDefined();
      expect(costEvent![2]).toMatchObject({ totalTokens: 150 });
    });

    it('survives a broken LogRepository (errors swallowed)', async () => {
      const agent = new StubAgent({ name: 'a', output: { ok: true } });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'a', agent }],
      };
      const ports = makePorts();
      ports.log.appendAgentStart.mockImplementation(() => {
        throw new Error('db down');
      });
      ports.log.appendAgentEnd.mockImplementation(() => {
        throw new Error('db down');
      });

      const orchestrator = makeOrchestrator(pipeline, ports);
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
    });

    it('works with no ports wired (all undefined)', async () => {
      const agent = new StubAgent({ name: 'a', output: { ok: true } });
      const pipeline: AgentPipeline = {
        id: 'p',
        routes: [{ id: 'a', agent, publishAs: 'analyzerResult' }],
      };
      const orchestrator = makeOrchestrator(pipeline, {});
      const result = await orchestrator.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.safetyDecision).toBeUndefined();
      expect(result.tokenUsage).toBeUndefined();
    });
  });

  describe('pipeline validation', () => {
    it('rejects an invalid pipeline up-front', async () => {
      const orchestrator = makeOrchestrator({
        id: '',
        routes: [],
      } as unknown as AgentPipeline);

      await expect(orchestrator.execute(makeContext())).rejects.toThrow();
    });
  });
});
