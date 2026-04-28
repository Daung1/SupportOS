/**
 * Model client interface
 * Defines the contract for LLM model interactions
 */

/**
 * Optional per-call context supplied by the agent so the model client
 * can attribute token usage to a session.  The field is deliberately
 * narrow (sessionId + agentName + ticketId) to avoid leaking the
 * entire ISessionContext into every LLM adapter.
 */
export interface ModelCallContext {
  /** Required when present: groups token usage records per session. */
  sessionId?: string;
  /** Caller's agent / service name for trace attribution. */
  agentName?: string;
  /** Optional ticket correlation id for downstream log join. */
  ticketId?: string;
}

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
   * @param callContext - Optional attribution context (A.6 TokenTracker)
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
    callContext?: ModelCallContext,
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
