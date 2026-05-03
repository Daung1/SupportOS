/**
 * Analyzer Agent Implementation
 * Analyzes ticket content using the TAO Loop framework
 * Extracts category, priority, keywords, and generates initial analysis
 * Extends BaseAgent and implements the three required abstract methods
 */

import { Injectable } from '@nestjs/common';
import { BaseAgent } from '../base/base.agent';
import { ISessionContext } from '../core/execution-context.interface';
import { TAOIteration } from '../core/types';

export interface AnalysisResult {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  keywords: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  analysis: string;
  confidence: number;
  requiresUrgentAction: boolean;
}

@Injectable()
export class AnalyzerAgent extends BaseAgent {
  name = 'AnalyzerAgent';
  description =
    'Analyzes ticket content and extracts key information for routing and response generation';

  /**
   * Maximum number of LLM-driven iterations before we self-terminate
   * with whatever deterministic tool output we've already collected.
   *
   * The system prompt instructs Gemini to finish in 2 iterations
   * (call text_analyzer once, then FINISH). If the model returns
   * unparseable text, repeats `ACTION: text_analyzer`, or otherwise
   * fails to emit a recognisable FINISH, this agent could otherwise
   * loop until BaseAgent.MAX_ITERATIONS (10) and surface a user-
   * visible "Max iterations reached" error - even though we already
   * have a perfectly usable analysis from the deterministic tool on
   * iteration 0. Bound the LLM calls and fall back instead.
   */
  private static readonly MAX_LLM_ITERATIONS = 2;

