/**
 * Core types and interfaces for the Agent framework
 * Defines all data structures used throughout the TAO Loop execution
 */

/**
 * Agent execution result
 * Contains the outcome of a single agent execution
 */
export interface AgentResult {
  /** Whether the execution was successful */
  success: boolean;

  /** The output result from the agent */
  output: any;

  /** Error message if execution failed */
  error?: string;

  /** Total number of iterations performed */
  iterations: number;

  /** Token usage statistics */
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Single TAO Loop iteration record
 * Records the complete state of one iteration: Thought → Action → Observation
 */
export interface TAOIteration {
  /** Iteration number (0-indexed) */
  iteration: number;

  /** LLM's thought process and reasoning */
  thought: string;

  /** Action details determined by the agent */
  action: {
    /** Action type: 'FINISH', 'CALL_TOOL', or custom action types */
    type: string;

    /** Tool name to be called (when type is 'CALL_TOOL') */
    toolName?: string;

    /** Tool input parameters (when type is 'CALL_TOOL') */
    toolInput?: any;

    /** Direct output content (when type is 'FINISH') */
    output?: string;
  };

  /** Observation from the executed action */
  observation: {
    /** Whether the action execution succeeded */
    success: boolean;

    /** Result output from the action */
    output?: any;

    /** Error message if action failed */
    error?: string;

    /** Execution duration in milliseconds */
    duration?: number;
  };

  /** Timestamp when this iteration occurred (milliseconds) */
  timestamp: number;
}

/**
 * Complete execution result with history
 * Extends AgentResult with full execution history and state snapshot
 */
export interface ExecutionResult extends AgentResult {
  /** Complete history of all iterations */
  history: TAOIteration[];

  /** Final state snapshot after execution */
  state: Record<string, any>;
}
