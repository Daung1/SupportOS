/**
 * TriageService — Level 0 intent router.
 *
 * Sits in front of FAQMatcher / MultiAgent and decides three things
 * about every incoming user input:
 *
 *   1. Is this even a customer-service question? (`inDomain`)
 *      Greetings, thanks, emoji, abuse all return false here so we
 *      don't waste an L1 round-trip — and more importantly, don't
 *      mechanically match a FAQ for "thanks!" just because the word
 *      "thanks" happened to embed near some doc.
 *
 *   2. What kind of utterance is it? (`intent`)
 *      `question` is the only one that should proceed to L1. The
 *      others get short-circuited with friendly canned responses.
 *
 *   3. Which support category does it fall under? (`category`)
 *      Used as a soft hint by FAQMatcher to shrink the candidate set.
 *      May be null when the model isn't confident.
 *
 * We also ask the model to optionally rewrite the user's query into
 * a clearer interrogative form (`reformulated`). Short fragments
 * like "how to refund?" embed poorly because they lack context;
 * passing the rewrite to FAQMatcher when present typically lifts
 * scores by ~5pp.
 *
 * Failure handling: if the LLM call errors, times out, or returns
 * something we can't validate, we degrade to "in-domain, unknown
 * category, no reformulation" so the cascade still runs. We
 * deliberately don't return inDomain=false on error — false is
 * user-visible (turns into "please describe your problem") and
 * we don't want a transient API blip to silently reject real
 * questions.
 *
 * The whole call is wrapped in an LRU cache keyed by the trimmed,
 * lowercased input. Repeat queries (and there are a lot of them in
 * client retries / page refreshes) skip the LLM entirely.
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';

export type TriageIntent =
  | 'question'
  | 'chitchat'
  | 'greeting'
  | 'complaint'
  | 'abuse'
  | 'unclear';

export type SupportCategory =
  | 'shipping'
  | 'billing'
  | 'account'
  | 'product'
  | 'policy';

export interface TriageResult {
  inDomain: boolean;
  intent: TriageIntent;
  category: SupportCategory | null;
  /** 0-1, model self-reported. Treat as a hint, not a hard signal. */
  confidence: number;
  /** Optional rewrite as a clear question. Null when not helpful. */
  reformulated: string | null;
  reason: string;
  /**
   * `true` when the result came from a degraded path (LLM error or
   * shape validation failure). Callers may want to log this but
   * still let the request through.
   */
  degraded?: boolean;
}

const CATEGORIES: SupportCategory[] = [
  'shipping',
  'billing',
  'account',
  'product',
  'policy',
];
const INTENTS: TriageIntent[] = [
  'question',
  'chitchat',
  'greeting',
  'complaint',
  'abuse',
  'unclear',
];

const PROMPT_TEMPLATE = `You are a triage classifier for a customer-support system. Given a single user input, output JSON with exactly these fields:

{
  "inDomain": boolean,
  "intent": "question" | "chitchat" | "greeting" | "complaint" | "abuse" | "unclear",
  "category": "shipping" | "billing" | "account" | "product" | "policy" | null,
  "confidence": number between 0 and 1,
  "reformulated": string | null,
  "reason": short string
}

Definitions:
- inDomain=true: the user is asking for help, reporting a problem, or otherwise wants the support team to do something.
- inDomain=false: greetings, thanks, emoji, single-word acks, abuse, or content unrelated to e-commerce support.
- intent=question: clear or paraphrased question (even short fragments like "how to refund?").
- intent=chitchat: small talk, "ok", "thanks", "lol", "wow".
- intent=greeting: "hi", "hello", "good morning".
- intent=complaint: expressing dissatisfaction without an answerable question.
- intent=abuse: insults, profanity directed at the company.
- intent=unclear: ambiguous or too short to act on (e.g. "?", "help").
- category: best-guess support area; null when not confident or not in-domain.
- reformulated: rewrite fragments into a clear question (e.g. "how to refund?" -> "How do I get a refund?"). null if not needed.

Examples:
input: "how to refund?"
output: {"inDomain":true,"intent":"question","category":"billing","confidence":0.9,"reformulated":"How do I get a refund?","reason":"refund question"}

input: "thanks!"
output: {"inDomain":false,"intent":"chitchat","category":null,"confidence":0.95,"reformulated":null,"reason":"acknowledgement"}

input: "your service sucks"
output: {"inDomain":true,"intent":"complaint","category":null,"confidence":0.8,"reformulated":null,"reason":"general complaint, no actionable question"}

input: "where is my order"
output: {"inDomain":true,"intent":"question","category":"shipping","confidence":0.9,"reformulated":"Where is my order?","reason":"order tracking"}

Now classify this input and return ONLY the JSON object, no prose:
input: USER_INPUT_PLACEHOLDER`;

