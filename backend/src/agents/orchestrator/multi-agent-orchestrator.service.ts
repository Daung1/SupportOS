/**
 * MultiAgentOrchestrator - executes an ordered agent pipeline.
 *
 * Responsibilities (see program plan Phase A.4):
 *   1. Ask the injected IPipelineProvider for the pipeline to run.
 *   2. Validate the pipeline structure up-front.
 *   3. For each route:
 *      a. evaluate the skip condition;
 *      b. attach TAO event listeners that forward to the optional
 *         persistence + WebSocket ports;
 *      c. execute the agent with a timeout and retry-with-backoff
 *         wrapper so transient failures do not fail the pipeline;
 *      d. propagate the agent's output into SharedState according to
 *         the route's `publishAs` key;
 *      e. detach event listeners.
 *   4. Once the pipeline finishes, call the optional SafetyGate with
 *      the generator output.
 *   5. Flush the optional TokenTracker.
 *   6. Return a structured result envelope describing every route's
 *      outcome plus the safety decision.
 *
 * Ports (LogRepository / SocketGateway / SafetyGate / TokenTracker) are
 * all `@Optional()`.  A missing port means that side effect is
 * skipped - this lets the orchestrator land before those collaborators
 * are implemented.
 *
 * The orchestrator itself is a singleton.  It does not accumulate state
 * between runs; all per-call state lives on the stack or on the passed
 * `ISessionContext`.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { BaseAgent } from '../base/base.agent';
import {
  AgentEndEvent,
  AgentErrorEvent,
  AgentIterationEvent,
  AgentResult,
  AgentStartEvent,
} from '../core/types';
import { ISessionContext } from '../core/execution-context.interface';
import { SharedSafetyResult, SharedState } from '../core/shared-state';
import {
  AgentPipeline,
  AgentRoute,
  IPipelineProvider,
  assertValidPipeline,
} from '../pipeline/pipeline.interface';
import {
  ILogRepository,
  ISafetyGate,
  ISocketGateway,
  ITokenTracker,
  LOG_REPOSITORY,
  SAFETY_GATE,
  SOCKET_GATEWAY,
  TOKEN_TRACKER,
  TokenFlushSummary,
} from './ports/orchestrator-ports';
import { retryWithBackoff } from './retry.util';
import { TimeoutError, withTimeout } from './timeout.util';

/** DI token for the pipeline provider (swappable for SmartPipelineProvider). */
export const PIPELINE_PROVIDER = Symbol('ORCHESTRATOR_PIPELINE_PROVIDER');

/** Per-route outcome recorded in the orchestrator result. */
export interface RouteExecutionRecord {
  routeId: string;
  agentName: string;
  skipped: boolean;
  skipReason?: string;
  success: boolean;
  iterations: number;
  durationMs: number;
  output?: any;
  error?: string;
  retriesUsed: number;
}

/** Full result returned to callers (CascadeOrchestrator / tests / API). */
export interface MultiAgentResult {
  pipelineId: string;
  success: boolean;
  /** Output of the final route that declared `publishAs: 'generatorResult'`. */
  generatorOutput?: any;
  /** Safety decision if SafetyGate is wired. */
  safetyDecision?: SharedSafetyResult;
  /** Token usage summary if TokenTracker is wired. */
  tokenUsage?: TokenFlushSummary;
  routes: RouteExecutionRecord[];
  durationMs: number;
  error?: string;
}

/** Tunable orchestrator defaults; fields are optional for DI ergonomics. */
export interface MultiAgentOrchestratorOptions {
  /** Default per-agent timeout in milliseconds.  Defaults to 30s. */
  defaultTimeoutMs?: number;
  /** Default number of retries per agent (additional attempts).  Defaults to 3. */
  defaultRetries?: number;
  /** Minimum retry delay in milliseconds.  Defaults to 500. */
  retryMinDelayMs?: number;
  /** Maximum retry delay in milliseconds.  Defaults to 5000. */
  retryMaxDelayMs?: number;
}

/** DI token for orchestrator options. */
export const MULTI_AGENT_ORCHESTRATOR_OPTIONS = Symbol(
  'MULTI_AGENT_ORCHESTRATOR_OPTIONS',
);

const DEFAULT_OPTIONS: Required<MultiAgentOrchestratorOptions> = {
  defaultTimeoutMs: 30_000,
  defaultRetries: 3,
  retryMinDelayMs: 500,
  retryMaxDelayMs: 5_000,
};

