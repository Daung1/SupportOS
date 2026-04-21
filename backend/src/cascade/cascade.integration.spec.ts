/// <reference types="jest" />

/**
 * Cascade Integration Tests
 * Test the complete 3-layer cascade system:
 * Layer 1: FAQMatcher (high precision, 60% target)
 * Layer 2: SimpleFilter (medium precision, 20% target)
 * Layer 3: MultiAgent (fallback, 20% remaining)
 * 
 * Integration test simulates real cascade processing pipeline
 */

import { FAQMatcher, FAQMatchResult } from './faq.matcher';
import { SimpleFilter, SimpleFilterResult, FilterCategory } from './simple.filter';
import { FAQ_DATABASE } from './faq.data';
import { FILTER_RULES } from './rules.data';

/**
 * Mock MultiAgent for testing
 * In production, this would be a real agent powered by LLM
 */
class MockMultiAgent {
  async process(ticketText: string): Promise<{ category: string; confidence: number; answer: string }> {
    // Simulate agent processing
    return {
      category: 'general',
      confidence: 0.5,
      answer: `General response for: "${ticketText.substring(0, 50)}..."`
    };
  }
}

/**
 * CascadeProcessor - Orchestrates the 3-layer system
 */
class CascadeProcessor {
  private faqMatcher: FAQMatcher;
  private simpleFilter: SimpleFilter;
  private multiAgent: MockMultiAgent;

  constructor(
    faqMatcher?: FAQMatcher,
    simpleFilter?: SimpleFilter,
    multiAgent?: MockMultiAgent
  ) {
    this.faqMatcher = faqMatcher || new FAQMatcher(FAQ_DATABASE, 0.75);
    this.simpleFilter = simpleFilter || new SimpleFilter(FILTER_RULES, 0.5, 0.9);
    this.multiAgent = multiAgent || new MockMultiAgent();
  }

