/**
 * Gemini Model Client Service
 * Implements the IModelClient interface using Google's Gemini API
 * Handles all LLM calls, token counting, and response parsing
 */

import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IModelClient, ModelCallContext } from '../agents/core/model-client.interface';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { ITokenRecorder, TOKEN_RECORDER } from '../tokens/token-recorder.interface';
import { retryWithBackoff } from '../agents/orchestrator/retry.util';

/** Task type for retrieval embeddings. We only need the asymmetric pair. */
export type EmbedTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

/**
 * Gemini transient errors to retry. Covers:
 *  - 429 (RESOURCE_EXHAUSTED / rate limit)
 *  - 500 / 502 / 503 / 504 (model overload, upstream blip)
 *  - "high demand" / "overloaded" / "unavailable" prose Google sometimes
 *    returns inside an otherwise 200 response wrapper
 *  - generic `fetch failed` / network reset (transient connectivity)
 *
 * Anything else (400 schema, 401 auth, 403 quota disabled, 404 model
 * not found) is a configuration/code bug and re-throwing fast helps us
 * surface it instead of burning attempts.
 */
const TRANSIENT_PATTERNS: RegExp[] = [
  /\b(429|500|502|503|504)\b/,
  /\bhigh demand\b/i,
  /\boverload(?:ed)?\b/i,
  /\bunavailable\b/i,
  /\bUNAVAILABLE\b/,
  /\bRESOURCE_EXHAUSTED\b/,
  /\bDEADLINE_EXCEEDED\b/,
  /\bfetch failed\b/i,
  /\bECONN(?:RESET|REFUSED|ABORTED)\b/,
  /\btimed? ?out\b/i,
];

const isTransientGeminiError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
};

@Injectable()
export class GeminiService implements OnModuleInit, IModelClient {
  private readonly logger = new Logger(GeminiService.name);
  private client!: GoogleGenerativeAI;
  private model = 'gemini-2.5-flash-lite';
  /**
   * Lightweight model used by the L0 triage router. Cheap + fast; we
   * trade absolute accuracy for sub-300ms latency on every request.
   * `gemini-2.0-flash-lite` was retired by Google for new users in
   * mid-2026 ("This model is no longer available to new users"); the
   * current stable lite model is `gemini-2.5-flash-lite`.
   */
  private triageModel = 'gemini-2.5-flash-lite';
  /**
   * Embedding model. We pin to `gemini-embedding-001` (the v1beta-only
   * stable replacement for the now-retired `text-embedding-004`) and
   * request 768 dims via `outputDimensionality` for parity with the
   * old corpus (and to keep the `FAQEmbedding.vector` JSON small).
   * Note: the new model dropped the synchronous `batchEmbedContents`
   * task, so embedBatch() fans out parallel single embedContent calls.
   * If we ever switch models, also bump EMBEDDING_MODEL so the value
   * persisted in `FAQEmbedding.model` no longer matches and we
   * re-embed on next boot.
   */
  public static readonly EMBEDDING_MODEL = 'gemini-embedding-001';
  public static readonly EMBEDDING_DIM = 768;
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