  /**
   * STEP 1: THINK - Generate thoughts about the ticket
   * Let Gemini analyze the ticket and decide what to do
   * Possible actions: use text_analyzer tool or finish with analysis
   *
   * Self-termination: once we've reached MAX_LLM_ITERATIONS and we
   * have at least one successful tool observation, we synthesize a
   * FINISH thought directly from the tool output instead of asking
   * Gemini again. This guarantees the agent always terminates in a
   * bounded number of LLM calls and never bubbles up the generic
   * "Max iterations reached" error to the user.
   */
  protected async think(
    context: ISessionContext,
    history: TAOIteration[],
  ): Promise<string> {
    if (history.length >= AnalyzerAgent.MAX_LLM_ITERATIONS) {
      const synthesized = this.synthesizeFinishFromHistory(history);
      if (synthesized) {
        return synthesized;
      }
    }

    const systemPrompt = `TASK: Analyze this support ticket: "${context.input}"

YOU MUST RESPOND USING EXACTLY THIS FORMAT (no extra text allowed):
THOUGHT: [brief reasoning in 1-2 sentences]
ACTION: [FINISH or text_analyzer]

WORKFLOW:
1st iteration: Write THOUGHT, then "ACTION: text_analyzer"
2nd iteration: After receiving tool result, write THOUGHT, then "ACTION: FINISH" with JSON

JSON FORMAT FOR FINISH:
{"category":"[shipping/billing/account/product]","priority":"[high/medium/low]","keywords":[...],"sentiment":"[positive/negative/neutral]","hasOrderNumber":true/false,"hasSpecificInfo":true/false}

IMPORTANT:
- Do NOT add ticket content after "ACTION: text_analyzer"
- Do NOT add extra explanations or text
- ALWAYS complete in exactly 2 iterations`;

    // if there is history, only keep the last iteration (to save tokens)
    const lastIteration = history.length > 0 ? history[history.length - 1] : null;

    try {
      const messages = [
        {
          role: 'user',
          content: systemPrompt,
        },
      ];

      // Only add last iteration to save tokens
      if (lastIteration) {
        // Show what the previous iteration was
        messages.push({
          role: 'assistant',
          content: `THOUGHT: Analyzing ticket\nACTION: text_analyzer`,
        });
        
        // Show the tool result
        if (lastIteration.observation.success && lastIteration.observation.output) {
          const toolResult = lastIteration.observation.output;
          messages.push({
            role: 'user',
            content: `Tool result: ${JSON.stringify(toolResult)}\n\nNow respond with THOUGHT and ACTION: FINISH with the JSON format.`,
          });
        }
      }

      const response = await context.modelClient.call(
        messages,
        undefined,
        {
          temperature: 0.2,  // lower temperature - more deterministic responses
          maxTokens: 500,    // reduce max tokens
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
    output?: string;
  }> {
    // Extract ACTION from response
    const actionMatch = thought.match(/ACTION:\s*([^\n]+)/i);

    if (!actionMatch) {
      // If no ACTION found, might be incomplete response
      // Check if it looks like it was trying to provide analysis
      if (thought.toLowerCase().includes('category') || thought.toLowerCase().includes('priority')) {
        return {
          type: 'INCOMPLETE',
          output: 'Incomplete response - missing ACTION line',
        };
      }
      
      return {
        type: 'FINISH',
        output: 'No valid action found in response',
      };
    }

    const actionLine = actionMatch[1].trim();

    // Check if it's FINISH
    if (actionLine.toLowerCase().includes('finish')) {
      // Extract JSON from the response
      const jsonMatch = thought.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return {
            type: 'FINISH',
            output: analysis,
          };
        } catch (e) {
          return {
            type: 'FINISH',
            output: thought,
          };
        }
      }

      return {
        type: 'FINISH',
        output: thought,
      };
    }

    // Parse tool use
    const toolNames = ['text_analyzer', 'text-analyzer'];
    let toolName = '';
    
    for (const name of toolNames) {
      if (actionLine.toLowerCase().includes(name)) {
        toolName = 'text_analyzer';
        break;
      }
    }

    if (toolName) {
      return {
        type: 'CALL_TOOL',
        toolName,
        toolInput: { text: thought },
      };
    }

    // Fallback: if action mentions analyzer
    if (actionLine.toLowerCase().includes('analyz')) {
      return {
        type: 'CALL_TOOL',
        toolName: 'text_analyzer',
        toolInput: { text: thought },
      };
    }

    return {
      type: 'FINISH',
      output: 'Could not parse action',
    };
  }

  /**
   * STEP 3: EXECUTE ACTION - Execute the selected action
   * Calls tools or returns final result
   */
  protected async executeAction(
    context: ISessionContext,
    action: {
      type: string;
      toolName?: string;
      toolInput?: any;
      output?: string;
    },
  ): Promise<{
    success: boolean;
    output?: any;
    error?: string;
    shouldStop?: boolean;
  }> {
    // If it's FINISH action, stop the loop
    if (action.type === 'FINISH') {
      return {
        success: true,
        output: action.output,
        shouldStop: true,
      };
    }

    // Execute tool
    if (action.type === 'CALL_TOOL' && action.toolName) {
      try {
        const tool = context.toolRegistry.getTool(action.toolName);

        if (!tool) {
          return {
            success: false,
            error: `Tool '${action.toolName}' not found`,
          };
        }

        // Key fix: always use the original user input, not the toolInput generated by parseAction
        // parseAction might have included the full thought, which is not what we want
        const result = await tool.execute({ text: context.input });

        return {
          success: true,
          output: result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      success: false,
      error: `Unknown action type: ${action.type}`,
    };
  }

  /**
   * Build a synthetic `THOUGHT/ACTION: FINISH` response from the most
   * recent successful text_analyzer tool observation in history. This
   * lets us terminate the TAO loop deterministically when Gemini fails
   * to follow the 2-iteration contract.
   *
   * Returns `null` if no usable tool result is available; the caller
   * will then fall back to the normal LLM path.
   */
  private synthesizeFinishFromHistory(
    history: TAOIteration[],
  ): string | null {
    for (let i = history.length - 1; i >= 0; i--) {
      const iter = history[i];
      const obs = iter.observation;
      const out = obs?.output;
      if (!obs?.success || !out || typeof out !== 'object') {
        continue;
      }
      // Tool output shape comes from TextAnalyzerTool: contains
      // category/priority/keywords/sentiment at minimum.
      if (!('category' in out) && !('priority' in out)) {
        continue;
      }
      const synthesized = {
        category: (out as any).category ?? 'other',
        priority: (out as any).priority ?? 'medium',
        keywords: Array.isArray((out as any).keywords)
          ? (out as any).keywords
          : [],
        sentiment: (out as any).sentiment ?? 'neutral',
        hasOrderNumber: Boolean((out as any).hasOrderNumber),
        hasSpecificInfo: Boolean((out as any).hasSpecificInfo),
      };
      return [
        'THOUGHT: LLM did not converge within the iteration budget; ' +
          'falling back to the deterministic text_analyzer output.',
        'ACTION: FINISH',
        JSON.stringify(synthesized),
      ].join('\n');
    }
    return null;
  }
}