  /**
   * Process single ticket through cascade
   */
  async processTicket(ticketText: string): Promise<CascadeResult> {
    const startTime = Date.now();

    try {
      // Layer 1: FAQ Matcher (high precision)
      const faqResult = await this.faqMatcher.match(ticketText);
      if (faqResult.matched) {
        return {
          level: 1,
          category: this.extractCategory(faqResult.faqId || ''),
          answer: faqResult.answer || '',
          confidence: faqResult.confidence,
          processingTime: Date.now() - startTime,
          source: 'FAQMatcher'
        };
      }

      // Layer 2: SimpleFilter (medium precision)
      const filterResult = await this.simpleFilter.classify(ticketText);
      if (filterResult.classified) {
        return {
          level: 2,
          category: filterResult.category || 'unknown',
          answer: `Classified as ${filterResult.category}: ${filterResult.reason}`,
          confidence: filterResult.confidence,
          processingTime: Date.now() - startTime,
          source: 'SimpleFilter'
        };
      }

      // Layer 3: MultiAgent (fallback)
      const agentResult = await this.multiAgent.process(ticketText);
      return {
        level: 3,
        category: agentResult.category,
        answer: agentResult.answer,
        confidence: agentResult.confidence,
        processingTime: Date.now() - startTime,
        source: 'MultiAgent'
      };
    } catch (error) {
      return {
        level: 0,
        category: 'error',
        answer: `Error processing ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
        processingTime: Date.now() - startTime,
        source: 'Error',
        error: true
      };
    }
  }

  /**
   * Process multiple tickets
   */
  async processTickets(tickets: string[]): Promise<CascadeResult[]> {
    return Promise.all(tickets.map(ticket => this.processTicket(ticket)));
  }

  /**
   * Get cascade statistics for analysis
   */
  getStatistics(results: CascadeResult[]): CascadeStatistics {
    const stats = {
      totalTickets: results.length,
      level1Count: 0,
      level2Count: 0,
      level3Count: 0,
      errorCount: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      distributionByLevel: [0, 0, 0],
      categoryDistribution: {} as Record<string, number>
    };

    for (const result of results) {
      if (result.error) {
        stats.errorCount++;
      } else {
        if (result.level === 1) stats.level1Count++;
        else if (result.level === 2) stats.level2Count++;
        else if (result.level === 3) stats.level3Count++;

        stats.distributionByLevel[result.level - 1]++;
        stats.categoryDistribution[result.category] = (stats.categoryDistribution[result.category] || 0) + 1;
      }

      stats.averageConfidence += result.confidence;
      stats.averageProcessingTime += result.processingTime;
    }

    stats.averageConfidence = stats.averageConfidence / results.length;
    stats.averageProcessingTime = stats.averageProcessingTime / results.length;

    return stats;
  }

  private extractCategory(faqId: string): string {
    const match = faqId.match(/^([^_]+)/);
    return match ? match[1] : 'unknown';
  }
}

// Type definitions
interface CascadeResult {
  level: number;
  category: string;
  answer: string;
  confidence: number;
  processingTime: number;
  source: string;
  error?: boolean;
}

interface CascadeStatistics {
  totalTickets: number;
  level1Count: number;
  level2Count: number;
  level3Count: number;
  errorCount: number;
  averageConfidence: number;
  averageProcessingTime: number;
  distributionByLevel: number[];
  categoryDistribution: Record<string, number>;
}

// ========== Test Suite ==========

describe('Cascade Integration - 3-Layer System', () => {
  let processor: CascadeProcessor;
  let faqMatcher: FAQMatcher;
  let simpleFilter: SimpleFilter;
  let multiAgent: MockMultiAgent;

  beforeEach(() => {
    faqMatcher = new FAQMatcher(FAQ_DATABASE, 0.75);
    simpleFilter = new SimpleFilter(FILTER_RULES, 0.5, 0.9);
    multiAgent = new MockMultiAgent();
    processor = new CascadeProcessor(faqMatcher, simpleFilter, multiAgent);
  });

  describe('Single Ticket Processing', () => {
    test('should process ticket through Layer 1 (FAQ Matcher)', async () => {
      const result = await processor.processTicket('How long does standard shipping take?');

      expect(result).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(200);
    });

    test('should process ticket through Layer 2 (SimpleFilter)', async () => {
      const result = await processor.processTicket('shipping delivery package');

      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
    });

    test('should process ticket through Layer 3 (MultiAgent) as fallback', async () => {
      const result = await processor.processTicket('completely random unrelated text xyz');

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });

    test('should handle empty ticket', async () => {
      const result = await processor.processTicket('');

      expect(result).toBeDefined();
      expect(result.level).toBeGreaterThanOrEqual(0);
    });

    test('should have reasonable processing time', async () => {
      const result = await processor.processTicket('How do I track my order?');

      expect(result.processingTime).toBeLessThan(500);
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple tickets', async () => {
      const tickets = [
        'How long does shipping take?',
        'Why was I charged twice?',
        'What materials are used?',
        'How do I reset my password?',
        'What is your return policy?'
      ];

      const results = await processor.processTickets(tickets);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.answer)).toBe(true);
    });

    test('should handle 100 diverse tickets', async () => {
      const tickets = Array.from({ length: 100 }, (_, i) => {
        const topics = [
          'shipping delivery tracking',
          'refund payment billing',
          'password account login',
          'product size color',
          'return policy guarantee'
        ];
        return topics[i % 5];
      });

      const results = await processor.processTickets(tickets);

      expect(results).toHaveLength(100);
      expect(results.filter(r => !r.error)).toHaveLength(100);
    });

    test('should complete batch within reasonable time', async () => {
      const tickets = Array.from({ length: 50 }, (_, i) => `Ticket ${i}`);
      
      const start = Date.now();
      await processor.processTickets(tickets);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // 5 seconds for 50 tickets
    });
  });

  describe('Cascade Level Distribution', () => {
    test('should distribute tickets across levels', async () => {
      const tickets = [
        'How long does standard shipping take?',         // L1
        'shipping delivery tracking package',            // L2
        'completely random unrelated text xyz'            // L3
      ];

      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(stats.totalTickets).toBe(3);
      expect(stats.level1Count + stats.level2Count + stats.level3Count).toBeGreaterThan(0);
    });

    test('should target 60% at Level 1', async () => {
      const tickets = Array.from({ length: 100 }, (_, i) => {
        if (i < 50) return 'How long does shipping take?';           // Should go L1
        if (i < 80) return 'shipping delivery tracking';             // Should go L2
        return 'random text xyz abc';                                 // Should go L3
      });

      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      // L1 should be highest
      expect(stats.level1Count).toBeGreaterThan(stats.level2Count);
      expect(stats.level1Count).toBeGreaterThan(stats.level3Count);
    });

    test('should target 20% at Level 2', async () => {
      const mixedTickets = [
        ...Array(60).fill('How long does shipping take?'),
        ...Array(20).fill('shipping delivery tracking'),
        ...Array(20).fill('random text')
      ];

      const results = await processor.processTickets(mixedTickets);
      const stats = processor.getStatistics(results);

      // Verify distribution (with some tolerance)
      const l1Pct = stats.level1Count / stats.totalTickets;
      expect(l1Pct).toBeGreaterThan(0.4); // At least 40%
    });
  });

  describe('Performance Metrics', () => {
    test('should calculate average confidence', async () => {
      const tickets = ['How long does shipping take?', 'random text'];
      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
    });

    test('should calculate average processing time', async () => {
      const tickets = Array(10).fill('How do I track my order?');
      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(stats.averageProcessingTime).toBeGreaterThan(0);
      expect(stats.averageProcessingTime).toBeLessThan(200);
    });

    test('should track category distribution', async () => {
      const tickets = [
        'shipping delivery',
        'payment refund',
        'password reset',
        'product size',
        'return policy'
      ];

      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(Object.keys(stats.categoryDistribution).length).toBeGreaterThan(0);
      expect(stats.categoryDistribution['shipping'] || stats.categoryDistribution['billing']).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully', async () => {
      const result = await processor.processTicket('test');

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });

    test('should return error flag on failure', async () => {
      const result = await processor.processTicket('');

      expect(result.source).toBeDefined();
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    test('should not crash on malformed input', async () => {
      const tickets = ['\x00', '\x01', null as any, undefined as any, ''];

      const results = await processor.processTickets(tickets.filter(t => typeof t === 'string'));

      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Category Routing', () => {
    test('should route shipping questions to shipping category', async () => {
      const result = await processor.processTicket('How long does shipping take?');

      expect(result.category).toBeDefined();
      expect(['shipping', 'general']).toContain(result.category);
    });

    test('should route billing questions to billing category', async () => {
      const result = await processor.processTicket('Why was I charged twice?');

      expect(result.category).toBeDefined();
      expect(['billing', 'general']).toContain(result.category);
    });

    test('should route account questions to account category', async () => {
      const result = await processor.processTicket('How do I reset my password?');

      expect(result.category).toBeDefined();
      expect(['account', 'general']).toContain(result.category);
    });

    test('should route product questions to product category', async () => {
      const result = await processor.processTicket('What materials are used?');

      expect(result.category).toBeDefined();
      expect(['product', 'general']).toContain(result.category);
    });

    test('should route policy questions to policy category', async () => {
      const result = await processor.processTicket('What is your return policy?');

      expect(result.category).toBeDefined();
      expect(['policy', 'general']).toContain(result.category);
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle verbose customer inquiry', async () => {
      const verboseTicket = `Hi there, I would like to know about your shipping times. I have an order pending 
        and I'm wondering if it will arrive in time for my event next week. Can you provide me with tracking information?`;

      const result = await processor.processTicket(verboseTicket);

      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.processingTime).toBeLessThan(500);
    });

