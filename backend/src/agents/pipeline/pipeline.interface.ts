/**
 * Agent pipeline contracts.
 *
 * A pipeline is an ordered sequence of agents ("routes") that the
 * MultiAgentOrchestrator walks to produce a final ticket response.
 *
 * The pipeline itself is a plain data structure - execution logic lives
 * in the orchestrator.  Splitting "shape of the pipeline" from "how the
 * pipeline runs" is what lets us upgrade to LLM-driven dynamic pipelines
 * later (see decision 2 in the program plan) by swapping the
 * `IPipelineProvider` implementation without touching the executor.
 *
 * Key contracts:
 *   - `AgentRoute`        - one step in the pipeline (agent + optional gate)
 *   - `AgentPipeline`     - ordered list of routes + metadata
 *   - `IPipelineProvider` - factory that produces a pipeline for a session
 *
 * Orchestrator responsibilities (specified in A.4) not enforced here:
 *   - propagating each agent's output into `context.state` (SharedState)
 *     so subsequent routes' conditions can inspect it
 *   - skipping routes whose `condition` resolves to false
 *   - managing retries / timeouts / event listener lifetime
 */

import { IAgent } from '../core/agent.interface';
import { ISessionContext } from '../core/execution-context.interface';
import { SharedStateKey } from '../core/shared-state';

/**
 * Predicate evaluated by the orchestrator before running a route.
 * Returning `false` (sync or async) skips the agent and continues with
 * the next route.  Conditions typically inspect shared state populated
 * by earlier agents (e.g. "skip searcher if analyzer is confident").
 */
export type AgentRouteCondition = (
  context: ISessionContext,
) => boolean | Promise<boolean>;

/**
 * A single step in a pipeline.
 *
 * `id` is a stable, human-readable identifier used for logs, events,
 * and persistence records.  It must be unique within the pipeline.
 * `agent` is the IAgent instance the orchestrator will execute.
 *
 * Optional fields let the pipeline author override orchestrator defaults
 * on a per-route basis:
 *   - `condition`  - skip gate (see AgentRouteCondition)
 *   - `timeoutMs`  - overrides the default per-agent timeout (A.4)
 *   - `retries`    - overrides the default retry count (A.4)
 *   - `required`   - if true, a skip (condition=false) causes pipeline
 *                    failure instead of silently continuing.  Defaults
 *                    to false, i.e. conditions are soft by default.
 *   - `publishAs`  - when set, the orchestrator writes the agent's
 *                    output into SharedState under this key after the
 *                    route completes successfully.  Downstream routes'
 *                    conditions can then inspect the output via the
 *                    typed SharedState accessor.  Omit to run the agent
 *                    purely for side effects.
 */
export interface AgentRoute {
  id: string;
  agent: IAgent;
  condition?: AgentRouteCondition;
  timeoutMs?: number;
  retries?: number;
  required?: boolean;
  publishAs?: SharedStateKey;
}

/**
 * A complete pipeline definition.  Treated as an immutable value object
 * by the orchestrator - pipelines must not be mutated after they are
 * handed off to execution.
 */
export interface AgentPipeline {
  /** Stable pipeline identifier for logs / metrics / debugging. */
  id: string;

  /** Optional human-readable summary of what the pipeline does. */
  description?: string;

  /** Ordered routes; execution order follows array index. */
  routes: AgentRoute[];
}

/**
 * Factory that produces the pipeline for a given session.
 *
 * Implementations:
 *   - DefaultPipelineProvider  always returns the static default pipeline
 *                              (Analyzer -> Searcher(cond) -> Generator)
 *   - SmartPipelineProvider    (future) uses an LLM to produce a pipeline
 *                              dynamically from the ticket content
 *
 * The method is async so future providers can call an LLM or look up
 * routing rules from a database without the interface changing.
 */
export interface IPipelineProvider {
  getPipeline(context: ISessionContext): Promise<AgentPipeline>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Raised by `assertValidPipeline` when a pipeline is structurally
 * invalid (empty routes, duplicate ids, etc.).  The orchestrator is
 * expected to call this before executing to catch configuration bugs
 * early with a clear error.
 */
export class InvalidPipelineError extends Error {
  constructor(public readonly pipelineId: string, reason: string) {
    super(`Invalid pipeline "${pipelineId}": ${reason}`);
    this.name = 'InvalidPipelineError';
  }
}

/**
 * Validate structural invariants of a pipeline.  Throws
 * InvalidPipelineError on failure.  Keep this cheap - it runs once per
 * ticket, right before orchestration.
 */
export function assertValidPipeline(pipeline: AgentPipeline): void {
  if (!pipeline.id || pipeline.id.trim() === '') {
    throw new InvalidPipelineError('(unnamed)', 'pipeline id is required');
  }
  if (!Array.isArray(pipeline.routes) || pipeline.routes.length === 0) {
    throw new InvalidPipelineError(pipeline.id, 'routes must be non-empty');
  }

  const seen = new Set<string>();
  for (const [index, route] of pipeline.routes.entries()) {
    if (!route.id || route.id.trim() === '') {
      throw new InvalidPipelineError(
        pipeline.id,
        `route[${index}] is missing an id`,
      );
    }
    if (seen.has(route.id)) {
      throw new InvalidPipelineError(
        pipeline.id,
        `duplicate route id "${route.id}"`,
      );
    }
    seen.add(route.id);

    if (!route.agent || typeof route.agent.execute !== 'function') {
      throw new InvalidPipelineError(
        pipeline.id,
        `route "${route.id}" is missing a valid agent`,
      );
    }
    if (
      route.timeoutMs !== undefined &&
      (!Number.isFinite(route.timeoutMs) || route.timeoutMs <= 0)
    ) {
      throw new InvalidPipelineError(
        pipeline.id,
        `route "${route.id}" has invalid timeoutMs`,
      );
    }
    if (
      route.retries !== undefined &&
      (!Number.isInteger(route.retries) || route.retries < 0)
    ) {
      throw new InvalidPipelineError(
        pipeline.id,
        `route "${route.id}" has invalid retries`,
      );
    }
  }
}
