/// <reference types="jest" />

/**
 * BaseAgent lifecycle event tests.
 *
 * These tests exercise the TAO loop + event pipeline of BaseAgent using a
 * minimal concrete subclass (TestAgent).  The subclass is driven by
 * script-like behaviour injected per test so we can assert on event
 * ordering, payload shapes, and failure paths without touching the
 * concrete Analyzer / Searcher / Generator implementations.
 */

import { BaseAgent } from './base.agent';
import {
  AgentEndEvent,
  AgentErrorEvent,
  AgentIterationEvent,
  AgentStartEvent,
  ExecutionResult,
} from '../core/types';
import { ISessionContext } from '../core/execution-context.interface';

type ParsedAction = {
  type: string;
  toolName?: string;
  toolInput?: any;
  output?: string;
};

type Observation = {
  success: boolean;
  output?: any;
  error?: string;
  shouldStop?: boolean;
};

interface ScriptStep {
  thought: string;
  action: ParsedAction;
  observation: Observation;
}

interface TestAgentOptions {
  name?: string;
  script?: ScriptStep[];
  throwOn?: {
    phase: 'think' | 'parseAction' | 'executeAction';
    iteration?: number;
    message?: string;
  };
}

class TestAgent extends BaseAgent {
  name: string;
  description = 'Test agent for BaseAgent event tests';

  private readonly script: ScriptStep[];
  private readonly throwOn?: TestAgentOptions['throwOn'];
  private iterIndex = 0;

  constructor(options: TestAgentOptions = {}) {
    super();
    this.name = options.name ?? 'TestAgent';
    this.script = options.script ?? [
      {
        thought: 'single-step thought',
        action: { type: 'FINISH', output: 'done' },
        observation: { success: true, output: 'done' },
      },
    ];
    this.throwOn = options.throwOn;
  }

  protected async think(): Promise<string> {
    if (
      this.throwOn?.phase === 'think' &&
      this.throwOn.iteration === this.iterIndex
    ) {
      throw new Error(this.throwOn.message ?? 'think failure');
    }
    const step = this.currentStep();
    return step.thought;
  }

  protected async parseAction(_thought: string): Promise<ParsedAction> {
    if (
      this.throwOn?.phase === 'parseAction' &&
      this.throwOn.iteration === this.iterIndex
    ) {
      throw new Error(this.throwOn.message ?? 'parseAction failure');
    }
    return this.currentStep().action;
  }

  protected async executeAction(
    _context: ISessionContext,
    _action: ParsedAction,
  ): Promise<Observation> {
    if (
      this.throwOn?.phase === 'executeAction' &&
      this.throwOn.iteration === this.iterIndex
    ) {
      throw new Error(this.throwOn.message ?? 'executeAction failure');
    }
    const observation = this.currentStep().observation;
    this.iterIndex++;
    return observation;
  }

  private currentStep(): ScriptStep {
    const step = this.script[Math.min(this.iterIndex, this.script.length - 1)];
    return step;
  }
}

function makeContext(
  input = 'hello',
  metadata: Record<string, any> = {},
): ISessionContext {
  return {
    sessionId: 'sess_1',
    taskId: 'task_1',
    input,
    state: new Map<string, any>(),
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
    metadata: {
      createdAt: new Date(),
      ...metadata,
    },
  };
}

