/**
 * Enterprise-Grade History Manager
 * Intelligently preserves history while optimizing token usage
 * 
 * Core principles:
 * 1. Classify information by priority
 * 2. Preserve critical information 100%
 * 3. Selectively preserve secondary information
 * 4. Remove or summarize low-priority information
 */

export interface HistoryEntry {
  iteration: number;
  timestamp: number;
  
  // Priority 1: Critical information (must keep)
  userInput: string;                              // Original user query
  finalResult?: any;                              // Final result
  
  // Priority 2: High-value information (summarized)
  actionType: 'CALL_TOOL' | 'FINISH' | 'RETRY';  // Action type
  toolName?: string;                              // Tool name
  toolResult?: {                                  // Tool result (key part)
    success: boolean;
    summary?: string;                             // Summary instead of full output
    error?: string;
  };
  
  // Priority 3: Medium-value information (optional)
  thinking?: {                                    // Thought process
    summary?: string;                             // Compressed thinking
    confidence?: number;                          // Confidence 0-1
  };
  
  // Priority 4: Low-value information (not saved)
  // fullThought?: string;  <- Removed, too verbose
  // detailedReasoning?: string;  <- Removed, wastes tokens
}

export class EnterpriseHistoryManager {
  private maxHistorySize: number = 10;            // Keep at most 10 iterations
  private maxTokensPerEntry: number = 200;        // Max 200 tokens per entry
  private fullHistory: any[] = [];                // Full history (local debugging only)
  private compressedHistory: HistoryEntry[] = []; // Compressed history (sent to LLM)

  /**
   * Add a new iteration record
   */
  addIteration(iteration: any): void {
    // Keep full history for debugging
    this.fullHistory.push(iteration);

    // Extract and compress key information
    const compressed = this.compressIteration(iteration);
    this.compressedHistory.push(compressed);

    // Maintain history size limit
    if (this.compressedHistory.length > this.maxHistorySize) {
      // Merge the earliest two entries
      this.mergeEarliestEntries();
    }
  }

  /**
   * Compress a single iteration record
   * Key idea: selectively preserve information
   */
  private compressIteration(iteration: any): HistoryEntry {
    const compressed: HistoryEntry = {
      iteration: iteration.iteration,
      timestamp: iteration.timestamp || Date.now(),
      userInput: iteration.userInput || '',  // Priority 1: must preserve
      
      // Priority 2: key information
      actionType: this.extractActionType(iteration.action),
      toolName: iteration.action?.toolName,
      
      toolResult: iteration.observation?.success ? {
        success: true,
        summary: this.summarizeResult(iteration.observation.output),  // Summary
        error: undefined,
      } : {
        success: false,
        error: iteration.observation?.error,
      },
      
      // Priority 3: thought process (summary only)
      thinking: {
        summary: this.summarizeThinking(iteration.thought),
        confidence: this.estimateConfidence(iteration),
      },
    };

    // If this is the final result, preserve it
    if (iteration.action?.type === 'FINISH') {
      compressed.finalResult = iteration.action.output;
    }

    return compressed;
  }

  /**
    * Extract action type
   */
  private extractActionType(action: any): 'CALL_TOOL' | 'FINISH' | 'RETRY' {
    if (!action) return 'RETRY';
    if (action.type === 'CALL_TOOL') return 'CALL_TOOL';
    if (action.type === 'FINISH') return 'FINISH';
    return 'RETRY';
  }

  /**
    * Summarize result (critical)
    * Principle: keep only essential information
   */
  private summarizeResult(result: any): string {
    if (!result) return '';
    
    // If result is a string, truncate to 100 characters
    if (typeof result === 'string') {
      return result.substring(0, 100) + (result.length > 100 ? '...' : '');
    }

    // If result is an object, preserve only key fields
    if (typeof result === 'object') {
      const summary: any = {};
      
      // Priority fields
      const priorityFields = [
        'category', 'priority', 'success', 'error',
        'status', 'id', 'type', 'action'
      ];
      
      for (const field of priorityFields) {
        if (result[field] !== undefined) {
          const value = result[field];
          // Cap string fields at 50 characters
          if (typeof value === 'string') {
            summary[field] = value.substring(0, 50);
          } else {
            summary[field] = value;
          }
        }
      }

      // If summary is empty, return top object keys
      if (Object.keys(summary).length === 0) {
        return Object.keys(result).slice(0, 3).join(', ');
      }

      return JSON.stringify(summary).substring(0, 100);
    }

    return String(result).substring(0, 100);
  }

