/**
 * BaseAgent abstract class
 * Implements the TAO (Thought-Action-Observation) Loop framework
 * All concrete agents should extend this class and implement the three abstract methods
 */

import { IAgent } from '../core/agent.interface';
import { ExecutionResult, TAOIteration } from '../core/types';
import { ISessionContext } from '../core/execution-context.interface';

/**
 * BaseAgent abstract class
 * Implements the main TAO Loop execution logic that all agents use
 * Subclasses only need to implement the three abstract methods: think, parseAction, and executeAction
 */
export abstract class BaseAgent implements IAgent {
  /** Unique name of the agent - must be implemented by subclasses */
  abstract name: string;

  /** Optional description - can be overridden by subclasses */
  abstract description?: string;

  /** Maximum number of iterations in the TAO Loop */
  private static readonly MAX_ITERATIONS = 10;

  /**
   * Main execution method implementing the TAO Loop framework
   * This method orchestrates the complete execution flow and should not be overridden
   *
   * Flow:
   * 1. THOUGHT: Call LLM to generate thinking and action plan
   * 2. PARSE: Extract structured action from LLM output
   * 3. CHECK: If action is FINISH, return result
   * 4. OBSERVATION: Execute the action and observe results
   * 5. RECORD: Log the iteration to history
   * 6. REPEAT: Continue until FINISH or max iterations reached
   *
   * @param context - Session context with tools, models, and state
   * @returns Execution result with complete history and state
   */
  async execute(context: ISessionContext): Promise<ExecutionResult> {
    const history: TAOIteration[] = [];
    let iterations = 0;

    try {
      for (
        iterations = 0;
        iterations < BaseAgent.MAX_ITERATIONS;
        iterations++
      ) {
        // 1. THOUGHT: Let LLM think about the problem
        const thought = await this.think(context, history);

        // 2. Parse the action from LLM output
        const action = await this.parseAction(thought);

        // 3. OBSERVATION: Execute action (including FINISH action) and measure duration
        const startTime = Date.now();
        const observation = await this.executeAction(context, action);
        const duration = Date.now() - startTime;

        // 4. Record iteration to history
        history.push({
          iteration: iterations,
          thought,
          action,
          observation: { ...observation, duration },
          timestamp: Date.now(),
        });

        // 5. Update context state snapshot for debugging and history
        context.state.set(`iteration_${iterations}`, {
          thought,
          action,
          observation,
        });

        // 6. Check termination conditions (FINISH action or shouldStop flag set)
        if (action.type === 'FINISH' || observation.shouldStop) {
          return {
            success: observation.success,
            output: observation.output,
            error: observation.error,
            iterations: iterations + 1,
            history,
            state: Object.fromEntries(context.state),
          };
        }

        // 5. Record iteration to history
        history.push({
          iteration: iterations,
          thought,
          action,
          observation: { ...observation, duration },
          timestamp: Date.now(),
        });

        // 6. Update context state for next iteration
        context.state.set(`iteration_${iterations}`, {
          thought,
          action,
          observation,
        });

        // 7. Continue loop unless termination condition met
        // (handled in step 6 above)
      }

      // Max iterations reached without FINISH
      return {
        success: false,
        error: `Max iterations (${BaseAgent.MAX_ITERATIONS}) reached without finishing`,
        output: null,
        iterations,
        history,
        state: Object.fromEntries(context.state),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        output: null,
        iterations,
        history,
        state: Object.fromEntries(context.state),
      };
    }
  }

  /**
   * Abstract method: Generate thought through LLM
   * Subclasses must implement this to produce the LLM output for this iteration
   * The output should contain both the thought process and the action description
   *
   * @param context - Session context for accessing tools and models
   * @param history - History of previous iterations for context
   * @returns LLM's complete output text (thought and action description)
   */
  protected abstract think(
    context: ISessionContext,
    history: TAOIteration[],
  ): Promise<string>;

  /**
   * Abstract method: Parse LLM output to structured action
   * Subclasses must implement this to convert the LLM text into a structured action
   * This method is called after think() to parse the LLM's output
   *
   * @param thought - The LLM's complete output text
   * @returns Structured action object with type and parameters
   */
  protected abstract parseAction(
    thought: string,
  ): Promise<{
    type: 'FINISH' | 'CALL_TOOL' | string;
    toolName?: string;
    toolInput?: any;
    output?: string;
  }>;

  /**
   * Abstract method: Execute the action
   * Subclasses must implement this to execute the action and return results
   * This method is called after parseAction() to perform the actual work
   *
   * @param context - Session context for accessing tools
   * @param action - The action to execute
   * @returns Observation result with success status, output, and optional shouldStop flag
   */
  protected abstract executeAction(
    context: ISessionContext,
    action: any,
  ): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    shouldStop?: boolean;
  }>;
}