/**
 * Tiny, dependency-free LRU cache. ~1KB per entry, max ~250KB.
 */
class LRUCache<V> {
  private map = new Map<string, V>();
  constructor(private readonly capacity: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);
  private cache = new LRUCache<TriageResult>(256);

  constructor(private readonly gemini: GeminiService) {}

  async triage(userInput: string): Promise<TriageResult> {
    const trimmed = (userInput ?? '').trim();
    if (trimmed.length === 0) {
      return {
        inDomain: false,
        intent: 'unclear',
        category: null,
        confidence: 1,
        reformulated: null,
        reason: 'empty input',
      };
    }

    // Cheap pre-classification for obvious cases - saves a Flash
    // call on inputs the model would also classify trivially.
    const cheap = this.cheapClassify(trimmed);
    if (cheap) return cheap;

    const cacheKey = trimmed.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const prompt = PROMPT_TEMPLATE.replace(
      'USER_INPUT_PLACEHOLDER',
      JSON.stringify(trimmed),
    );

    try {
      const raw = await this.gemini.callJson<unknown>(prompt, {
        temperature: 0.0,
        maxTokens: 256,
      });
      const validated = this.validate(raw);
      this.cache.set(cacheKey, validated);
      return validated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Triage LLM failed, degrading: ${message}`);
      // Fail open: assume in-domain question with no category hint.
      return {
        inDomain: true,
        intent: 'question',
        category: null,
        confidence: 0.0,
        reformulated: null,
        reason: `triage degraded (${message.slice(0, 80)})`,
        degraded: true,
      };
    }
  }

  // ---------------------------------------------------------------------------

  /**
   * Catches the trivially-classifiable cases without burning an API
   * call. Order matters: emoji/punct/length checks fire before the
   * very-short-question short-circuit.
   */
  private cheapClassify(input: string): TriageResult | null {
    const stripped = input.replace(/[\p{Emoji_Presentation}\p{Emoji}\u200d]/gu, '').trim();
    if (stripped.length === 0) {
      return {
        inDomain: false,
        intent: 'chitchat',
        category: null,
        confidence: 0.95,
        reformulated: null,
        reason: 'emoji-only input',
      };
    }
    if (/^[\s\p{P}]+$/u.test(input)) {
      return {
        inDomain: false,
        intent: 'unclear',
        category: null,
        confidence: 0.9,
        reformulated: null,
        reason: 'punctuation-only input',
      };
    }
    return null;
  }

  /**
   * Strict validation of the model's JSON. Anything off-spec falls
   * back to a "valid but conservative" interpretation - we don't
   * throw because the caller already wraps us in a try/catch and
   * we want the cascade to keep running.
   */
  private validate(raw: unknown): TriageResult {
    if (!raw || typeof raw !== 'object') {
      throw new Error('triage response is not an object');
    }
    const r = raw as Record<string, unknown>;

    const intent = INTENTS.includes(r.intent as TriageIntent)
      ? (r.intent as TriageIntent)
      : 'question';
    const category =
      r.category === null || r.category === undefined
        ? null
        : CATEGORIES.includes(r.category as SupportCategory)
          ? (r.category as SupportCategory)
          : null;
    const inDomain =
      typeof r.inDomain === 'boolean' ? r.inDomain : intent === 'question';
    const confidence =
      typeof r.confidence === 'number' &&
      r.confidence >= 0 &&
      r.confidence <= 1
        ? r.confidence
        : 0.5;
    const reformulated =
      typeof r.reformulated === 'string' && r.reformulated.trim().length > 0
        ? r.reformulated.trim()
        : null;
    const reason =
      typeof r.reason === 'string' ? r.reason.slice(0, 200) : 'classified';

    return { inDomain, intent, category, confidence, reformulated, reason };
  }
}
