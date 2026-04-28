import {
  aggregateCostUsd,
  calculateCostUsd,
  getModelPricing,
  PRICING_TABLE,
} from './cost.calculator';

describe('cost.calculator', () => {
  describe('getModelPricing', () => {
    it('returns a pricing entry for known models', () => {
      expect(getModelPricing('gemini-2.5-flash-lite')).toEqual(
        PRICING_TABLE['gemini-2.5-flash-lite'],
      );
    });

    it('is case-insensitive', () => {
      expect(getModelPricing('Gemini-2.5-Flash-Lite')).toEqual(
        PRICING_TABLE['gemini-2.5-flash-lite'],
      );
    });

    it('returns undefined for unknown models', () => {
      expect(getModelPricing('my-made-up-model')).toBeUndefined();
    });

    it('returns undefined for empty input', () => {
      expect(getModelPricing('')).toBeUndefined();
    });
  });

  describe('calculateCostUsd', () => {
    it('prices a simple Flash-Lite call correctly', () => {
      // 1M input tokens @ $0.10 + 1M output @ $0.40 = $0.50
      expect(
        calculateCostUsd('gemini-2.5-flash-lite', 1_000_000, 1_000_000),
      ).toBeCloseTo(0.5, 6);
    });

    it('prices fractional token counts accurately', () => {
      // 100k input @ $0.10/M = $0.01; 50k output @ $0.40/M = $0.02; total $0.03
      expect(
        calculateCostUsd('gemini-2.5-flash-lite', 100_000, 50_000),
      ).toBeCloseTo(0.03, 6);
    });

    it('returns 0 for unknown models (safe default)', () => {
      expect(calculateCostUsd('unknown-model', 1000, 1000)).toBe(0);
    });

    it('clamps negative counts to 0', () => {
      expect(calculateCostUsd('gemini-2.5-flash-lite', -50, -50)).toBe(0);
    });

    it('floors fractional counts', () => {
      // 999 (floored) tokens -> essentially nothing
      const cost = calculateCostUsd('gemini-2.5-flash-lite', 999.9, 0);
      expect(cost).toBeGreaterThanOrEqual(0);
      expect(cost).toBeLessThan(0.001);
    });
  });

  describe('aggregateCostUsd', () => {
    it('sums rows across multiple models', () => {
      const rows = [
        { model: 'gemini-2.5-flash-lite', inputTokens: 100_000, outputTokens: 50_000 }, // $0.03
        { model: 'gemini-2.5-flash', inputTokens: 100_000, outputTokens: 50_000 },      // 0.1*0.3 + 0.05*2.5 = 0.03 + 0.125 = 0.155
      ];
      expect(aggregateCostUsd(rows)).toBeCloseTo(0.185, 6);
    });

    it('returns 0 for empty rows', () => {
      expect(aggregateCostUsd([])).toBe(0);
    });

    it('ignores unknown models without failing', () => {
      const rows = [
        { model: 'unknown', inputTokens: 99_999, outputTokens: 99_999 },
        { model: 'gemini-2.5-flash-lite', inputTokens: 100_000, outputTokens: 50_000 },
      ];
      expect(aggregateCostUsd(rows)).toBeCloseTo(0.03, 6);
    });
  });
});
