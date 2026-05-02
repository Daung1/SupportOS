/// <reference types="jest" />

/**
 * TriageService unit tests.
 *
 * Verifies:
 *   - empty / pure-emoji / pure-punctuation inputs short-circuit
 *     without calling the LLM (cheapClassify path)
 *   - well-formed Flash JSON is parsed and validated
 *   - malformed Flash JSON falls back to "in-domain question" so the
 *     cascade keeps running (degraded=true marker)
 *   - LRU cache replays results without re-calling the LLM
 */

import { TriageService } from './triage.service';
import { GeminiService } from '../gemini/gemini.service';

function makeGemini(impl: jest.Mock = jest.fn()): GeminiService {
  return { callJson: impl } as unknown as GeminiService;
}

describe('TriageService', () => {
  it('shortcircuits empty input without LLM call', async () => {
    const callJson = jest.fn();
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('   ');
    expect(result.inDomain).toBe(false);
    expect(result.intent).toBe('unclear');
    expect(callJson).not.toHaveBeenCalled();
  });

  it('shortcircuits emoji-only input', async () => {
    const callJson = jest.fn();
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('👍😀');
    expect(result.inDomain).toBe(false);
    expect(result.intent).toBe('chitchat');
    expect(callJson).not.toHaveBeenCalled();
  });

  it('shortcircuits punctuation-only input', async () => {
    const callJson = jest.fn();
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('???!!!');
    expect(result.inDomain).toBe(false);
    expect(result.intent).toBe('unclear');
    expect(callJson).not.toHaveBeenCalled();
  });

  it('parses valid LLM JSON and returns the structured result', async () => {
    const callJson = jest.fn().mockResolvedValue({
      inDomain: true,
      intent: 'question',
      category: 'billing',
      confidence: 0.92,
      reformulated: 'How do I get a refund?',
      reason: 'refund question',
    });
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('how to refund?');

    expect(result.inDomain).toBe(true);
    expect(result.intent).toBe('question');
    expect(result.category).toBe('billing');
    expect(result.reformulated).toBe('How do I get a refund?');
    expect(callJson).toHaveBeenCalledTimes(1);
  });

  it('coerces unknown intent into "question" via validation', async () => {
    const callJson = jest.fn().mockResolvedValue({
      inDomain: true,
      intent: 'banana',
      category: 'shipping',
      confidence: 0.7,
      reformulated: null,
      reason: 'odd',
    });
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('test');
    expect(result.intent).toBe('question');
  });

  it('coerces unknown category to null', async () => {
    const callJson = jest.fn().mockResolvedValue({
      inDomain: true,
      intent: 'question',
      category: 'food',
      confidence: 0.8,
      reformulated: null,
      reason: 'odd',
    });
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('test');
    expect(result.category).toBeNull();
  });

  it('falls back to degraded in-domain on LLM error', async () => {
    const callJson = jest.fn().mockRejectedValue(new Error('timeout'));
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('serious question');
    expect(result.inDomain).toBe(true);
    expect(result.intent).toBe('question');
    expect(result.degraded).toBe(true);
  });

  it('falls back to degraded when LLM returns garbage', async () => {
    const callJson = jest.fn().mockResolvedValue('not an object');
    const svc = new TriageService(makeGemini(callJson));

    const result = await svc.triage('serious question');
    expect(result.inDomain).toBe(true);
    expect(result.intent).toBe('question');
    expect(result.degraded).toBe(true);
  });

  it('caches identical inputs (case-insensitive)', async () => {
    const callJson = jest.fn().mockResolvedValue({
      inDomain: true,
      intent: 'question',
      category: 'billing',
      confidence: 0.9,
      reformulated: null,
      reason: 'r',
    });
    const svc = new TriageService(makeGemini(callJson));

    await svc.triage('How to refund?');
    await svc.triage('how to refund?');
    await svc.triage('  HOW TO REFUND?  ');

    expect(callJson).toHaveBeenCalledTimes(1);
  });
});
