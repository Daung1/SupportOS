/**
 * BaseAgent abstract class - TAO Loop with lifecycle events.
 *
 * Implements the Thought-Action-Observation loop every concrete agent
 * inherits.  Subclasses must implement three abstract methods:
 *   - think(context, history): run the LLM and produce a raw response
 *   - parseAction(thought):   translate the LLM response into a structured
 *                             action descriptor
 *   - executeAction(context, action): run the chosen tool or emit the
 *                             final FINISH output
 *
 * In addition to running the loop, BaseAgent extends Node's EventEmitter
 * and publishes four typed lifecycle events so downstream consumers
 * (orchestrator, persistence, WebSocket gateway, TokenTracker, metrics)
 * can subscribe without coupling to agent internals:
 *
 *   'agent.start'    - before the first iteration
 *   'tao.iteration'  - after each iteration completes (success or FINISH)
 *   'agent.error'    - when think / parseAction / executeAction throws
 *   'agent.end'      - after the loop exits (success, failure, or max
 *                      iterations reached)
 *
 * Listener exceptions are swallowed by `safeEmit` so a misbehaving
 * subscriber cannot abort ticket processing.
 */

import { EventEmitter } from 'events';
import { IAgent } from '../core/agent.interface';
import {
  AgentEndEvent,
  AgentErrorEvent,
  AgentEventMap,
  AgentIterationEvent,
  AgentStartEvent,
  ExecutionResult,
  TAOIteration,
} from '../core/types';
import { ISessionContext } from '../core/execution-context.interface';
import { ModelCallContext } from '../core/model-client.interface';

type AgentAction = {
  type: 'FINISH' | 'CALL_TOOL' | string;
  toolName?: string;
  toolInput?: any;
  output?: string;
};

type AgentObservation = {
  success: boolean;
  output?: any;
  error?: string;
  shouldStop?: boolean;
};

type AgentObservationWithDuration = AgentObservation & { duration?: number };

export abstract class BaseAgent extends EventEmitter implements IAgent {
  /** Unique name of the agent - must be implemented by subclasses */
  abstract name: string;

  /** Optional description - can be overridden by subclasses */
  abstract description?: string;

  /** Maximum number of iterations in the TAO Loop */
  private static readonly MAX_ITERATIONS = 10;

  constructor() {
    super();
    // An agent typically accumulates a small but non-trivial set of
    // listeners (persistence + WS + tracker + metrics + safety). The
    // Node default cap of 10 is sufficient today; we pad it so future
    // consumers do not trigger spurious MaxListenersExceededWarning.
    this.setMaxListeners(20);
  }

  // ---------------------------------------------------------------------------
  // Typed event API
  // ---------------------------------------------------------------------------
  //
  // The overloads below give callers compile-time checking of event names
  // and payload shapes.  The implementation signature keeps the base
  // EventEmitter contract intact so external code that uses the raw
  // string API continues to work.

  emit<K extends keyof AgentEventMap>(
    name: K,
    payload: AgentEventMap[K],
  ): boolean;
  emit(name: string | symbol, ...args: any[]): boolean {
    return super.emit(name, ...args);
  }

  on<K extends keyof AgentEventMap>(
    name: K,
    listener: (payload: AgentEventMap[K]) => void,
  ): this;
  on(name: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(name, listener);
  }

  once<K extends keyof AgentEventMap>(
    name: K,
    listener: (payload: AgentEventMap[K]) => void,
  ): this;
  once(name: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(name, listener);
  }

  off<K extends keyof AgentEventMap>(
    name: K,
    listener: (payload: AgentEventMap[K]) => void,
  ): this;
  off(name: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(name, listener);
  }

  // ---------------------------------------------------------------------------
  // TAO Loop
  // ---------------------------------------------------------------------------

