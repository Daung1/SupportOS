import { ConcurrencyQueue } from './concurrency-queue';

describe('ConcurrencyQueue', () => {
  function deferred<T = void>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (err: unknown) => void;
  } {
    let resolve!: (v: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('throws when concurrency is < 1', () => {
    expect(() => new ConcurrencyQueue(0)).toThrow();
    expect(() => new ConcurrencyQueue(-1)).toThrow();
    expect(() => new ConcurrencyQueue(Number.NaN)).toThrow();
  });

  it('returns the function result on success', async () => {
    const q = new ConcurrencyQueue(2);
    await expect(q.add(async () => 42)).resolves.toBe(42);
  });

  it('propagates errors to the caller', async () => {
    const q = new ConcurrencyQueue(2);
    await expect(
      q.add(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('caps concurrency to the configured value', async () => {
    const q = new ConcurrencyQueue(2);
    const d1 = deferred();
    const d2 = deferred();
    const d3 = deferred();

    // Track how many are currently executing.
    let running = 0;
    let maxRunning = 0;
    const track = async (d: { promise: Promise<void> }) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await d.promise;
      running--;
    };

    const p1 = q.add(() => track(d1));
    const p2 = q.add(() => track(d2));
    const p3 = q.add(() => track(d3));

    // Give the scheduler a tick to promote the first two into active.
    await new Promise((resolve) => setImmediate(resolve));
    expect(q.stats().active).toBe(2);
    expect(q.stats().pending).toBe(1);

    d1.resolve();
    await p1;
    d2.resolve();
    await p2;
    d3.resolve();
    await p3;

    expect(maxRunning).toBe(2);
    expect(q.stats().active).toBe(0);
    expect(q.stats().pending).toBe(0);
    expect(q.stats().completed).toBe(3);
  });

  it('FIFO-drains waiters in submission order', async () => {
    const q = new ConcurrencyQueue(1);
    const d1 = deferred();
    const order: number[] = [];

    const p1 = q.add(async () => {
      await d1.promise;
      order.push(1);
    });
    const p2 = q.add(async () => {
      order.push(2);
    });
    const p3 = q.add(async () => {
      order.push(3);
    });

    d1.resolve();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('counts failures in stats', async () => {
    const q = new ConcurrencyQueue(1);
    await expect(
      q.add(async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow();
    await q.add(async () => 1);
    const stats = q.stats();
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);
  });

  it('onIdle resolves once all tasks complete', async () => {
    const q = new ConcurrencyQueue(2);
    const tasks: Promise<number>[] = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(
        q.add(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return i;
        }),
      );
    }
    await q.onIdle();
    expect(q.stats().active).toBe(0);
    expect(q.stats().pending).toBe(0);
    await Promise.all(tasks);
  });
});
