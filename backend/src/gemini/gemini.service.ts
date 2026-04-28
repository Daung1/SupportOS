/**
 * Gemini Model Client Service
 * Implements the IModelClient interface using Google's Gemini API
 * Handles all LLM calls, token counting, and response parsing
 */

import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IModelClient, ModelCallContext } from '../agents/core/model-client.interface';
import {
  GoogleGenerativeAI,
  Content,
} from '@google/generative-ai';
import { ITokenRecorder, TOKEN_RECORDER } from '../tokens/token-recorder.interface';

@Injectable()
export class GeminiService implements OnModuleInit, IModelClient {
  private readonly logger = new Logger(GeminiService.name);
  private client!: GoogleGenerativeAI;
  private model = 'gemini-2.5-flash-lite';
  private lastTokenUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(
    private configService: ConfigService,
    @Optional()
    @Inject(TOKEN_RECORDER)
    private readonly tokenRecorder?: ITokenRecorder,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Call the Gemini API with messages and optional system prompt
   * @param messages - Array of messages with role and content
   * @param systemPrompt - Optional system prompt to guide behavior
   * @param options - Optional model configuration
   * @returns The model's text response
   */
  async call(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    },
    callContext?: ModelCallContext,
  ): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
      });

      // Convert messages to Gemini format
      const contents: Content[] = messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // Build generation config
      const generationConfig: any = {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxTokens ?? 2048,
        topP: options?.topP ?? 0.95,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        generationConfig.system = systemPrompt;
      }

      // Call the API
      const result = await model.generateContent({
        contents,
        generationConfig,
      });

      const response = result.response;
      const responseText = response.text();

      // Estimate tokens (Gemini doesn't provide exact counts in this SDK)
      // Using approximation: ~4 characters = 1 token
      const inputText = messages.map((m) => m.content).join('');
      const estimatedInputTokens = Math.ceil(
        (inputText.length + (systemPrompt?.length || 0)) / 4,
      );
      const estimatedOutputTokens = Math.ceil(responseText.length / 4);

      this.lastTokenUsage = {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
      };

      this.recordUsage(estimatedInputTokens, estimatedOutputTokens, callContext);

      return responseText;
    } catch (error) {
      throw new Error(
        `Gemini API call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Forward per-call token usage to the TokenTracker if a recorder is
   * wired and a sessionId was supplied.  Silent no-op otherwise so the
   * service works stand-alone in tests and CLI contexts.
   */
  private recordUsage(
    inputTokens: number,
    outputTokens: number,
    callContext?: ModelCallContext,
  ): void {
    if (!this.tokenRecorder) return;
    if (!callContext?.sessionId) return;
    try {
      this.tokenRecorder.record({
        sessionId: callContext.sessionId,
        agentName: callContext.agentName,
        ticketId: callContext.ticketId,
        model: this.model,
        inputTokens,
        outputTokens,
        timestamp: Date.now(),
      });
    } catch (err) {
      // Recording must never break the LLM call path.
      this.logger.warn(
        `TokenRecorder.record() threw; ignoring: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Get token usage from the last API call
   * @returns Token usage statistics
   */
  getLastTokenUsage(): { inputTokens: number; outputTokens: number } {
    return this.lastTokenUsage;
  }

  /**
   * Stream text generation from Gemini
   * For real-time streaming support
   * @param messages - Array of messages
   * @param systemPrompt - Optional system prompt
   * @returns Async generator yielding text chunks
   */
  async *streamText(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
  ): AsyncGenerator<string> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
      });

      const contents: Content[] = messages.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const generationConfig: any = {
        temperature: 0.3,
        maxOutputTokens: 2048,
      };

      if (systemPrompt) {
        generationConfig.system = systemPrompt;
      }

      const stream = await model.generateContentStream({
        contents,
        generationConfig,
      });

      for await (const chunk of stream.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      throw new Error(
        `Gemini streaming failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
