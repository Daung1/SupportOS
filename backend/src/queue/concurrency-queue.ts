/**
 * ConcurrencyQueue - tiny promise-based semaphore with FIFO ordering.
 *
 * A zero-dependency replacement for `p-queue` that keeps the same
 * semantics we actually need:
 *   - at most `concurrency` tasks run in parallel
 *   - `add(fn)` returns a promise that resolves / rejects with fn's
 *     result (or error)
 *   - waiters drain in FIFO order
 *   - queue-level rejection is NEVER swallowed; the caller sees
 *     whatever fn threw
 *
 * We wrote this by hand instead of pulling `p-queue` because the v8+
 * release is ESM-only and clashes with our ts-jest / CommonJS setup
 * (same trade-off we made for retry.util in A.4).  The surface area
 * we use is small enough that a custom impl is cheaper than fighting
 * the ESM toolchain.
 *
 * This class is deliberately NOT an @Injectable.  It is pure TS and
 * can be instantiated directly by services, which makes it trivial
 * to unit-test without a Nest testing module.
 */

export interface ConcurrencyQueueStats {
  /** Tasks currently being executed. */
  active: number;
  /** Tasks waiting for a free slot. */
  pending: number;
  /** Tasks that ran to completion (resolved or rejected). */
  completed: number;
  /** Tasks whose handler rejected / threw. */
  failed: number;
}

export class ConcurrencyQueue {
  private active = 0;
  private completed = 0;
  private failed = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      throw new Error(
        `ConcurrencyQueue concurrency must be >= 1 (got ${concurrency})`,
      );
    }
  }

  /**
   * Enqueue a task.  Resolves with fn's result, rejects with fn's
   * error.  Queue slot is always released, even if fn throws
   * synchronously before returning a promise.
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      return await fn();
    } catch (err) {
      this.failed++;
      throw err;
    } finally {
      this.completed++;
      this.releaseSlot();
    }
  }

  stats(): ConcurrencyQueueStats {
    return {
      active: this.active,
      pending: this.waiters.length,
      completed: this.completed,
      failed: this.failed,
    };
  }

  /** Waits until all current and queued tasks complete. */
  async onIdle(): Promise<void> {
    if (this.active === 0 && this.waiters.length === 0) return;
    // Poll-based implementation keeps the code simple; tests use small
    // queues so overhead is negligible.  A listener-based version is
    // an easy upgrade if this ever shows up in a flamegraph.
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (this.active === 0 && this.waiters.length === 0) {
          resolve();
        } else {
          setImmediate(tick);
        }
      };
      setImmediate(tick);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private acquireSlot(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
