/**
 * LLM Output Parser
 * Parses LLM responses into structured thought and action objects
 */

/**
 * ThoughtParser class
 * Provides utilities to parse LLM output into structured format
 *
 * Expected LLM output format (JSON):
 * {
 *   "thought": "The reasoning process",
 *   "action": {
 *     "type": "CALL_TOOL" | "FINISH",
 *     "toolName": "tool_name",    // if type is CALL_TOOL
 *     "toolInput": { ... },       // tool parameters
 *     "output": "..."             // if type is FINISH
 *   }
 * }
 *
 * The parser is forgiving and handles multiple formats gracefully
 */
export class ThoughtParser {
  /**
   * Parse LLM output text into structured thought and action
   * Implements a fallback strategy:
   * 1. Try direct JSON parsing
   * 2. Try extracting JSON from text using regex
   * 3. Fall back to treating entire text as a FINISH action
   *
   * @param text - The LLM output text to parse
   * @returns Parsed thought and action object
   */
  static parse(text: string): {
    thought: string;
    action: {
      type: string;
      toolName?: string;
      toolInput?: any;
      output?: string;
    };
  } {
    // Attempt 1: Direct JSON parsing
    try {
      const parsed = JSON.parse(text);
      return ThoughtParser.extractParsedResult(parsed, text);
    } catch {
      // JSON parsing failed, continue to next attempt
    }

    // Attempt 2: Extract JSON from text using regex
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return ThoughtParser.extractParsedResult(parsed, text);
      } catch {
        // JSON extraction failed, continue to fallback
      }
    }

    // Fallback: Treat entire text as FINISH output
    return {
      thought: text,
      action: {
        type: 'FINISH',
        output: text,
      },
    };
  }

  /**
   * Extract thought and action from parsed JSON object
   * Handles cases where the JSON might be missing expected fields
   *
   * @param parsed - The parsed JSON object
   * @param originalText - Original text for fallback
   * @returns Extracted thought and action
   */
  private static extractParsedResult(
    parsed: any,
    originalText: string,
  ): {
    thought: string;
    action: {
      type: string;
      toolName?: string;
      toolInput?: any;
      output?: string;
    };
  } {
    // Extract thought with fallback to empty string
    const thought = parsed.thought || '';

    // Extract action with proper defaults
    if (parsed.action && typeof parsed.action === 'object') {
      const action = parsed.action;
      return {
        thought,
        action: {
          type: action.type || 'FINISH',
          toolName: action.toolName,
          toolInput: action.toolInput,
          output: action.output,
        },
      };
    }

    // If no action object, create FINISH action with original text
    return {
      thought,
      action: {
        type: 'FINISH',
        output: originalText,
      },
    };
  }

  /**
   * Validate if parsed output has required fields
   * Useful for strict validation if needed
   *
   * @param parsed - The parsed object to validate
   * @returns True if valid, false otherwise
   */
  static isValid(parsed: {
    thought: string;
    action: { type: string; [key: string]: any };
  }): boolean {
    return (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.thought === 'string' &&
      parsed.action &&
      typeof parsed.action === 'object' &&
      typeof parsed.action.type === 'string'
    );
  }
}