  /**
   * Main execution method implementing the TAO Loop.
   *
   * Flow per iteration:
   *   1. THOUGHT            - subclass produces the LLM response
   *   2. PARSE              - subclass turns the response into an action
   *   3. OBSERVATION        - subclass runs the action and returns a result
   *   4. RECORD             - append to history, update state snapshot
   *   5. EMIT 'tao.iteration'
   *   6. CHECK termination  - action.type === 'FINISH' or shouldStop
   *
   * Lifecycle events wrap the loop:
   *   - 'agent.start' before step 1 of iteration 0
   *   - 'agent.error' if any phase throws (loop aborts)
   *   - 'agent.end'   after successful FINISH, max iterations, or error
   */
  async execute(context: ISessionContext): Promise<ExecutionResult> {
    const history: TAOIteration[] = [];
    const correlation = this.correlationFrom(context);
    const startedAt = Date.now();
    let iterations = 0;
    let caughtErrorMessage: string | undefined;

    this.safeEmit('agent.start', {
      ...correlation,
      timestamp: startedAt,
      input: context.input,
    } as AgentStartEvent);

    try {
      for (
        iterations = 0;
        iterations < BaseAgent.MAX_ITERATIONS;
        iterations++
      ) {
        // Phase 1: THOUGHT
        let thought: string;
        try {
          thought = await this.think(context, history);
        } catch (err) {
          caughtErrorMessage = this.errorMessage(err);
          this.safeEmit('agent.error', {
            ...correlation,
            timestamp: Date.now(),
            phase: 'think',
            iteration: iterations,
            error: caughtErrorMessage,
          } as AgentErrorEvent);
          throw err;
        }

        // Phase 2: PARSE ACTION
        let action: AgentAction;
        try {
          action = await this.parseAction(thought);
        } catch (err) {
          caughtErrorMessage = this.errorMessage(err);
          this.safeEmit('agent.error', {
            ...correlation,
            timestamp: Date.now(),
            phase: 'parseAction',
            iteration: iterations,
            error: caughtErrorMessage,
          } as AgentErrorEvent);
          throw err;
        }

        // Phase 3: OBSERVATION (measure wall-clock for the action only)
        const actionStartedAt = Date.now();
        let observation: AgentObservation;
        try {
          observation = await this.executeAction(context, action);
        } catch (err) {
          caughtErrorMessage = this.errorMessage(err);
          this.safeEmit('agent.error', {
            ...correlation,
            timestamp: Date.now(),
            phase: 'executeAction',
            iteration: iterations,
            error: caughtErrorMessage,
          } as AgentErrorEvent);
          throw err;
        }
        const duration = Date.now() - actionStartedAt;
        const observationWithDuration: AgentObservationWithDuration = {
          ...observation,
          duration,
        };

        // Record iteration in history and state snapshot.
        const iterationRecord: TAOIteration = {
          iteration: iterations,
          thought,
          action,
          observation: observationWithDuration,
          timestamp: Date.now(),
        };
        history.push(iterationRecord);
        context.state.set(`iteration_${iterations}`, {
          thought,
          action,
          observation,
        });

        // Publish iteration event for downstream consumers.
        this.safeEmit('tao.iteration', {
          ...correlation,
          timestamp: iterationRecord.timestamp,
          iteration: iterations,
          thought,
          action,
          observation: observationWithDuration,
          duration,
        } as AgentIterationEvent);

        // Termination: either explicit FINISH action or shouldStop from
        // the observation (the latter is used by agents that route FINISH
        // through executeAction and want to stop with custom output).
        if (action.type === 'FINISH' || observation.shouldStop) {
          const endedAt = Date.now();
          const result: ExecutionResult = {
            success: observation.success,
            output: observation.output,
            error: observation.error,
            iterations: iterations + 1,
            history,
            state: Object.fromEntries(context.state),
          };
          this.safeEmit('agent.end', {
            ...correlation,
            timestamp: endedAt,
            success: observation.success,
            iterations: iterations + 1,
            duration: endedAt - startedAt,
            output: observation.output,
            error: observation.error,
          } as AgentEndEvent);
          return result;
        }
      }

      // Max iterations reached without FINISH.
      const endedAt = Date.now();
      const maxErr = `Max iterations (${BaseAgent.MAX_ITERATIONS}) reached without finishing`;
      this.safeEmit('agent.end', {
        ...correlation,
        timestamp: endedAt,
        success: false,
        iterations,
        duration: endedAt - startedAt,
        error: maxErr,
      } as AgentEndEvent);
      return {
        success: false,
        error: maxErr,
        output: null,
        iterations,
        history,
        state: Object.fromEntries(context.state),
      };
    } catch (err) {
      // Any phase throwing lands here.  `caughtErrorMessage` will be set
      // by whichever phase failed; falling back to `err` keeps the path
      // robust in case of unexpected re-throws.
      const endedAt = Date.now();
      const message = caughtErrorMessage ?? this.errorMessage(err);
      this.safeEmit('agent.end', {
        ...correlation,
        timestamp: endedAt,
        success: false,
        iterations,
        duration: endedAt - startedAt,
        error: message,
      } as AgentEndEvent);
      return {
        success: false,
        error: message,
        output: null,
        iterations,
        history,
        state: Object.fromEntries(context.state),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Abstract methods (unchanged contract from v1)
  // ---------------------------------------------------------------------------

  /**
   * Produce the LLM's thought for this iteration.  The return value is
   * the raw LLM text; `parseAction` converts it into a structured action.
   */
  protected abstract think(
    context: ISessionContext,
    history: TAOIteration[],
  ): Promise<string>;

  /**
   * Convert the LLM text into a structured action descriptor.  The
   * returned object must have a `type` field; 'FINISH' / 'CALL_TOOL' are
   * the standard types but subclasses may define custom types as long as
   * `executeAction` understands them.
   */
  protected abstract parseAction(thought: string): Promise<AgentAction>;

  /**
   * Execute the parsed action and return the observation.  Setting
   * `shouldStop` on the observation or returning `type: 'FINISH'` ends
   * the loop.
   */
  protected abstract executeAction(
    context: ISessionContext,
    action: AgentAction,
  ): Promise<AgentObservation>;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private correlationFrom(context: ISessionContext): {
    agentName: string;
    sessionId?: string;
    taskId?: string;
    ticketId?: string;
  } {
    return {
      agentName: this.name,
      sessionId: context.sessionId,
      taskId: context.taskId,
      ticketId: context.metadata?.ticketId,
    };
  }

  /**
   * Build a compact attribution context to pass as the 4th argument of
   * `context.modelClient.call(...)` so the injected TokenTracker (A.6)
   * can aggregate per-session cost.  Subclasses should always pass this
   * when making LLM calls from inside a TAO loop.
   */
  protected buildCallContext(context: ISessionContext): ModelCallContext {
    return {
      sessionId: context.sessionId,
      agentName: this.name,
      ticketId: context.metadata?.ticketId,
    };
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Emit an event without letting listener exceptions bubble up into the
   * TAO loop.  Listeners must not crash the Agent; a misbehaving
   * subscriber (e.g. DB unavailable) should never abort ticket
   * processing.  Errors are written to stderr as a last-resort signal;
   * structured logging will replace this once the observability layer
   * is in place.
   */
  private safeEmit<K extends keyof AgentEventMap>(
    name: K,
    payload: AgentEventMap[K],
  ): void {
    try {
      super.emit(name as string, payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[BaseAgent] Listener for "${name}" threw:`, err);
    }
  }
}
