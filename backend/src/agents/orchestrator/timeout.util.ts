/**
 * withTimeout - race a Promise against a timeout.
 *
 * The orchestrator applies this to every agent execution so a hung
 * LLM call or a stuck tool cannot block the pipeline indefinitely.
 *
 * Notes:
 *   - On timeout, the returned Promise rejects with `TimeoutError`;
 *     the original Promise is *not* cancelled (Promises have no
 *     cancellation primitive).  Downstream code must treat the
 *     dangling work as "still running in the background" if it holds
 *     I/O resources.
 *   - `timeoutMs <= 0` disables the timeout; the original Promise is
 *     returned as-is.  This keeps tests that want no timeout from
 *     having to mock timers.
 */

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    // Prevent the timer from keeping the Node event loop alive if the
    // caller forgets to await; only the caller's Promise should hold
    // the loop open.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
