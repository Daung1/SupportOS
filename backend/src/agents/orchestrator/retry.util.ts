/**
 * retryWithBackoff - small Promise-based retry helper.
 *
 * The orchestrator wraps every agent execution with this helper so
 * transient failures (LLM 429s, flaky network, tool timeouts) are
 * retried with an exponentially increasing delay instead of failing
 * the whole pipeline on the first hiccup.
 *
 * We ship our own helper rather than pulling in `p-retry` because
 *   - `p-retry` v5+ is ESM-only, which costs us a chunk of friction in
 *     the CJS NestJS build;
 *   - the semantics we need (fixed retry count + exponential delay +
 *     optional per-error predicate + onRetry hook) are ~30 lines.
 *
 * Semantics:
 *   - `retries` is the number of *additional* attempts after the
 *     initial one, i.e. `retries=3` yields up to 4 total calls.
 *   - Delay grows as `minDelayMs * 2^(attempt-1)`, capped at
 *     `maxDelayMs`.  No jitter is applied; jitter can be layered on via
 *     `onRetry` if needed.
 *   - `shouldRetry` returning `false` aborts the loop immediately; the
 *     most recent error is re-thrown.
 *   - `onRetry` is a fire-and-forget hook (e.g. for logging); it runs
 *     before the delay.  Its return value is ignored.
 */

export interface RetryOptions {
  /** Number of additional attempts after the initial one (>= 0). */
  retries: number;

  /** Minimum delay before the first retry, in milliseconds. */
  minDelayMs: number;

  /** Maximum delay between retries, in milliseconds. */
  maxDelayMs: number;

  /**
   * Predicate deciding whether to retry after a failure.  If omitted
   * every error triggers a retry (subject to the `retries` cap).
   *
   * Return `false` to stop immediately and re-throw the most recent
   * error.  `attempt` is 1-indexed and counts the attempt that just
   * failed.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /**
   * Fire-and-forget hook called before each delay.  `delayMs` is the
   * upcoming wait in milliseconds.  Intended for logging and metrics;
   * any thrown error from the hook is swallowed to keep the retry loop
   * robust.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Execute `fn` with exponential-backoff retries.
 *
 * The last error encountered is re-thrown once retries are exhausted or
 * `shouldRetry` returns false.  Successful resolution of `fn` on any
 * attempt short-circuits the loop and returns immediately.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.retries) + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt >= maxAttempts;
      const canRetry = options.shouldRetry
        ? options.shouldRetry(err, attempt)
        : true;

      if (isLastAttempt || !canRetry) {
        break;
      }

      const base = options.minDelayMs * 2 ** (attempt - 1);
      const delay = Math.min(base, options.maxDelayMs);

      if (options.onRetry) {
        try {
          options.onRetry(err, attempt, delay);
        } catch {
          // Hooks must never break the retry loop.
        }
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
