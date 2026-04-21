/**
 * Execution context interface and related types
 * Provides the complete context for agent execution including tools, models, and state
 */

import { TAOIteration } from './types';
import { IModelClient } from './model-client.interface';

/**
 * Tool interface
 * Represents a single tool that can be called by the agent
 */
export interface ITool {
  /** Unique name of the tool */
  name: string;

  /** Optional description of what the tool does */
  description?: string;

  /**
   * Execute the tool with given input
   * @param input - Parameters for the tool
   * @returns Result from executing the tool
   */
  execute(input: any): Promise<any>;
}

/**
 * Tool registry interface
 * Manages and provides access to available tools
 */
export interface IToolRegistry {
  /**
   * Get a tool by name
   * @param name - Name of the tool to retrieve
   * @returns The tool if found, undefined otherwise
   */
  getTool(name: string): ITool | undefined;

  /**
   * List all available tools
   * @returns Array of all registered tools
   */
  listTools(): ITool[];

  /**
   * Register a new tool
   * @param tool - The tool to register
   */
  registerTool(tool: ITool): void;

  /**
   * Check if a tool is registered
   * @param name - Name of the tool to check
   * @returns True if tool exists, false otherwise
   */
  hasTool(name: string): boolean;
}

/**
 * Session execution context
 * Contains all information needed for an agent to execute a task
 * This context is shared across multiple agents in a workflow
 */
export interface ISessionContext {
  // === Basic Information ===

  /** Unique session identifier (UUID) */
  sessionId: string;

  /** Unique task identifier (UUID) */
  taskId: string;

  /** User input or ticket content */
  input: string;

  // === Execution State ===

  /** Shared state storage between agents, persists across iterations */
  state: Map<string, any>;

  /** Complete execution history of all iterations */
  history: TAOIteration[];

  // === Tools and Models ===

  /** Registry for accessing available tools */
  toolRegistry: IToolRegistry;

  /** LLM client for making model calls */
  modelClient: IModelClient;

  // === Optional Metadata ===

  /** Optional metadata about the session */
  metadata?: {
    /** User identifier */
    userId?: string;

    /** Support ticket identifier */
    ticketId?: string;

    /** Priority level of the ticket */
    priority?: 'low' | 'medium' | 'high';

    /** When the session was created */
    createdAt: Date;

    /** Additional custom metadata */
    [key: string]: any;
  };
}
