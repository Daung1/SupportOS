import { HeuristicScorer } from './heuristic.scorer';

describe('HeuristicScorer', () => {
  let scorer: HeuristicScorer;

  beforeEach(() => {
    scorer = new HeuristicScorer();
  });

  describe('Length Scoring', () => {
    it('should penalize very short content', () => {
      const result = scorer.score({ content: 'Hi' });
      expect(result.lengthScore).toBe(0);
    });

    it('should score optimal length highly', () => {
      const content = 'a'.repeat(500);
      const result = scorer.score({ content });
      expect(result.lengthScore).toBe(1.0);
    });

    it('should penalize very long content', () => {
      const content = 'a'.repeat(10000);
      const result = scorer.score({ content });
      expect(result.lengthScore).toBeLessThan(0.8);
    });
  });

  describe('Structure Scoring', () => {
    it('should credit greeting patterns', () => {
      const result1 = scorer.score({
        content: 'Hello, here is the answer...',
      });
      const result2 = scorer.score({ content: 'Here is the answer...' });
      expect(result1.structureScore).toBeGreaterThan(result2.structureScore);
    });

    it('should credit closing statements', () => {
      const result1 = scorer.score({
        content: 'Answer to your question. Best regards',
      });
      const result2 = scorer.score({
        content: 'Answer to your question',
      });
      expect(result1.structureScore).toBeGreaterThan(result2.structureScore);
    });

    it('should credit lists and sections', () => {
      const withStructure = 'Answer:\n1. First step\n2. Second step';
      const withoutStructure = 'First step. Second step.';
      const result1 = scorer.score({ content: withStructure });
      const result2 = scorer.score({ content: withoutStructure });
      expect(result1.structureScore).toBeGreaterThan(result2.structureScore);
    });
  });

  describe('Specificity Scoring', () => {
    it('should credit URLs', () => {
      const result1 = scorer.score({
        content: 'Visit https://docs.example.com for details',
      });
      const result2 = scorer.score({
        content: 'Visit the documentation for details',
      });
      expect(result1.specificityScore).toBeGreaterThan(result2.specificityScore);
    });

    it('should credit multiple numbers', () => {
      const result1 = scorer.score({
        content: 'Complete steps 1, 2, 3 to achieve 100% success',
      });
      const result2 = scorer.score({
        content: 'Complete the steps to achieve success',
      });
      expect(result1.specificityScore).toBeGreaterThan(result2.specificityScore);
    });

    it('should credit code blocks', () => {
      const result1 = scorer.score({
        content: 'Use this code: `const x = 42;`',
      });
      const result2 = scorer.score({ content: 'Use this value: 42' });
      expect(result1.specificityScore).toBeGreaterThan(result2.specificityScore);
    });
  });

  describe('Source Attribution Scoring', () => {
    it('should penalize no search results', () => {
      const result = scorer.score({
        content: 'Some answer',
        hasSearchResults: false,
      });
      expect(result.sourceScore).toBeLessThan(0.5);
    });

    it('should credit search results', () => {
      const result = scorer.score({
        content: 'Some answer',
        hasSearchResults: true,
        searchResultCount: 3,
      });
      expect(result.sourceScore).toBe(1.0);
    });

    it('should differentiate by result count', () => {
      const result1 = scorer.score({
        content: 'Answer',
        hasSearchResults: true,
        searchResultCount: 1,
      });
      const result2 = scorer.score({
        content: 'Answer',
        hasSearchResults: true,
        searchResultCount: 3,
      });
      expect(result2.sourceScore).toBeGreaterThan(result1.sourceScore);
    });
  });

  describe('Confidence Scoring', () => {
    it('should use analyzer confidence', () => {
      const result1 = scorer.score({
        content: 'Answer',
        analyzerConfidence: 0.9,
      });
      const result2 = scorer.score({
        content: 'Answer',
        analyzerConfidence: 0.3,
      });
      expect(result1.confidenceScore).toBeGreaterThan(result2.confidenceScore);
    });

    it('should default to 0.5 when undefined', () => {
      const result = scorer.score({ content: 'Answer' });
      expect(result.confidenceScore).toBe(0.5);
    });
  });

  describe('Total Score', () => {
    it('should normalize between 0 and 1', () => {
      const result = scorer.score({
        content: 'a'.repeat(10000),
        analyzerConfidence: 2.0, // invalid
      });
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(1);
    });

    it('should average all dimensions', () => {
      const result = scorer.score({
        content: 'Hello, here is answer with link https://example.com and steps 1, 2, 3. Regards',
        analyzerConfidence: 0.8,
        hasSearchResults: true,
        searchResultCount: 2,
      });
      expect(result.totalScore).toBeGreaterThan(0.7);
    });
  });
});
