/**
 * Agent interface
 * Defines the contract that all agents must implement
 */

import { AgentResult, ExecutionResult } from './types';
import { ISessionContext } from './execution-context.interface';

/**
 * IAgent interface
 * All agents must implement this interface
 * The execute method will be called by the framework to run the agent
 */
export interface IAgent {
  /** Unique name of the agent */
  name: string;

  /** Optional description of what the agent does */
  description?: string;

  /**
   * Execute the agent's task
   * @param context - Session context containing tools, models, and state
   * @returns Result of the agent execution
   */
  execute(context: ISessionContext): Promise<AgentResult | ExecutionResult>;
}
