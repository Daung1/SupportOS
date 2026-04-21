/**
 * Enterprise-Grade History Manager
 * 智能保存历史信息，优化 Token 使用
 * 
 * 核心思想：
 * 1. 按优先级分类信息
 * 2. 关键信息 100% 保存
 * 3. 次要信息选择性保存
 * 4. 低优先级信息删除或摘要
 */

export interface HistoryEntry {
  iteration: number;
  timestamp: number;
  
  // 优先级 1: 关键信息（必须保留）
  userInput: string;                              // 原始用户问题
  finalResult?: any;                              // 最终结果
  
  // 优先级 2: 高价值信息（摘要保留）
  actionType: 'CALL_TOOL' | 'FINISH' | 'RETRY';  // 动作类型
  toolName?: string;                              // 工具名
  toolResult?: {                                  // 工具结果（关键部分）
    success: boolean;
    summary?: string;                             // 摘要而非完整输出
    error?: string;
  };
  
  // 优先级 3: 中等信息（可选保留）
  thinking?: {                                    // 思考过程
    summary?: string;                             // 压缩的思考
    confidence?: number;                          // 置信度 0-1
  };
  
  // 优先级 4: 低价值信息（不保存）
  // fullThought?: string;  ← 删除，太冗长
  // detailedReasoning?: string;  ← 删除，浪费 tokens
}

export class EnterpriseHistoryManager {
  private maxHistorySize: number = 10;            // 最多保留 10 次迭代
  private maxTokensPerEntry: number = 200;        // 每条记录最多 200 tokens
  private fullHistory: any[] = [];                // 完整历史（仅本地调试）
  private compressedHistory: HistoryEntry[] = []; // 压缩后的历史（发给 LLM）

  /**
   * 添加新的迭代记录
   */
  addIteration(iteration: any): void {
    // 保存完整历史用于调试
    this.fullHistory.push(iteration);

    // 提取并压缩关键信息
    const compressed = this.compressIteration(iteration);
    this.compressedHistory.push(compressed);

    // 维持历史大小
    if (this.compressedHistory.length > this.maxHistorySize) {
      // 合并最早的两条记录
      this.mergeEarliestEntries();
    }
  }

  /**
   * 压缩单个迭代记录
   * 关键：选择性保留信息
   */
  private compressIteration(iteration: any): HistoryEntry {
    const compressed: HistoryEntry = {
      iteration: iteration.iteration,
      timestamp: iteration.timestamp || Date.now(),
      userInput: iteration.userInput || '',  // 优先级 1: 必保留
      
      // 优先级 2: 关键信息
      actionType: this.extractActionType(iteration.action),
      toolName: iteration.action?.toolName,
      
      toolResult: iteration.observation?.success ? {
        success: true,
        summary: this.summarizeResult(iteration.observation.output),  // 摘要
        error: undefined,
      } : {
        success: false,
        error: iteration.observation?.error,
      },
      
      // 优先级 3: 思考过程（只保存摘要）
      thinking: {
        summary: this.summarizeThinking(iteration.thought),
        confidence: this.estimateConfidence(iteration),
      },
    };

    // 如果结果就是最终结果，保存它
    if (iteration.action?.type === 'FINISH') {
      compressed.finalResult = iteration.action.output;
    }

    return compressed;
  }

  /**
   * 提取动作类型
   */
  private extractActionType(action: any): 'CALL_TOOL' | 'FINISH' | 'RETRY' {
    if (!action) return 'RETRY';
    if (action.type === 'CALL_TOOL') return 'CALL_TOOL';
    if (action.type === 'FINISH') return 'FINISH';
    return 'RETRY';
  }

  /**
   * 摘要化结果（关键）
   * 原则：只保留必需的信息
   */
  private summarizeResult(result: any): string {
    if (!result) return '';
    
    // 如果是字符串，截断到 100 字符
    if (typeof result === 'string') {
      return result.substring(0, 100) + (result.length > 100 ? '...' : '');
    }

    // 如果是对象，只保留关键字段
    if (typeof result === 'object') {
      const summary: any = {};
      
      // 优先级字段
      const priorityFields = [
        'category', 'priority', 'success', 'error',
        'status', 'id', 'type', 'action'
      ];
      
      for (const field of priorityFields) {
        if (result[field] !== undefined) {
          const value = result[field];
          // 字符串字段不超过 50 字符
          if (typeof value === 'string') {
            summary[field] = value.substring(0, 50);
          } else {
            summary[field] = value;
          }
        }
      }

      // 如果摘要为空，返回对象的 keys
      if (Object.keys(summary).length === 0) {
        return Object.keys(result).slice(0, 3).join(', ');
      }

      return JSON.stringify(summary).substring(0, 100);
    }

    return String(result).substring(0, 100);
  }

  /**
   * 摘要化思考过程
   * 原则：保留决策关键点，删除冗余推理
   */
  private summarizeThinking(thought: string): string {
    if (!thought) return '';

    // 1. 只保留 ACTION 行，删除完整 THOUGHT
    const actionMatch = thought.match(/ACTION:\s*([^\n]+)/i);
    if (actionMatch) {
      return `Action: ${actionMatch[1].substring(0, 80)}`;
    }

    // 2. 如果有关键词，提取它们
    const keywords = ['need', 'should', 'because', 'try', 'failed', 'success'];
    const sentences = thought.split(/[.!?]\s+/);
    
    for (const sentence of sentences) {
      for (const keyword of keywords) {
        if (sentence.toLowerCase().includes(keyword)) {
          return sentence.substring(0, 80) + '...';
        }
      }
    }

    // 3. 返回前 60 字符
    return thought.substring(0, 60) + '...';
  }

  /**
   * 估计置信度
   * 帮助 LLM 理解之前的决策可信度
   */
  private estimateConfidence(iteration: any): number {
    // 如果成功，置信度高
    if (iteration.observation?.success) {
      return 0.9;
    }

    // 如果重试，置信度中等
    if (iteration.action?.type === 'RETRY') {
      return 0.5;
    }

    // 如果失败，置信度低
    if (iteration.observation?.error) {
      return 0.2;
    }

    return 0.6;
  }

  /**
   * 合并最早的两条记录
   * 当历史超过大小限制时调用
   */
  private mergeEarliestEntries(): void {
    if (this.compressedHistory.length < 2) return;

    const [first, second] = this.compressedHistory.splice(0, 2);

    const merged: HistoryEntry = {
      iteration: first.iteration,
      timestamp: first.timestamp,
      userInput: first.userInput,
      
      // 保留最有用的信息
      actionType: second.actionType,  // 最后的动作
      toolName: second.toolName,
      toolResult: second.toolResult?.success ? second.toolResult : first.toolResult,
      
      // 合并思考
      thinking: {
        summary: `Tried: ${first.actionType}. Then: ${second.actionType}`,
        confidence: ((first.thinking?.confidence || 0.5) + (second.thinking?.confidence || 0.5)) / 2,
      },
    };

    this.compressedHistory.unshift(merged);
  }

  /**
   * 获取发给 LLM 的历史记录
   * 这是真正用于 prompt 的内容
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
      // 不包含 fullResult，太冗长
    }));
  }

  /**
   * 获取用于调试的完整历史
   */
  getFullHistoryForDebugging(): any[] {
    return this.fullHistory;
  }

  /**
   * 估计当前历史的 token 数
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
   * 生成供 LLM 使用的历史摘要
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
