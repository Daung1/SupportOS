/**
 * Model client interface
 * Defines the contract for LLM model interactions
 */

/**
 * IModelClient interface
 * Abstracts the interaction with language models
 * Implementations can support various LLM providers (Claude, GPT, etc.)
 */
export interface IModelClient {
  /**
   * Call the LLM model with a message sequence
   * @param messages - Array of message objects with role and content
   * @param systemPrompt - Optional system prompt to guide the model behavior
   * @param options - Optional configuration for the model call
   * @returns The model's text response
   * @throws Error if the API call fails
   */
  call(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    },
  ): Promise<string>;

  /**
   * Get the token usage from the last model call
   * @returns Token usage statistics (input and output tokens)
   */
  getLastTokenUsage(): {
    inputTokens: number;
    outputTokens: number;
  };
}
