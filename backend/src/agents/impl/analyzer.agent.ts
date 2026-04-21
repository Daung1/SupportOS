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
   * STEP 1: THINK - Generate thoughts about the ticket
   * Let Gemini analyze the ticket and decide what to do
   * Possible actions: use text_analyzer tool or finish with analysis
   */
  protected async think(
    context: ISessionContext,
    history: TAOIteration[],
  ): Promise<string> {
    // 优化的系统提示词 - 两步工作流
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

    // 如果有历史，只保留最后一次迭代（节省 tokens）
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

      const response = await context.modelClient.call(messages, undefined, {
        temperature: 0.2,  // 更低的温度 - 更确定的响应
        maxTokens: 500,    // 减少最大 tokens
      });

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

        // 关键修复：始终使用原始用户输入，而不是 parseAction 产生的 toolInput
        // parseAction 可能包含了完整的 thought，这不是我们想要的
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
}
