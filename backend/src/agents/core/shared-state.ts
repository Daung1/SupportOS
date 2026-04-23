/**
 * SharedState - typed accessor for cross-agent state.
 *
 * Background:
 *   Agents communicate via `context.state: Map<string, any>`.  Using raw
 *   `state.get('analyzerResult') as any` is fragile: typos are silent and
 *   value shapes are invisible at call sites.  SharedState wraps the same
 *   Map and provides a strongly-typed `get / set / require / has` API so
 *   the TypeScript compiler can catch:
 *     - unknown / misspelled keys
 *     - shape mismatches on read
 *     - missing required inputs (require() throws a clear error)
 *
 * Design:
 *   - SharedState is a thin wrapper over the existing Map.  The underlying
 *     Map is shared by reference, so raw reads still work and legacy code
 *     keeps compiling.
 *   - Types are defined structurally in this file to avoid circular imports
 *     from cascade/ and classifier/.  Those modules produce objects that
 *     satisfy the shapes declared here.
 *   - The schema is intentionally permissive where agent outputs are still
 *     evolving (e.g. SharedAnalyzerResult allows extra fields via index
 *     signature).  We will tighten this as the generators stabilise.
 */

// -----------------------------------------------------------------------------
// Value shapes
// -----------------------------------------------------------------------------

/**
 * Output of AnalyzerAgent once seeded onto the shared state by the
 * orchestrator (or by tests).  Fields that the downstream agents rely on
 * are required; optional fields cover metadata that only scenario C
 * (TECH_ISSUE) consumes.
 */
export interface SharedAnalyzerResult {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  keywords: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  summary?: string;
  confidence?: number;
  hasOrderNumber?: boolean;
  hasSpecificInfo?: boolean;

  // Optional environment metadata that TECH_ISSUE scenario needs when
  // building a BugReport.  These typically come from analyzer metadata
  // extraction or the request itself.
  os?: string;
  appVersion?: string;
  userAgent?: string;
  customerEmail?: string;

  // Permit extension without breaking consumers during iteration.
  [extra: string]: any;
}

/** A single knowledge-base hit surfaced by SearcherAgent. */
export interface SharedSearcherDocument {
  id?: string;
  title: string;
  content?: string;
  source?: string;
  score?: number;
  relevance?: number;
  excerpt?: string;
  url?: string;
}

/**
 * Output of SearcherAgent.  Both `documents` and `sources` are accepted
 * because the current agent implementation returns `sources` while the
 * classifier historically reads `documents` / `documentsFound`.  The
 * orchestrator is expected to normalise these when seeding state; until
 * then we accept both spellings.
 */
export interface SharedSearcherResult {
  summary?: string;
  documentsFound: number;
  documents?: SharedSearcherDocument[];
  sources?: SharedSearcherDocument[];
  avgRelevance?: number;
  searchQueries?: string[];
}

/** FAQ match produced by Cascade Level 1 (FAQMatcher). */
export interface SharedFAQResult {
  matched: boolean;
  answer?: string;
  confidence: number;
  faqId?: string;
  reason?: string;
  processingTime?: number;
}

/** Problem classification produced by ProblemClassifier. */
export interface SharedClassificationResult {
  type: 'FAQ' | 'DOC_ANSWER' | 'TECH_ISSUE' | 'OTHER';
  confidence: number;
  reason: string;
  matchedKeywords: string[];
}

/**
 * Final output of GeneratorAgent.  Uses a permissive envelope because the
 * four scenarios (FAQ / EDITABLE_RESPONSE / TECH_ISSUE /
 * RESULT_WITH_SUGGESTIONS) each carry different payloads; the frontend
 * switches on `type`.
 */
export interface SharedGeneratorResult {
  type:
    | 'FAQ'
    | 'EDITABLE_RESPONSE'
    | 'TECH_ISSUE'
    | 'RESULT_WITH_SUGGESTIONS';
  source: string;
  confidence: number;
  [extra: string]: any;
}