      // Call the API. Wrap in transient-error retry: Gemini periodically
      // returns 503 "model is currently experiencing high demand"
      // (especially on flash-lite during traffic spikes) - a couple of
      // exponential-backoff retries usually rides through it without
      // bubbling the failure up to the user.
      const result = await this.runWithRetry(
        () => model.generateContent({ contents, generationConfig }),
        'call',
      );

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
   * Retry-on-transient wrapper used by every Gemini API call site.
   *
   * Policy: 3 attempts total (initial + 2 retries), 800ms / 1600ms
   * exponential backoff, capped at 4s. Only retries errors matching
   * TRANSIENT_PATTERNS (5xx / 429 / overload prose / connectivity);
   * client errors (400 / 401 / 403 / 404) re-throw immediately so
   * config bugs surface fast instead of paying ~2s of pointless retry
   * delay first.
   *
   * Worst-case added latency: 800 + 1600 = 2.4s on top of the failed
   * attempts themselves. This is well below the orchestrator-level
   * agent timeout (30s) and the orchestrator's own retry, so retries
   * compose cleanly without exploding total wait time.
   */
  private async runWithRetry<T>(
    fn: () => Promise<T>,
    opName: string,
  ): Promise<T> {
    return retryWithBackoff(fn, {
      retries: 2,
      minDelayMs: 800,
      maxDelayMs: 4000,
      shouldRetry: (err) => isTransientGeminiError(err),
      onRetry: (err, attempt, delay) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Gemini.${opName} attempt ${attempt} hit transient error, retrying in ${delay}ms: ${message.slice(0, 200)}`,
        );
      },
    });
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

      // Retry the stream-open call on transient errors. Once we start
      // iterating the stream we can't replay it, so retry only covers
      // the initial handshake - which is exactly where 503/overload
      // shows up in practice.
      const stream = await this.runWithRetry(
        () => model.generateContentStream({ contents, generationConfig }),
        'streamText',
      );

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

  // ---------------------------------------------------------------------------
  // Embedding API (text-embedding-004)
  //
  // We expose two task types because retrieval is asymmetric: the FAQ
  // corpus is embedded once with RETRIEVAL_DOCUMENT, queries at request
  // time go through RETRIEVAL_QUERY. Mixing them up costs ~10-15% in
  // recall on text-embedding-004, so callers must not rely on a default.
  // ---------------------------------------------------------------------------

  /** Embed a single text. Returns the raw float vector. */
  async embed(text: string, taskType: EmbedTaskType): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('embed: text must be non-empty');
    }
    try {
      const json = await this.callEmbedContent(text, taskType);
      return json.embedding.values;
    } catch (error) {
      throw new Error(
        `Gemini embed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Batch-embed many texts. The new `gemini-embedding-001` model only
   * exposes synchronous `embedContent` (single) and asynchronous
   * `asyncBatchEmbedContent` (long-running operation). For corpora of
   * the size we deal with at boot (~75 FAQs) the simplest and lowest-
   * latency answer is to fan out single calls with bounded concurrency.
   * Order is preserved so callers can zip results with their inputs.
   */
  async embedBatch(
    texts: string[],
    taskType: EmbedTaskType,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const CONCURRENCY = 8;
    const results: number[][] = new Array(texts.length);
    let nextIdx = 0;

    const worker = async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= texts.length) return;
        try {
          const json = await this.callEmbedContent(texts[i], taskType);
          results[i] = json.embedding.values;
        } catch (err) {
          throw new Error(
            `Gemini embedBatch failed at index ${i}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    };

    const pool = Array.from(
      { length: Math.min(CONCURRENCY, texts.length) },
      () => worker(),
    );
    await Promise.all(pool);
    return results;
  }

  /**
   * Direct v1beta REST call to embedContent.
   *
   * Why bypass the SDK?
   * The @google/generative-ai SDK at v0.3.1 has a bug where `embedContent`
   * builds its RequestUrl with an empty `requestOptions` object, silently
   * dropping any `apiVersion: 'v1beta'` we pass to `getGenerativeModel`.
   * Since `gemini-embedding-001` only lives on v1beta, the resulting v1
   * URL 404s. We call the REST endpoint directly until the SDK is
   * upgraded.
   */
  private async callEmbedContent(
    text: string,
    taskType: EmbedTaskType,
  ): Promise<{ embedding: { values: number[] } }> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${GeminiService.EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const body = {
      model: `models/${GeminiService.EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: GeminiService.EMBEDDING_DIM,
    };
    return this.runWithRetry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(
          `HTTP ${res.status} ${res.statusText}: ${errText.slice(0, 300)}`,
        );
      }
      return (await res.json()) as { embedding: { values: number[] } };
    }, 'embed');
  }

  // ---------------------------------------------------------------------------
  // JSON-mode call for the L0 triage router.
  //
  // We force `responseMimeType: 'application/json'` so the SDK validates
  // the output is a parseable JSON object. We do NOT pass a JSON schema
  // here because the SDK at v0.3.1 lacks robust schema constraint - we
  // do schema validation in the caller instead.
  // ---------------------------------------------------------------------------

  /**
   * Call the lightweight triage model and parse the response as JSON.
   * Throws if the model returns malformed JSON. Caller is responsible
   * for validating the parsed object's shape.
   */
  async callJson<T = unknown>(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<T> {
    try {
      // `responseMimeType: 'application/json'` is only honored by the
      // v1beta endpoint; on v1 the API rejects the field outright with
      // 400 "Unknown name responseMimeType".
      const model = this.client.getGenerativeModel(
        { model: this.triageModel },
        { apiVersion: 'v1beta' },
      );
      const result = await this.runWithRetry(
        () =>
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: options?.temperature ?? 0.0,
              maxOutputTokens: options?.maxTokens ?? 256,
              responseMimeType: 'application/json',
            } as any,
          }),
        'callJson',
      );
      const text = result.response.text();
      try {
        return JSON.parse(text) as T;
      } catch (parseErr) {
        throw new Error(
          `callJson: model did not return valid JSON. Raw: ${text.slice(0, 200)}`,
        );
      }
    } catch (error) {
      throw new Error(
        `Gemini callJson failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
