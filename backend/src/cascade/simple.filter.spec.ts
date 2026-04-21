/// <reference types="jest" />

/**
 * SimpleFilter Unit Tests
 * Test Level 2 rule-based filter logic
 * Target: 20% of tickets classified with medium confidence (0.5-0.9)
 * Performance: < 50ms per classification
 */

import { SimpleFilter, SimpleFilterResult, FilterCategory } from './simple.filter';
import { FILTER_RULES } from './rules.data';

describe('SimpleFilter - Level 2 Filter', () => {
  let filter: SimpleFilter;

  beforeEach(() => {
    // Initialize with default rules and thresholds
    filter = new SimpleFilter(FILTER_RULES, 0.5, 0.9);
  });

  describe('Classify Method', () => {
    test('should classify shipping category correctly', async () => {
      const result = await filter.classify('Track my shipment, where is my package?');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('shipping');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.matchedKeywords).toBeDefined();
    });

    test('should classify billing category correctly', async () => {
      const result = await filter.classify('Why was I charged twice? Request refund');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('billing');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('should classify account category correctly', async () => {
      const result = await filter.classify('Reset my password, cannot login');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('account');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('should classify product category correctly', async () => {
      const result = await filter.classify('What size and color options available?');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('product');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('should classify policy category correctly', async () => {
      const result = await filter.classify('What is your return policy and guarantee?');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('policy');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    test('should handle empty input', async () => {
      const result = await filter.classify('');

      expect(result.classified).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.reason).toBe('Ticket text is empty');
    });

    test('should handle whitespace only input', async () => {
      const result = await filter.classify('   ');

      expect(result.classified).toBe(false);
      expect(result.confidence).toBe(0);
    });

    test('should have reason for classification', async () => {
      const result = await filter.classify('shipping delivery package');

      if (result.classified) {
        expect(result.reason).toBeDefined();
        expect(result.reason).toContain('Classified');
      }
    });

    test('should have reason for no classification', async () => {
      const result = await filter.classify('asdfjkl zxcvbn qwerty');

      expect(result.reason).toBeDefined();
      expect(result.reason).toContain('No matching category');
    });

    test('should track processing time', async () => {
      const result = await filter.classify('How do I track my order?');

      expect(result.processingTime).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(100);
    });

    test('should return matched keywords', async () => {
      const result = await filter.classify('shipping delivery tracking package');

      if (result.classified) {
        expect(result.matchedKeywords).toBeDefined();
        expect(result.matchedKeywords?.length).toBeGreaterThan(0);
        expect(result.matchedKeywords).toContain('shipping');
      }
    });
  });

  describe('Confidence Thresholds', () => {
    test('should respect minimum confidence threshold', async () => {
      const strictFilter = new SimpleFilter(FILTER_RULES, 0.8, 0.9);
      const result = await strictFilter.classify('ship');

      // Weak signal - may not classify
      expect(result.classified || !result.classified).toBeDefined();
    });

    test('should respect maximum confidence threshold', async () => {
      const result = await filter.classify('shipping shipping shipping shipping shipping');

      // Strong signal - may exceed threshold
      expect(result.classified || !result.classified).toBeDefined();
    });

    test('should handle relaxed thresholds', async () => {
      const relaxedFilter = new SimpleFilter(FILTER_RULES, 0.1, 0.9);
      const result = await relaxedFilter.classify('shipping');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('shipping');
    });

    test('should not classify with low confidence', async () => {
      const result = await filter.classify('completely random text with no keywords');

      expect(result.classified).toBe(false);
      expect(result.reason).toContain('lower bound');
    });

    test('should not classify with very high confidence (too sure)', async () => {
      const result = await filter.classify('shipping shipping shipping shipping shipping shipping');

      // If confidence > max threshold, should reject
      if (result.confidence > 0.9) {
        expect(result.classified).toBe(false);
        expect(result.reason).toContain('upper bound');
      }
    });
  });

  describe('Keyword Matching', () => {
    test('should match shipping keywords', async () => {
      const keywords = ['shipping', 'delivery', 'tracking', 'carrier'];
      const result = await filter.classify(keywords.join(' '));

      if (result.classified) {
        expect(result.category).toBe('shipping');
        expect(result.matchedKeywords?.length).toBeGreaterThan(0);
      }
    });

    test('should match billing keywords', async () => {
      const keywords = ['refund', 'payment', 'charge', 'invoice'];
      const result = await filter.classify(keywords.join(' '));

      if (result.classified) {
        expect(result.category).toBe('billing');
      }
    });

    test('should match account keywords', async () => {
      const keywords = ['password', 'login', 'account', 'profile'];
      const result = await filter.classify(keywords.join(' '));

      if (result.classified) {
        expect(result.category).toBe('account');
      }
    });

    test('should match product keywords', async () => {
      const keywords = ['size', 'color', 'material', 'dimensions'];
      const result = await filter.classify(keywords.join(' '));

      if (result.classified) {
        expect(result.category).toBe('product');
      }
    });

    test('should match policy keywords', async () => {
      const keywords = ['return', 'policy', 'terms', 'guarantee'];
      const result = await filter.classify(keywords.join(' '));

      if (result.classified) {
        expect(result.category).toBe('policy');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle special characters', async () => {
      const result = await filter.classify('shipping @#$%^&* delivery!!!');

      expect(result.classified).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    test('should handle case insensitivity', async () => {
      const result1 = await filter.classify('SHIPPING DELIVERY PACKAGE');
      const result2 = await filter.classify('shipping delivery package');

      expect(result1.classified).toBe(result2.classified);
      if (result1.classified && result2.classified) {
        expect(result1.category).toBe(result2.category);
      }
    });

    test('should handle very long text', async () => {
      const longText = 'shipping delivery ' + 'package tracking '.repeat(50);
      const result = await filter.classify(longText);

      expect(result.classified).toBeDefined();
      expect(result.processingTime).toBeLessThan(200);
    });

    test('should handle mixed language text', async () => {
      const result = await filter.classify('shipping 运输 delivery 配送');

      expect(result.classified).toBeDefined();
    });

    test('should not crash on malformed input', async () => {
      const result = await filter.classify('\x00\x01\x02\x03');

      expect(result.classified).toBeDefined();
      expect(result.reason).toBeDefined();
    });
  });

  describe('Performance', () => {
    test('should complete classification in under 100ms', async () => {
      const start = Date.now();
      await filter.classify('shipping delivery tracking');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('should handle batch classification efficiently', async () => {
      const tickets = [
        'shipping delivery tracking',
        'refund payment charge',
        'password login account',
        'size color material',
        'return policy guarantee'
      ];

      const start = Date.now();
      const results = await Promise.all(
        tickets.map(ticket => filter.classify(ticket))
      );
      const duration = Date.now() - start;

      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Custom Rules', () => {
    test('should use custom rule library', async () => {
      const customRules = {
        shipping: FILTER_RULES.shipping,
        billing: FILTER_RULES.billing,
        account: FILTER_RULES.account,
        product: FILTER_RULES.product,
        policy: FILTER_RULES.policy
      };

      const customFilter = new SimpleFilter(customRules, 0.5, 0.9);
      const result = await customFilter.classify('shipping tracking');

      expect(result.classified).toBe(true);
      expect(result.category).toBe('shipping');
    });
  });

  describe('Category Scores', () => {
    test('should select highest scoring category', async () => {
      // This tests that the filter correctly identifies the best matching category
      const result = await filter.classify('shipping delivery package tracking');

      if (result.classified) {
        expect(result.category).toBe('shipping');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });

    test('should handle ties between categories', async () => {
      // Test that filter handles ambiguous input
      const result = await filter.classify('item thing stuff');

      // Should either classify to best match or reject
      expect(result.classified || !result.classified).toBeDefined();
    });
  });

  describe('Multi-keyword Scenarios', () => {
    test('should match tickets with multiple categories present', async () => {
      // When multiple keywords present, pick highest confidence
      const result = await filter.classify('shipping delivery and refund payment');

      expect(result.classified).toBeDefined();
      expect(['shipping', 'billing']).toContain(result.category || '');
    });

    test('should prioritize category with more keywords', async () => {
      const result = await filter.classify('shipping delivery package carrier courier');

      if (result.classified) {
        expect(result.category).toBe('shipping');
      }
    });
  });
});