/** Decision produced by SafetyGate after running the guardrail pipeline. */
export interface SharedSafetyResult {
  decision: 'approve' | 'review' | 'reject';
  confidence: number;
  scores: {
    rule?: boolean;
    heuristic?: number;
    llm?: number;
    final: number;
  };
  reasons: string[];
}

// -----------------------------------------------------------------------------
// Schema and key union
// -----------------------------------------------------------------------------

/**
 * Master schema mapping known shared-state keys to their value types.
 * Add new entries here whenever a new cross-agent contract is introduced.
 * Keys not declared here are considered "legacy" and must be accessed via
 * the raw Map (`SharedState.raw()`).
 */
export interface SharedStateSchema {
  analyzerResult: SharedAnalyzerResult;
  searcherResult: SharedSearcherResult;
  faqResult: SharedFAQResult;
  problemClassification: SharedClassificationResult;
  generatorResult: SharedGeneratorResult;
  safetyResult: SharedSafetyResult;
}

/** String literal union of all known keys - useful for runtime checks. */
export type SharedStateKey = keyof SharedStateSchema;

/** Runtime list of known keys (kept in sync with SharedStateSchema). */
export const SHARED_STATE_KEYS: readonly SharedStateKey[] = [
  'analyzerResult',
  'searcherResult',
  'faqResult',
  'problemClassification',
  'generatorResult',
  'safetyResult',
] as const;

// -----------------------------------------------------------------------------
// SharedState accessor
// -----------------------------------------------------------------------------

/**
 * Thin typed wrapper over a Map<string, any>.  Instances are cheap to
 * create; prefer `SharedState.from(context)` inside agent methods rather
 * than storing the wrapper on the class (state lifecycle is per-session
 * and pulling from the context keeps a single source of truth).
 */
export class SharedState {
  constructor(private readonly state: Map<string, any>) {}

  /**
   * Factory helper: wrap the state Map of a session context.  Accepts any
   * object with a `.state` Map (i.e. ISessionContext).
   */
  static from(context: { state: Map<string, any> }): SharedState {
    return new SharedState(context.state);
  }

  /**
   * Read a shared value.  Returns `undefined` if the key has not been set.
   */
  get<K extends SharedStateKey>(
    key: K,
  ): SharedStateSchema[K] | undefined {
    return this.state.get(key);
  }

  /**
   * Write a shared value.  The compiler enforces that `value` matches the
   * declared shape for `key`.
   */
  set<K extends SharedStateKey>(key: K, value: SharedStateSchema[K]): void {
    this.state.set(key, value);
  }

  /**
   * Read a value that is expected to be present.  Throws a descriptive
   * error when the key is missing - useful for agents that have a hard
   * dependency on an upstream agent's output.
   */
  require<K extends SharedStateKey>(key: K): SharedStateSchema[K] {
    const value = this.state.get(key);
    if (value === undefined || value === null) {
      throw new SharedStateMissingError(key);
    }
    return value as SharedStateSchema[K];
  }

  /** Check whether a shared value is set. */
  has<K extends SharedStateKey>(key: K): boolean {
    return this.state.has(key);
  }

  /** Remove a shared value.  Returns true if it existed. */
  delete<K extends SharedStateKey>(key: K): boolean {
    return this.state.delete(key);
  }

  /**
   * Escape hatch for accessing the underlying Map directly.  Use only
   * when interacting with legacy keys (e.g. `iteration_N` written by
   * BaseAgent) that are not part of the shared-state schema.
   */
  raw(): Map<string, any> {
    return this.state;
  }
}

/**
 * Thrown by `SharedState.require(key)` when a required shared value has
 * not been set.  Keeping this as a typed error makes it easy for
 * orchestrator / tests to assert on the failure mode.
 */
export class SharedStateMissingError extends Error {
  constructor(public readonly key: SharedStateKey) {
    super(
      `SharedState: required key "${key}" is missing. ` +
        `Did an upstream agent fail to populate it?`,
    );
    this.name = 'SharedStateMissingError';
  }
}
