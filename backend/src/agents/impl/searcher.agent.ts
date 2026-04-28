/**
 * Searcher Agent Implementation
 * Searches knowledge base for relevant documents based on ticket content
 * Uses TAO Loop framework to iterate through search refinement
 * Extends BaseAgent and implements the three required abstract methods
 */

import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../base/base.agent';
import { ISessionContext } from '../core/execution-context.interface';
import { TAOIteration } from '../core/types';

export interface SearchResult {
  query: string;
  documentsFound: number;
  documents: Array<{
    id: string;
    title: string;
    content: string;
    source: string;
    score: number;
  }>;
  iterations: number;
  success: boolean;
}

@Injectable()
export class SearcherAgent extends BaseAgent {
  name = 'SearcherAgent';
  description =
    'Searches knowledge base for relevant documents related to customer support tickets using TAO Loop';

  /**
   * STEP 1: THINK - Generate thoughts about what to search
   * Let Gemini analyze the ticket and decide what search queries to use
   * Possible actions: use search tool or finish with results
   */
  protected async think(
    context: ISessionContext,
    history: TAOIteration[],
  ): Promise<string> {
    // Phase 1 optimization: Simplified system prompt (~150 tokens instead of 250)
    const systemPrompt = `Search documents for support query: "${context.input}"

RESPOND FORMAT (exactly):
THOUGHT: [brief analysis in 1-2 sentences]
ACTION: search or FINISH
QUERY: [keywords] (if search)
SUMMARY: [brief result] (if FINISH)
RELEVANT_DOCS: [count] (if FINISH)

SEARCH GUIDE:
- Extract key topics, don't use exact query text
- Try different keywords if first attempt fails
- Stop after 2-3 iterations
- Choose FINISH when satisfied`;

    const lastIteration = history.length > 0 ? history[history.length - 1] : null;

    try {
      const messages: any[] = [
        {
          role: 'user',
          content: systemPrompt,
        },
      ];

      // Add previous iteration context for multi-step refinement
      if (lastIteration) {
        // Include previous thought and action for conversation history
        const prevThought = lastIteration.thought;
        messages.push({
          role: 'assistant',
          content: prevThought,
        });

        // Optimization: Show only top 3 results summary instead of full content
        if (
          lastIteration.observation.success &&
          lastIteration.observation.output
        ) {
          const searchResult = lastIteration.observation.output;
          // Show only top 3 results with titles and scores, excluding full content for token efficiency
          const resultsText = `
Found ${searchResult.count} document(s):
${searchResult.results
  .slice(0, 3)  // Show only top 3 results
  .map((doc: any, i: number) => 
    `${i + 1}. ${doc.title} (${(doc.score * 100).toFixed(0)}%)`
  )
  .join('\n')}
${searchResult.count > 3 ? `+ ${searchResult.count - 3} more` : ''}

Continue searching or finish?`;

          messages.push({
            role: 'user',
            content: resultsText,
          });
        }
      }

      const response = await context.modelClient.call(
        messages,
        undefined,
        {
          temperature: 0.3,
          maxTokens: 400,
        },
        this.buildCallContext(context),
      );

      return response;
    } catch (error) {
      throw new Error(
        `Failed to generate thought: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * STEP 2: PARSE ACTION - Extract structured action from LLM output
   * Parses the LLM's response to extract action type and parameters
   */
  protected async parseAction(thought: string): Promise<{
    type: string;
    toolName?: string;
    toolInput?: any;
    output?: any;
  }> {
    // Extract ACTION from response
    const actionMatch = thought.match(/ACTION:\s*([^\n]+)/i);

    if (!actionMatch) {
      return {
        type: 'FINISH',
        output: 'No valid action found in response',
      };
    }

    const actionLine = actionMatch[1].trim().toLowerCase();

    // Check if it's FINISH action
    if (actionLine.startsWith('finish')) {
      // Extract summary and count
      const summaryMatch = thought.match(/SUMMARY:\s*([^\n]+)/i);
      const docsMatch = thought.match(/RELEVANT_DOCS:\s*(\d+)/i);

      const summary = summaryMatch ? summaryMatch[1].trim() : 'Search completed';
      const docCount = docsMatch ? parseInt(docsMatch[1]) : 0;

      return {
        type: 'FINISH',
        output: {
          summary,
          documentsFound: docCount,
        },
      };
    }

    // Check if it's SEARCH action
    if (actionLine.startsWith('search')) {
      // Extract query and topK from response
      const queryMatch = thought.match(/QUERY:\s*([^\n]+)/i);
      const topKMatch = thought.match(/TOP_K:\s*(\d+)/i);

      if (!queryMatch) {
        return {
          type: 'FINISH',
          output: 'No search query provided',
        };
      }

      const query = queryMatch[1].trim();
      const topK = topKMatch ? parseInt(topKMatch[1]) : 5;

      return {
        type: 'CALL_TOOL',
        toolName: 'search',
        toolInput: {
          query,
          topK,
        },
      };
    }

    // Unknown action
    return {
      type: 'FINISH',
      output: `Unknown action: ${actionLine}`,
    };
  }

  /**
   * STEP 3: EXECUTE ACTION - Execute the action and return results
   * Calls the search tool or returns final results
   */
  protected async executeAction(
    context: ISessionContext,
    action: any,
  ): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    shouldStop?: boolean;
  }> {
    // If it's a tool call, execute the tool
    if (action.type === 'CALL_TOOL') {
      try {
        const tool = context.toolRegistry.getTool(action.toolName);

        if (!tool) {
          return {
            success: false,
            error: `Tool not found: ${action.toolName}`,
          };
        }

        const result = await tool.execute(action.toolInput);

        return {
          success: result.success,
          output: result,
          shouldStop: false, // Continue to next iteration
        };
      } catch (error) {
        return {
          success: false,
          error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // If it's a FINISH action, enhance output with source links from last search
    if (action.type === 'FINISH') {
      const output = action.output || {};

      // Try to find search results from context state
      let searchResults: any[] = [];
      for (let i = 99; i >= 0; i--) {
        const iterState = context.state.get(`iteration_${i}`);
        if (
          iterState?.observation?.output?.results &&
          Array.isArray(iterState.observation.output.results)
        ) {
          searchResults = iterState.observation.output.results;
          break;
        }
      }

      // Add document sources with IDs for human review
      const documentSources = searchResults
        .slice(0, output.documentsFound || 1)
        .map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          source: doc.source,
          score: doc.score,
          content: doc.content,  // Include actual document content for direct display
          url: `/docs/${doc.id}`,  // Link format for frontend
        }));

      return {
        success: true,
        output: {
          ...output,
          sources: documentSources,  // Add sources array
        },
        shouldStop: true,
      };
    }

    return {
      success: false,
      error: `Unknown action type: ${action.type}`,
    };
  }
}
