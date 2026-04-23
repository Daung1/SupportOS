import { TimeoutError, withTimeout } from './timeout.util';

describe('withTimeout', () => {
  it('resolves when the wrapped promise finishes first', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('ok'), 10));
    await expect(withTimeout(promise, 100)).resolves.toBe('ok');
  });

  it('rejects with TimeoutError when the deadline passes', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('late'), 50));
    await expect(withTimeout(promise, 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('propagates a rejection from the wrapped promise', async () => {
    const err = new Error('downstream');
    const promise = Promise.reject(err);
    await expect(withTimeout(promise, 100)).rejects.toBe(err);
  });

  it('disables the timeout when timeoutMs is zero or negative', async () => {
    const promise = new Promise((resolve) => setTimeout(() => resolve('ok'), 20));
    await expect(withTimeout(promise, 0)).resolves.toBe('ok');
    await expect(withTimeout(promise, -1)).resolves.toBe('ok');
  });

  it('clears the internal timer after settling', async () => {
    jest.useFakeTimers();
    try {
      const promise = Promise.resolve('done');
      const awaited = withTimeout(promise, 1000);
      await expect(awaited).resolves.toBe('done');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('TimeoutError carries the configured timeout', () => {
    const err = new TimeoutError(1234);
    expect(err.timeoutMs).toBe(1234);
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toContain('1234');
  });
});