@Injectable()
export class MultiAgentOrchestrator {
  private readonly logger = new Logger(MultiAgentOrchestrator.name);
  private readonly options: Required<MultiAgentOrchestratorOptions>;

  constructor(
    @Inject(PIPELINE_PROVIDER)
    private readonly pipelineProvider: IPipelineProvider,
    @Optional() @Inject(LOG_REPOSITORY)
    private readonly logRepository?: ILogRepository,
    @Optional() @Inject(SOCKET_GATEWAY)
    private readonly socketGateway?: ISocketGateway,
    @Optional() @Inject(SAFETY_GATE)
    private readonly safetyGate?: ISafetyGate,
    @Optional() @Inject(TOKEN_TRACKER)
    private readonly tokenTracker?: ITokenTracker,
    @Optional() @Inject(MULTI_AGENT_ORCHESTRATOR_OPTIONS)
    options?: MultiAgentOrchestratorOptions,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  // ---------------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------------

  async execute(context: ISessionContext): Promise<MultiAgentResult> {
    const startedAt = Date.now();
    const pipeline = await this.pipelineProvider.getPipeline(context);
    assertValidPipeline(pipeline);

    const ticketId = context.metadata?.ticketId;
    this.notifyPipelineStart(pipeline, context);

    const records: RouteExecutionRecord[] = [];
    const shared = SharedState.from(context);

    for (const route of pipeline.routes) {
      const record = await this.runRoute(route, context, shared);
      records.push(record);

      // Hard-stop conditions: a required skip, or an agent that failed
      // after exhausting retries.  Soft skips keep the pipeline going.
      if (record.skipped && route.required) {
        return this.abortPipeline(
          pipeline,
          records,
          startedAt,
          `Required route "${route.id}" was skipped: ${record.skipReason ?? 'no reason'}`,
          context,
        );
      }
      if (!record.skipped && !record.success) {
        return this.abortPipeline(
          pipeline,
          records,
          startedAt,
          record.error ?? `Route "${route.id}" failed`,
          context,
        );
      }
    }

    // Pipeline ran cleanly.  Resolve generator output from shared state
    // (preferred - set by generator itself in A.1) and fall back to the
    // last route record if the generator route did not publish.
    const generatorOutput =
      shared.get('generatorResult') ?? this.lastOutput(records);

    const safetyDecision = await this.runSafetyGate(generatorOutput, context);
    if (safetyDecision) {
      shared.set('safetyResult', safetyDecision);
    }

    const tokenUsage = await this.flushTokenTracker(context, ticketId);

    const durationMs = Date.now() - startedAt;
    const result: MultiAgentResult = {
      pipelineId: pipeline.id,
      success: true,
      generatorOutput,
      safetyDecision,
      tokenUsage,
      routes: records,
      durationMs,
    };

    this.notifyPipelineEnd(pipeline, result, context);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Per-route execution
  // ---------------------------------------------------------------------------

  private async runRoute(
    route: AgentRoute,
    context: ISessionContext,
    shared: SharedState,
  ): Promise<RouteExecutionRecord> {
    // 1. Skip condition.
    if (route.condition) {
      const shouldRun = await route.condition(context);
      if (!shouldRun) {
        this.notifyRouteSkipped(route, context);
        return {
          routeId: route.id,
          agentName: route.agent.name,
          skipped: true,
          skipReason: 'condition returned false',
          success: true,
          iterations: 0,
          durationMs: 0,
          retriesUsed: 0,
        };
      }
    }

    // 2. Attach listeners (only if the agent is a BaseAgent; plain
    // IAgent implementations have no EventEmitter surface).
    const detach = this.attachListeners(route, context);

    const timeoutMs = route.timeoutMs ?? this.options.defaultTimeoutMs;
    const retries = route.retries ?? this.options.defaultRetries;

    const attemptStartedAt = Date.now();
    let retriesUsed = 0;

    try {
      const execResult = await retryWithBackoff(
        () => withTimeout(route.agent.execute(context), timeoutMs),
        {
          retries,
          minDelayMs: this.options.retryMinDelayMs,
          maxDelayMs: this.options.retryMaxDelayMs,
          shouldRetry: (err) => {
            // Retry on timeouts and generic errors, but never on
            // programmer errors that look structural (TypeError etc).
            if (err instanceof TypeError) return false;
            if (err instanceof SyntaxError) return false;
            return true;
          },
          onRetry: (err, attempt, delayMs) => {
            retriesUsed = attempt;
            this.logger.warn(
              `Route "${route.id}" attempt ${attempt} failed; retrying in ${delayMs}ms: ${this.errorMessage(err)}`,
            );
          },
        },
      );

      // 3. Propagate output so downstream conditions can inspect it.
      if (route.publishAs && execResult.success) {
        const output = this.extractOutput(execResult);
        if (output !== undefined && output !== null) {
          shared.raw().set(route.publishAs, output);
        }
      }

      return {
        routeId: route.id,
        agentName: route.agent.name,
        skipped: false,
        success: execResult.success,
        iterations: execResult.iterations,
        durationMs: Date.now() - attemptStartedAt,
        output: this.extractOutput(execResult),
        error: execResult.error,
        retriesUsed,
      };
    } catch (err) {
      const message = this.errorMessage(err);
      return {
        routeId: route.id,
        agentName: route.agent.name,
        skipped: false,
        success: false,
        iterations: 0,
        durationMs: Date.now() - attemptStartedAt,
        error: message,
        retriesUsed,
      };
    } finally {
      detach();
    }
  }

  // ---------------------------------------------------------------------------
  // Event listener plumbing
  // ---------------------------------------------------------------------------

  private attachListeners(
    route: AgentRoute,
    context: ISessionContext,
  ): () => void {
    // Only BaseAgent subclasses emit lifecycle events.  For plain IAgent
    // implementations (tests / future custom agents) we simply skip the
    // subscription and return a no-op detach function.
    if (!(route.agent instanceof BaseAgent)) {
      return () => {
        /* no-op */
      };
    }

    const ticketId = context.metadata?.ticketId;

    const onStart = (event: AgentStartEvent) => {
      this.safeCall(() => this.logRepository?.appendAgentStart(event));
      this.safeCall(() =>
        this.socketGateway?.emitToTicket(ticketId, 'ticket.stage', {
          routeId: route.id,
          agentName: event.agentName,
          phase: 'start',
          timestamp: event.timestamp,
        }),
      );
    };

    const onIteration = (event: AgentIterationEvent) => {
      this.safeCall(() => this.logRepository?.appendAgentIteration(event));
      this.safeCall(() =>
        this.socketGateway?.emitToTicket(ticketId, 'ticket.iteration', {
          routeId: route.id,
          agentName: event.agentName,
          iteration: event.iteration,
          thought: event.thought,
          action: event.action,
          observation: event.observation,
          duration: event.duration,
          timestamp: event.timestamp,
        }),
      );
    };

    const onError = (event: AgentErrorEvent) => {
      this.safeCall(() => this.logRepository?.appendAgentError(event));
    };

    const onEnd = (event: AgentEndEvent) => {
      this.safeCall(() => this.logRepository?.appendAgentEnd(event));
      this.safeCall(() =>
        this.socketGateway?.emitToTicket(ticketId, 'ticket.stage', {
          routeId: route.id,
          agentName: event.agentName,
          phase: 'end',
          success: event.success,
          duration: event.duration,
          timestamp: event.timestamp,
        }),
      );
    };

    const agent = route.agent;
    agent.on('agent.start', onStart);
    agent.on('tao.iteration', onIteration);
    agent.on('agent.error', onError);
    agent.on('agent.end', onEnd);

    return () => {
      agent.off('agent.start', onStart);
      agent.off('tao.iteration', onIteration);
      agent.off('agent.error', onError);
      agent.off('agent.end', onEnd);
    };
  }

  // ---------------------------------------------------------------------------
  // Pipeline-level notifications
  // ---------------------------------------------------------------------------

  private notifyPipelineStart(
    pipeline: AgentPipeline,
    context: ISessionContext,
  ): void {
    this.safeCall(() =>
      this.logRepository?.appendPipelineEvent({
        pipelineId: pipeline.id,
        sessionId: context.sessionId,
        taskId: context.taskId,
        ticketId: context.metadata?.ticketId,
        type: 'pipeline.start',
        timestamp: Date.now(),
        payload: { routes: pipeline.routes.map((r) => r.id) },
      }),
    );
  }

  private notifyRouteSkipped(
    route: AgentRoute,
    context: ISessionContext,
  ): void {
    this.safeCall(() =>
      this.logRepository?.appendPipelineEvent({
        pipelineId: 'current', // pipelineId not available here without plumbing
        routeId: route.id,
        sessionId: context.sessionId,
        taskId: context.taskId,
        ticketId: context.metadata?.ticketId,
        type: 'pipeline.route.skipped',
        timestamp: Date.now(),
      }),
    );
  }

  private notifyPipelineEnd(
    pipeline: AgentPipeline,
    result: MultiAgentResult,
    context: ISessionContext,
  ): void {
    const ticketId = context.metadata?.ticketId;

    this.safeCall(() =>
      this.logRepository?.appendPipelineEvent({
        pipelineId: pipeline.id,
        sessionId: context.sessionId,
        taskId: context.taskId,
        ticketId,
        type: result.success ? 'pipeline.end' : 'pipeline.error',
        timestamp: Date.now(),
        payload: {
          success: result.success,
          durationMs: result.durationMs,
          error: result.error,
        },
      }),
    );

    this.safeCall(() =>
      this.socketGateway?.emitToTicket(
        ticketId,
        result.success ? 'ticket.completed' : 'ticket.failed',
        {
          pipelineId: pipeline.id,
          durationMs: result.durationMs,
          error: result.error,
          safety: result.safetyDecision?.decision,
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Safety / tokens / abort helpers
  // ---------------------------------------------------------------------------

  private async runSafetyGate(
    generatorOutput: unknown,
    context: ISessionContext,
  ): Promise<SharedSafetyResult | undefined> {
    if (!this.safetyGate) return undefined;
    if (generatorOutput === undefined || generatorOutput === null) {
      return undefined;
    }
    try {
      return await this.safetyGate.evaluate(generatorOutput, context);
    } catch (err) {
      this.logger.error(
        `SafetyGate evaluation failed: ${this.errorMessage(err)}`,
      );
      // Fail closed: treat gate failure as "needs human review".
      return {
        decision: 'review',
        confidence: 0,
        scores: { final: 0 },
        reasons: [`SafetyGate unavailable: ${this.errorMessage(err)}`],
      };
    }
  }

  private async flushTokenTracker(
    context: ISessionContext,
    ticketId: string | undefined,
  ): Promise<TokenFlushSummary | undefined> {
    if (!this.tokenTracker) return undefined;
    try {
      const summary = await this.tokenTracker.flush(context.sessionId);
      if (summary) {
        this.safeCall(() =>
          this.socketGateway?.emitToTicket(ticketId, 'ticket.cost', {
            sessionId: summary.sessionId,
            inputTokens: summary.inputTokens,
            outputTokens: summary.outputTokens,
            totalTokens: summary.totalTokens,
            costUsd: summary.costUsd,
          }),
        );
        return summary;
      }
      return undefined;
    } catch (err) {
      this.logger.warn(
        `TokenTracker flush failed: ${this.errorMessage(err)}`,
      );
      return undefined;
    }
  }

  private abortPipeline(
    pipeline: AgentPipeline,
    records: RouteExecutionRecord[],
    startedAt: number,
    error: string,
    context: ISessionContext,
  ): MultiAgentResult {
    const result: MultiAgentResult = {
      pipelineId: pipeline.id,
      success: false,
      routes: records,
      durationMs: Date.now() - startedAt,
      error,
    };
    this.notifyPipelineEnd(pipeline, result, context);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------

  private extractOutput(result: AgentResult): any {
    return result.output;
  }

  private lastOutput(records: RouteExecutionRecord[]): any {
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (!r.skipped && r.success && r.output !== undefined) {
        return r.output;
      }
    }
    return undefined;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof TimeoutError) return err.message;
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Run a fire-and-forget side-effect callback.  Errors are logged but
   * never re-thrown so a broken port cannot abort the pipeline.
   * Handles sync returns and Promise returns uniformly.
   */
  private safeCall(fn: () => void | Promise<void>): void {
    try {
      const maybePromise = fn();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((err: unknown) => {
          this.logger.warn(`Port side-effect failed: ${this.errorMessage(err)}`);
        });
      }
    } catch (err) {
      this.logger.warn(`Port side-effect threw: ${this.errorMessage(err)}`);
    }
  }
}
