import { retryWithBackoff } from './retry.util';

describe('retryWithBackoff', () => {
  it('returns immediately when the first attempt succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, {
      retries: 3,
      minDelayMs: 1,
      maxDelayMs: 10,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until it succeeds and reports the correct attempt count', async () => {
    const onRetry = jest.fn();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('ok');

    const result = await retryWithBackoff(fn, {
      retries: 3,
      minDelayMs: 1,
      maxDelayMs: 5,
      onRetry,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1);
    expect(onRetry.mock.calls[1][1]).toBe(2);
  });

  it('gives up and rethrows after retries are exhausted', async () => {
    const err = new Error('boom');
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      retryWithBackoff(fn, { retries: 2, minDelayMs: 1, maxDelayMs: 1 }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('caps the delay at maxDelayMs', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      retryWithBackoff(fn, {
        retries: 4,
        minDelayMs: 100,
        maxDelayMs: 150,
        onRetry,
      }),
    ).rejects.toThrow('boom');

    for (const call of onRetry.mock.calls) {
      expect(call[2]).toBeLessThanOrEqual(150);
    }
  });

  it('stops early when shouldRetry returns false', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockRejectedValueOnce(new TypeError('structural'));

    const shouldRetry = jest.fn().mockImplementation((err: unknown) => {
      return !(err instanceof TypeError);
    });

    await expect(
      retryWithBackoff(fn, {
        retries: 5,
        minDelayMs: 1,
        maxDelayMs: 1,
        shouldRetry,
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('swallows errors thrown from the onRetry hook', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn().mockImplementation(() => {
      throw new Error('hook broke');
    });

    await expect(
      retryWithBackoff(fn, {
        retries: 2,
        minDelayMs: 1,
        maxDelayMs: 1,
        onRetry,
      }),
    ).resolves.toBe('ok');
  });

  it('treats retries < 0 as zero retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      retryWithBackoff(fn, { retries: -5, minDelayMs: 1, maxDelayMs: 1 }),
    ).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