  /**
    * Summarize thinking process
    * Principle: keep decision-critical points, remove redundant reasoning
   */
  private summarizeThinking(thought: string): string {
    if (!thought) return '';

    // 1. Keep only ACTION line, drop full THOUGHT text
    const actionMatch = thought.match(/ACTION:\s*([^\n]+)/i);
    if (actionMatch) {
      return `Action: ${actionMatch[1].substring(0, 80)}`;
    }

    // 2. If keywords are present, extract matching sentence
    const keywords = ['need', 'should', 'because', 'try', 'failed', 'success'];
    const sentences = thought.split(/[.!?]\s+/);
    
    for (const sentence of sentences) {
      for (const keyword of keywords) {
        if (sentence.toLowerCase().includes(keyword)) {
          return sentence.substring(0, 80) + '...';
        }
      }
    }

    // 3. Fallback: return first 60 characters
    return thought.substring(0, 60) + '...';
  }

  /**
   * Estimate confidence
   * Helps the LLM understand reliability of previous decisions
   */
  private estimateConfidence(iteration: any): number {
    // Successful execution -> high confidence
    if (iteration.observation?.success) {
      return 0.9;
    }

    // Retry action -> medium confidence
    if (iteration.action?.type === 'RETRY') {
      return 0.5;
    }

    // Error observed -> low confidence
    if (iteration.observation?.error) {
      return 0.2;
    }

    return 0.6;
  }

  /**
    * Merge the earliest two entries
    * Called when history exceeds size limit
   */
  private mergeEarliestEntries(): void {
    if (this.compressedHistory.length < 2) return;

    const [first, second] = this.compressedHistory.splice(0, 2);

    const merged: HistoryEntry = {
      iteration: first.iteration,
      timestamp: first.timestamp,
      userInput: first.userInput,
      
      // Preserve the most useful information
      actionType: second.actionType,  // Latest action
      toolName: second.toolName,
      toolResult: second.toolResult?.success ? second.toolResult : first.toolResult,
      
      // Merge thinking summaries
      thinking: {
        summary: `Tried: ${first.actionType}. Then: ${second.actionType}`,
        confidence: ((first.thinking?.confidence || 0.5) + (second.thinking?.confidence || 0.5)) / 2,
      },
    };

    this.compressedHistory.unshift(merged);
  }

  /**
    * Get history records to send to LLM
    * This is the actual content used in the prompt
   */
  getForLLM(): HistoryEntry[] {
    return this.compressedHistory.map(entry => ({
      iteration: entry.iteration,
      timestamp: entry.timestamp,
      userInput: entry.userInput,
      actionType: entry.actionType,
      toolName: entry.toolName,
      toolResult: entry.toolResult,
      thinking: entry.thinking,
      // Exclude fullResult, too verbose
    }));
  }

  /**
   * Get full history for debugging
   */
  getFullHistoryForDebugging(): any[] {
    return this.fullHistory;
  }

  /**
    * Estimate token count for current history
   */
  estimateTokens(): number {
    const compressed = this.compressedHistory;
    let tokens = 0;

    for (const entry of compressed) {
      // userInput: ~10-50 tokens
      tokens += Math.ceil((entry.userInput?.length || 0) / 4);
      
      // actionType: ~5 tokens
      tokens += 5;
      
      // toolResult summary: ~20-50 tokens
      const resultStr = JSON.stringify(entry.toolResult);
      tokens += Math.ceil(resultStr.length / 4);
      
      // thinking summary: ~10-30 tokens
      const thinkingStr = entry.thinking?.summary || '';
      tokens += Math.ceil(thinkingStr.length / 4);
    }

    return tokens;
  }

  /**
    * Generate history summary for LLM
   */
  generateHistorySummary(): string {
    if (this.compressedHistory.length === 0) return '';

    const lines: string[] = [];

    for (const entry of this.compressedHistory) {
      lines.push(`[Iteration ${entry.iteration}]`);
      lines.push(`Input: ${entry.userInput}`);
      lines.push(`Action: ${entry.actionType}${entry.toolName ? ` (${entry.toolName})` : ''}`);
      
      if (entry.toolResult) {
        lines.push(
          `Result: ${entry.toolResult.success ? 'Success' : 'Failed'} - ${entry.toolResult.summary || entry.toolResult.error}`,
        );
      }
      
      if (entry.thinking?.summary) {
        lines.push(`Thinking: ${entry.thinking.summary}`);
      }
      
      lines.push('---');
    }

    return lines.join('\n');
  }
}
