/**
 * Single Agent Orchestrator Service
 * Executes a single agent with proper setup and logging
 * Handles context creation, tool registration, and result processing
 */

import { Injectable } from '@nestjs/common';
import { GeminiService } from '../../gemini/gemini.service';
import { ToolRegistry } from '../../tools/tool-registry.service';
import { TextAnalyzerTool } from '../../tools/text-analyzer.tool';
import { SearchTool } from '../../tools/search.tool';
import { AnalyzerAgent } from '../impl/analyzer.agent';
import { SearcherAgent } from '../impl/searcher.agent';
import { GeneratorAgent } from '../impl/generator.agent';
import { IAgent } from '../core/agent.interface';
import { ISessionContext, ITool } from '../core/execution-context.interface';
import { ExecutionResult, AgentResult } from '../core/types';

@Injectable()
export class SingleAgentOrchestrator {
  constructor(
    private geminiService: GeminiService,
    private toolRegistry: ToolRegistry,
    private textAnalyzerTool: TextAnalyzerTool,
    private searchTool: SearchTool,
    private analyzerAgent: AnalyzerAgent,
    private searcherAgent: SearcherAgent,
    private generatorAgent: GeneratorAgent,
  ) {}

  /**
   * Execute a single agent
   * @param agent - The agent to execute
   * @param input - User input or ticket content
   * @param sessionId - Optional session identifier
   * @param taskId - Optional task identifier
   * @returns Execution result with history and state
   */
  async executeAgent(
    agent: IAgent,
    input: string,
    sessionId?: string,
    taskId?: string,
  ): Promise<AgentResult | ExecutionResult> {
    // Register tools based on agent type
    const tools: ITool[] = [this.textAnalyzerTool];
    
    // SearcherAgent needs the search tool
    if (agent === this.searcherAgent) {
      tools.push(this.searchTool);
    }
    
    this.toolRegistry.registerTools(tools);

    // Create session context
    const context: ISessionContext = {
      sessionId: sessionId || this.generateId(),
      taskId: taskId || this.generateId(),
      input,
      state: new Map(),
      history: [],
      toolRegistry: this.toolRegistry,
      modelClient: this.geminiService,
      metadata: {
        userId: undefined,
        ticketId: taskId,
        createdAt: new Date(),
      },
    };

    try {
      // Execute agent
      const result = await agent.execute(context);

      // Add token usage from Gemini service
      const geminiTokenUsage = this.geminiService.getLastTokenUsage();

      return {
        ...result,
        tokensUsed: {
          input: geminiTokenUsage.inputTokens,
          output: geminiTokenUsage.outputTokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        iterations: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute AnalyzerAgent specifically
   * @param input - Ticket content to analyze
   * @param sessionId - Optional session ID
   * @param taskId - Optional task ID
   * @returns Analysis result
   */
  async executeAnalyzer(
    input: string,
    sessionId?: string,
    taskId?: string,
  ): Promise<AgentResult | ExecutionResult> {
    return this.executeAgent(
      this.analyzerAgent,
      input,
      sessionId,
      taskId,
    );
  }

  /**
   * Execute SearcherAgent specifically
   * @param input - Ticket content to search for
   * @param sessionId - Optional session ID
   * @param taskId - Optional task ID
   * @returns Search result with relevant documents
   */
  async executeSearcher(
    input: string,
    sessionId?: string,
    taskId?: string,
  ): Promise<AgentResult | ExecutionResult> {
    return this.executeAgent(
      this.searcherAgent,
      input,
      sessionId,
      taskId,
    );
  }

  /**
   * Execute GeneratorAgent specifically
   *
   * Callers should seed context.state with `analyzerResult` / `searcherResult`
   * before invocation (e.g. via the multi-agent orchestrator) so the generator
   * can pick the best scenario.  In isolated execution the classifier will
   * fall back to OTHER.
   *
   * @param input - Ticket content to generate a response for
   * @param sessionId - Optional session ID
   * @param taskId - Optional task ID
   * @param seedState - Optional state to seed into the context (e.g.
   *   analyzerResult / searcherResult from previous agents)
   */
  async executeGenerator(
    input: string,
    sessionId?: string,
    taskId?: string,
    seedState?: Record<string, any>,
  ): Promise<AgentResult | ExecutionResult> {
    if (seedState) {
      // Attach state via a one-off wrapper - we reuse executeAgent for the
      // common setup and then merge the seed values after context creation.
      return this.executeAgentWithSeed(
        this.generatorAgent,
        input,
        sessionId,
        taskId,
        seedState,
      );
    }
    return this.executeAgent(this.generatorAgent, input, sessionId, taskId);
  }

  /**
   * Execute an agent while seeding some initial context.state entries.
   * Used by the generator path where upstream agent outputs need to be
   * available before the TAO Loop starts.
   */
  private async executeAgentWithSeed(
    agent: IAgent,
    input: string,
    sessionId: string | undefined,
    taskId: string | undefined,
    seedState: Record<string, any>,
  ): Promise<AgentResult | ExecutionResult> {
    const tools: ITool[] = [this.textAnalyzerTool];
    if (agent === this.searcherAgent) {
      tools.push(this.searchTool);
    }
    this.toolRegistry.registerTools(tools);

    const context: ISessionContext = {
      sessionId: sessionId || this.generateId(),
      taskId: taskId || this.generateId(),
      input,
      state: new Map(Object.entries(seedState)),
      history: [],
      toolRegistry: this.toolRegistry,
      modelClient: this.geminiService,
      metadata: {
        userId: undefined,
        ticketId: taskId,
        createdAt: new Date(),
      },
    };

    try {
      const result = await agent.execute(context);
      const geminiTokenUsage = this.geminiService.getLastTokenUsage();
      return {
        ...result,
        tokensUsed: {
          input: geminiTokenUsage.inputTokens,
          output: geminiTokenUsage.outputTokens,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        iterations: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a unique ID for session or task
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