describe('BaseAgent lifecycle events', () => {
  describe('successful single-iteration run', () => {
    let agent: TestAgent;
    let result: ExecutionResult;
    let started: AgentStartEvent[];
    let iterations: AgentIterationEvent[];
    let ended: AgentEndEvent[];
    let errors: AgentErrorEvent[];
    let order: string[];

    beforeEach(async () => {
      agent = new TestAgent();
      started = [];
      iterations = [];
      ended = [];
      errors = [];
      order = [];
      agent.on('agent.start', (e) => {
        started.push(e);
        order.push('start');
      });
      agent.on('tao.iteration', (e) => {
        iterations.push(e);
        order.push('iteration');
      });
      agent.on('agent.end', (e) => {
        ended.push(e);
        order.push('end');
      });
      agent.on('agent.error', (e) => {
        errors.push(e);
        order.push('error');
      });

      result = await agent.execute(
        makeContext('hello world', { ticketId: 'tk_1' }),
      );
    });

    test('returns a successful execution result', () => {
      expect(result.success).toBe(true);
      expect(result.output).toBe('done');
      expect(result.iterations).toBe(1);
      expect(result.history).toHaveLength(1);
    });

    test('emits start -> iteration -> end exactly once each', () => {
      expect(started).toHaveLength(1);
      expect(iterations).toHaveLength(1);
      expect(ended).toHaveLength(1);
      expect(errors).toHaveLength(0);
    });

    test('emits events in the documented order', () => {
      expect(order).toEqual(['start', 'iteration', 'end']);
    });

    test('attaches correlation fields to every event', () => {
      const expectedCorrelation = {
        agentName: 'TestAgent',
        sessionId: 'sess_1',
        taskId: 'task_1',
        ticketId: 'tk_1',
      };
      expect(started[0]).toMatchObject(expectedCorrelation);
      expect(iterations[0]).toMatchObject(expectedCorrelation);
      expect(ended[0]).toMatchObject(expectedCorrelation);
    });

    test('agent.start payload carries the original input', () => {
      expect(started[0].input).toBe('hello world');
      expect(typeof started[0].timestamp).toBe('number');
    });

    test('tao.iteration payload exposes thought / action / observation', () => {
      const evt = iterations[0];
      expect(evt.iteration).toBe(0);
      expect(evt.thought).toBe('single-step thought');
      expect(evt.action).toMatchObject({ type: 'FINISH', output: 'done' });
      expect(evt.observation).toMatchObject({
        success: true,
        output: 'done',
      });
      expect(typeof evt.duration).toBe('number');
    });

    test('agent.end payload reflects success + output + duration', () => {
      const evt = ended[0];
      expect(evt.success).toBe(true);
      expect(evt.iterations).toBe(1);
      expect(evt.output).toBe('done');
      expect(evt.error).toBeUndefined();
      expect(typeof evt.duration).toBe('number');
    });
  });

  describe('multi-iteration run', () => {
    test('emits one tao.iteration per loop iteration', async () => {
      const agent = new TestAgent({
        script: [
          {
            thought: 'call tool',
            action: { type: 'CALL_TOOL', toolName: 't1' },
            observation: { success: true, output: { hit: 1 } },
          },
          {
            thought: 'finish',
            action: { type: 'FINISH', output: 'final' },
            observation: { success: true, output: 'final' },
          },
        ],
      });
      const iterations: AgentIterationEvent[] = [];
      agent.on('tao.iteration', (e) => iterations.push(e));

      const result = await agent.execute(makeContext());

      expect(result.iterations).toBe(2);
      expect(iterations).toHaveLength(2);
      expect(iterations[0].iteration).toBe(0);
      expect(iterations[1].iteration).toBe(1);
      expect(iterations[0].action.type).toBe('CALL_TOOL');
      expect(iterations[1].action.type).toBe('FINISH');
    });

    test('shouldStop on observation terminates the loop with agent.end', async () => {
      const agent = new TestAgent({
        script: [
          {
            thought: 'custom stop',
            action: { type: 'CALL_TOOL', toolName: 't1' },
            observation: {
              success: true,
              output: 'custom',
              shouldStop: true,
            },
          },
        ],
      });
      const ended: AgentEndEvent[] = [];
      agent.on('agent.end', (e) => ended.push(e));

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.output).toBe('custom');
      expect(ended).toHaveLength(1);
      expect(ended[0].success).toBe(true);
    });
  });

  describe('phase failures', () => {
    test('think() throwing emits agent.error(phase=think) then agent.end(success=false)', async () => {
      const agent = new TestAgent({
        throwOn: { phase: 'think', iteration: 0, message: 'llm down' },
      });
      const order: string[] = [];
      const errors: AgentErrorEvent[] = [];
      const ended: AgentEndEvent[] = [];
      const iterations: AgentIterationEvent[] = [];
      agent.on('agent.error', (e) => {
        errors.push(e);
        order.push('error');
      });
      agent.on('agent.end', (e) => {
        ended.push(e);
        order.push('end');
      });
      agent.on('tao.iteration', (e) => {
        iterations.push(e);
        order.push('iteration');
      });

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toBe('llm down');
      expect(iterations).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].phase).toBe('think');
      expect(errors[0].iteration).toBe(0);
      expect(errors[0].error).toBe('llm down');
      expect(ended).toHaveLength(1);
      expect(ended[0].success).toBe(false);
      expect(ended[0].error).toBe('llm down');
      expect(order).toEqual(['error', 'end']);
    });

    test('parseAction() throwing emits agent.error(phase=parseAction)', async () => {
      const agent = new TestAgent({
        throwOn: { phase: 'parseAction', iteration: 0, message: 'bad parse' },
      });
      const errors: AgentErrorEvent[] = [];
      agent.on('agent.error', (e) => errors.push(e));

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0].phase).toBe('parseAction');
      expect(errors[0].error).toBe('bad parse');
    });

    test('executeAction() throwing emits agent.error(phase=executeAction)', async () => {
      const agent = new TestAgent({
        throwOn: { phase: 'executeAction', iteration: 0, message: 'tool boom' },
      });
      const errors: AgentErrorEvent[] = [];
      agent.on('agent.error', (e) => errors.push(e));

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0].phase).toBe('executeAction');
      expect(errors[0].error).toBe('tool boom');
    });
  });

  describe('listener isolation', () => {
    test('a listener that throws does not abort the TAO loop', async () => {
      const agent = new TestAgent();

      // Silence the intentional console.error from safeEmit so the test
      // output stays clean; restore afterwards.
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        /* no-op */
      });

      agent.on('tao.iteration', () => {
        throw new Error('listener exploded');
      });
      let endCount = 0;
      agent.on('agent.end', () => {
        endCount++;
      });

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(true);
      expect(result.output).toBe('done');
      expect(endCount).toBe(1);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('max iterations', () => {
    test('emits agent.end with a max-iterations error when the loop never finishes', async () => {
      // Build a script whose action is always CALL_TOOL (never FINISH) so
      // the loop has to run to the cap.  The loop cap is 10 iterations.
      const loopingStep: ScriptStep = {
        thought: 'keep going',
        action: { type: 'CALL_TOOL', toolName: 't1' },
        observation: { success: true, output: 'partial' },
      };
      const agent = new TestAgent({ script: [loopingStep] });
      const ended: AgentEndEvent[] = [];
      const iterations: AgentIterationEvent[] = [];
      agent.on('agent.end', (e) => ended.push(e));
      agent.on('tao.iteration', (e) => iterations.push(e));

      const result = await agent.execute(makeContext());

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Max iterations/);
      expect(iterations).toHaveLength(10);
      expect(ended).toHaveLength(1);
      expect(ended[0].success).toBe(false);
      expect(ended[0].error).toMatch(/Max iterations/);
      expect(ended[0].iterations).toBe(10);
    });
  });

  describe('correlation with missing metadata', () => {
    test('events still fire when context has no ticketId', async () => {
      const agent = new TestAgent();
      const started: AgentStartEvent[] = [];
      const ended: AgentEndEvent[] = [];
      agent.on('agent.start', (e) => started.push(e));
      agent.on('agent.end', (e) => ended.push(e));

      const ctx = makeContext();
      // Remove metadata entirely to simulate a bare session.
      ctx.metadata = undefined;

      const result = await agent.execute(ctx);

      expect(result.success).toBe(true);
      expect(started).toHaveLength(1);
      expect(started[0].ticketId).toBeUndefined();
      expect(ended[0].ticketId).toBeUndefined();
    });
  });

  describe('once() and off() behave normally', () => {
    test('once() fires exactly once', async () => {
      const agent = new TestAgent({
        script: [
          {
            thought: 'step 1',
            action: { type: 'CALL_TOOL', toolName: 't1' },
            observation: { success: true, output: 1 },
          },
          {
            thought: 'step 2',
            action: { type: 'FINISH', output: 'done' },
            observation: { success: true, output: 'done' },
          },
        ],
      });
      let onceCount = 0;
      agent.once('tao.iteration', () => {
        onceCount++;
      });

      await agent.execute(makeContext());

      expect(onceCount).toBe(1);
    });

    test('off() removes a previously registered listener', async () => {
      const agent = new TestAgent();
      let hits = 0;
      const listener = () => {
        hits++;
      };
      agent.on('tao.iteration', listener);
      agent.off('tao.iteration', listener);

      await agent.execute(makeContext());

      expect(hits).toBe(0);
    });
  });
});
