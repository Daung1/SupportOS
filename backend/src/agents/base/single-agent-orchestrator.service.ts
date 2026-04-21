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
   * Generate a unique ID for session or task
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
