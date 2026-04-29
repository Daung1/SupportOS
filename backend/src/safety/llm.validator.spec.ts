import { LlmValidator } from './llm.validator';
import { IModelClient } from '../agents/core/model-client.interface';

describe('LlmValidator', () => {
  let validator: LlmValidator;
  let mockModelClient: jest.Mocked<IModelClient>;

  beforeEach(() => {
    mockModelClient = {
      call: jest.fn(),
      getLastTokenUsage: jest.fn(() => ({ inputTokens: 0, outputTokens: 0 })),
    } as any;
  });

  describe('Without Model Client', () => {
    beforeEach(() => {
      validator = new LlmValidator(undefined);
    });

    it('should return fallback result', async () => {
      const result = await validator.validate({
        ticketContent: 'How do I reset my account?',
        generatedResponse: 'Click the reset button',
      });

      expect(result).toBeDefined();
      expect(result.finalScore).toBe(0.6);
      expect(result.reasoning).toContain('offline');
    });

    it('should still assess basic heuristics', async () => {
      const result = await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'a'.repeat(100),
      });

      expect(result.answerRelevance).toBeGreaterThan(0.5);
    });
  });

  describe('With Model Client', () => {
    beforeEach(() => {
      validator = new LlmValidator(mockModelClient);
    });

    it('should return parsed LLM response', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 0.1,
          factual_consistency: 0.9,
          answer_relevance: 0.95,
          harm_score: 0.05,
          reasoning: 'Good response',
        }),
      );

      const result = await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'Answer',
      });

      expect(result.hallucinationLikelihood).toBeCloseTo(0.1);
      expect(result.factualConsistency).toBeCloseTo(0.9);
      expect(result.answerRelevance).toBeCloseTo(0.95);
      // Formula: -(0.1*0.1 + 0.1*0.3 + 0.05*0.2 + 0.95*0.4) + 1 = 0.57
      expect(result.finalScore).toBeGreaterThan(0.5);
      expect(result.finalScore).toBeLessThan(0.7);
    });

    it('should flag for review on high hallucination', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 0.8,
          factual_consistency: 0.3,
          answer_relevance: 0.5,
          harm_score: 0.2,
          reasoning: 'Likely hallucinated content',
        }),
      );

      const result = await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'Bad answer',
      });

      expect(result.requiresManualReview).toBe(true);
      expect(result.hallucinationLikelihood).toBeGreaterThan(0.5);
    });

    it('should handle model client errors gracefully', async () => {
      mockModelClient.call.mockRejectedValue(
        new Error('Model offline'),
      );

      const result = await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'Answer',
      });

      expect(result.reasoning).toContain('offline');
      expect(result.requiresManualReview).toBe(false);
    });

    it('should normalize out-of-range scores', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 1.5,
          factual_consistency: -0.5,
          answer_relevance: 0.5,
          harm_score: 0.5,
          reasoning: 'Test',
        }),
      );

      const result = await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'Answer',
      });

      expect(result.hallucinationLikelihood).toBeLessThanOrEqual(1);
      expect(result.hallucinationLikelihood).toBeGreaterThanOrEqual(0);
      expect(result.factualConsistency).toBeGreaterThanOrEqual(0);
    });

    it('should include source context in prompt', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 0.2,
          factual_consistency: 0.9,
          answer_relevance: 0.9,
          harm_score: 0.1,
          reasoning: '',
        }),
      );

      await validator.validate({
        ticketContent: 'Question',
        generatedResponse: 'Answer',
        sourceContext: 'Important context here',
      });

      const callArgs = mockModelClient.call.mock.calls[0];
      const prompt = callArgs[0][0].content;
      expect(prompt).toContain('Important context here');
    });
  });

  describe('Score Weighting', () => {
    beforeEach(() => {
      validator = new LlmValidator(mockModelClient);
    });

    it('should weight hallucination heavily negative', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 0.9,
          factual_consistency: 1.0,
          answer_relevance: 1.0,
          harm_score: 0.0,
          reasoning: 'Test',
        }),
      );

      const result = await validator.validate({
        ticketContent: 'Q',
        generatedResponse: 'A',
      });

      // High hallucination should tank final score despite perfect others
      // Formula: -(0.9*0.1 + 0*0.3 + 0*0.2 + 1.0*0.4) + 1 = -(0.09 + 0.4) + 1 = 0.51
      expect(result.finalScore).toBeLessThan(0.6);
    });

    it('should penalize low factual consistency', async () => {
      mockModelClient.call.mockResolvedValue(
        JSON.stringify({
          hallucination_likelihood: 0.1,
          factual_consistency: 0.2,
          answer_relevance: 0.9,
          harm_score: 0.0,
          reasoning: 'Test',
        }),
      );

      const result = await validator.validate({
        ticketContent: 'Q',
        generatedResponse: 'A',
      });

      expect(result.finalScore).toBeLessThan(0.7);
    });
  });
});
