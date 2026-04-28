import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { ITokenRecorder, TokenRecord } from '../tokens/token-recorder.interface';

/**
 * Mock the Google SDK so we never hit the network in tests.  The mock is
 * re-used across all specs in this file; individual tests configure the
 * generateContent return value via `setGenerateContentResponse`.
 */
let mockGenerateContent: jest.Mock;

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: (...args: unknown[]) => mockGenerateContent(...args),
      }),
    })),
  };
});

function setGenerateContentResponse(text: string): void {
  mockGenerateContent.mockResolvedValue({
    response: { text: () => text },
  });
}

function makeConfigService(): ConfigService {
  return {
    get: jest.fn().mockReturnValue('test-api-key'),
  } as unknown as ConfigService;
}

function makeRecorder(): jest.Mocked<ITokenRecorder> {
  return { record: jest.fn() };
}

describe('GeminiService - TokenRecorder integration (A.6)', () => {
  beforeEach(() => {
    mockGenerateContent = jest.fn();
  });

  it('records token usage when a recorder is wired and context is supplied', async () => {
    setGenerateContentResponse('hi there');
    const recorder = makeRecorder();

    const svc = new GeminiService(makeConfigService(), recorder);
    svc.onModuleInit();

    await svc.call(
      [{ role: 'user', content: 'hello' }],
      undefined,
      undefined,
      { sessionId: 'sess-42', agentName: 'AnalyzerAgent', ticketId: 't-1' },
    );

    expect(recorder.record).toHaveBeenCalledTimes(1);
    const row = recorder.record.mock.calls[0][0] as TokenRecord;
    expect(row.sessionId).toBe('sess-42');
    expect(row.agentName).toBe('AnalyzerAgent');
    expect(row.ticketId).toBe('t-1');
    expect(row.model).toBeDefined();
    expect(row.inputTokens).toBeGreaterThan(0);
    expect(row.outputTokens).toBeGreaterThan(0);
    expect(typeof row.timestamp).toBe('number');
  });

  it('does not record when callContext is omitted', async () => {
    setGenerateContentResponse('no context');
    const recorder = makeRecorder();
    const svc = new GeminiService(makeConfigService(), recorder);
    svc.onModuleInit();

    await svc.call([{ role: 'user', content: 'anything' }]);

    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('does not record when callContext lacks sessionId', async () => {
    setGenerateContentResponse('partial context');
    const recorder = makeRecorder();
    const svc = new GeminiService(makeConfigService(), recorder);
    svc.onModuleInit();

    await svc.call(
      [{ role: 'user', content: 'x' }],
      undefined,
      undefined,
      { agentName: 'Anon' } as any,
    );

    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('still succeeds when no recorder is wired at all', async () => {
    setGenerateContentResponse('bare');
    const svc = new GeminiService(makeConfigService());
    svc.onModuleInit();

    await expect(
      svc.call(
        [{ role: 'user', content: 'x' }],
        undefined,
        undefined,
        { sessionId: 's' },
      ),
    ).resolves.toBe('bare');
  });

  it('swallows recorder exceptions without breaking the LLM call', async () => {
    setGenerateContentResponse('ok');
    const recorder: jest.Mocked<ITokenRecorder> = {
      record: jest.fn((_: TokenRecord): void => {
        throw new Error('recorder exploded');
      }),
    };
    const svc = new GeminiService(makeConfigService(), recorder);
    svc.onModuleInit();

    await expect(
      svc.call(
        [{ role: 'user', content: 'x' }],
        undefined,
        undefined,
        { sessionId: 's' },
      ),
    ).resolves.toBe('ok');

    expect(recorder.record).toHaveBeenCalled();
  });

  it('still populates getLastTokenUsage for backward compatibility', async () => {
    setGenerateContentResponse('some response text');
    const recorder = makeRecorder();
    const svc = new GeminiService(makeConfigService(), recorder);
    svc.onModuleInit();

    await svc.call(
      [{ role: 'user', content: 'hello world' }],
      undefined,
      undefined,
      { sessionId: 's' },
    );

    const usage = svc.getLastTokenUsage();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });
});