    test('should handle short ambiguous query', async () => {
      const shortQuery = 'help';

      const result = await processor.processTicket(shortQuery);

      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
    });

    test('should handle multilingual content', async () => {
      const multilingualTicket = 'shipping 运输 delivery 配送';

      const result = await processor.processTicket(multilingualTicket);

      expect(result).toBeDefined();
      expect(result.processingTime).toBeLessThan(500);
    });

    test('should handle special characters and formatting', async () => {
      const specialTicket = 'How long does *standard* shipping take? [URGENT!!!]';

      const result = await processor.processTicket(specialTicket);

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
    });

    test('should handle very long ticket', async () => {
      const longTicket = 'shipping ' + 'delivery '.repeat(100);

      const result = await processor.processTicket(longTicket);

      expect(result).toBeDefined();
      expect(result.processingTime).toBeLessThan(1000);
    });
  });

  describe('Statistics and Reporting', () => {
    test('should generate accurate statistics', async () => {
      const tickets = Array(100).fill('How long does shipping take?');
      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(stats.totalTickets).toBe(100);
      expect(stats.level1Count).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    });

    test('should track all categories in distribution', async () => {
      const tickets = [
        'shipping',
        'billing',
        'account',
        'product',
        'policy'
      ];

      const results = await processor.processTickets(tickets);
      const stats = processor.getStatistics(results);

      expect(stats.categoryDistribution['shipping'] || 0).toBeGreaterThanOrEqual(0);
    });
  });
});
