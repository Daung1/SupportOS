/**
 * AnalyzerAgent Integration Test
 * Tests the complete TAO Loop execution with Gemini API
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SingleAgentOrchestrator } from '../src/agents/base/single-agent-orchestrator.service';
import { AnalyzerAgent } from '../src/agents/impl/analyzer.agent';
import { GeminiService } from '../src/gemini/gemini.service';
import { ToolRegistry } from '../src/tools/tool-registry.service';
import { TextAnalyzerTool } from '../src/tools/text-analyzer.tool';

describe('AnalyzerAgent Integration (e2e)', () => {
  let orchestrator: SingleAgentOrchestrator;
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env',
          isGlobal: true,
        }),
      ],
      providers: [
        GeminiService,
        ToolRegistry,
        TextAnalyzerTool,
        AnalyzerAgent,
        SingleAgentOrchestrator,
      ],
    }).compile();

    orchestrator = app.get<SingleAgentOrchestrator>(SingleAgentOrchestrator);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TAO Loop Execution', () => {
    it('should analyze a shipping ticket', async () => {
      const ticketContent =
        'My order #12345 has not arrived yet, it has been 5 days since I ordered it.';

      const result = await orchestrator.executeAnalyzer(
        ticketContent,
        'session_001',
        'ticket_001',
      );

      // Verify basic result structure
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);

      // Verify analysis output
      const analysis = result.output;
      expect(analysis.category).toBe('shipping');
      expect(analysis.priority).toBe('high');
      expect(Array.isArray(analysis.keywords)).toBe(true);
      expect(['positive', 'neutral', 'negative']).toContain(analysis.sentiment);

      // Verify token usage
      expect(result.tokensUsed).toBeDefined();
      expect(result.tokensUsed.inputTokens).toBeGreaterThan(0);
      expect(result.tokensUsed.outputTokens).toBeGreaterThan(0);
    });

    it('should record complete TAO Loop history', async () => {
      const ticketContent = 'System error occurred during checkout.';

      const result = await orchestrator.executeAnalyzer(
        ticketContent,
        'session_002',
        'ticket_002',
      );

      // Verify history is recorded
      expect(result.history).toBeDefined();
      expect(Array.isArray(result.history)).toBe(true);
      expect(result.history.length).toBeGreaterThan(0);

      // Verify each iteration has complete TAO data
      for (const iteration of result.history) {
        expect(iteration.iteration).toBeDefined();
        expect(iteration.thought).toBeDefined();
        expect(iteration.action).toBeDefined();
        expect(iteration.observation).toBeDefined();
        expect(iteration.timestamp).toBeDefined();

        // Verify action structure
        expect(['FINISH', 'CALL_TOOL']).toContain(iteration.action.type);

        // Verify observation structure
        expect(typeof iteration.observation.success).toBe('boolean');
      }
    });

    it('should handle multiple iterations in TAO Loop', async () => {
      const ticketContent =
        'I need help with my billing issue and account settings.';

      const result = await orchestrator.executeAnalyzer(ticketContent);

      // The agent might do multiple iterations before FINISH
      expect(result.iterations).toBeGreaterThanOrEqual(1);
      expect(result.iterations).toBeLessThanOrEqual(10); // Max iterations limit
    });
  });

  describe('Text Analyzer Tool', () => {
    it('should correctly analyze different ticket types', async () => {
      const testCases = [
        {
          content: 'My payment failed on my credit card',
          expectedCategory: 'billing',
        },
        {
          content: 'Cannot login to my account',
          expectedCategory: 'account',
        },
        {
          content: 'App keeps crashing when I click submit',
          expectedCategory: 'technical',
        },
      ];

      for (const testCase of testCases) {
        const result = await orchestrator.executeAnalyzer(testCase.content);
        expect(result.output.category).toBe(testCase.expectedCategory);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty input gracefully', async () => {
      const result = await orchestrator.executeAnalyzer('');

      expect(result).toBeDefined();
      // Should return a result even for empty input
      expect(result.success).toBeDefined();
    });

    it('should handle very long input', async () => {
      const longContent = 'A'.repeat(5000);

      const result = await orchestrator.executeAnalyzer(longContent);

      expect(result).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
    });
  });

  describe('Gemini API Integration', () => {
    it('should use Gemini API for LLM calls', async () => {
      const result = await orchestrator.executeAnalyzer(
        'Test ticket content',
      );

      // Verify token usage comes from Gemini
      expect(result.tokensUsed).toBeDefined();
      expect(result.tokensUsed.inputTokens).toBeGreaterThan(0);
      expect(result.tokensUsed.outputTokens).toBeGreaterThan(0);
    });
  });
});
