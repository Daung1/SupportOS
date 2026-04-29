import { SafetyGate } from './safety-gate.service';
import { ISessionContext } from '../agents/core/execution-context.interface';

describe('SafetyGate', () => {
  let gate: SafetyGate;
  let mockContext: Partial<ISessionContext>;

  beforeEach(() => {
    gate = new SafetyGate(undefined);
    const mockState = {
      get: jest.fn((key: string) => {
        if (key === 'analyzerResult') {
          return { confidence: 0.95 };
        }
        return undefined;
      }),
    };
    mockContext = {
      metadata: { ticketId: 'test-ticket', createdAt: new Date() },
      state: mockState as any,
    };
  });

  describe('Decision Logic', () => {
    it('should review high-quality response', async () => {
      const result = await gate.evaluate(
        `Hello,

Here are the steps to reset your account:

1. Visit https://account.example.com/reset
2. Enter your email address
3. Check your email for confirmation link
4. Click the link and create a new account

Best regards`,
        mockContext as ISessionContext,
      );

      // With 0.95 confidence: heuristic ~0.82, final = 0.2 + 0.41 = 0.61 → review
      expect(result.decision).toBe('review');
      expect(result.scores.final).toBeGreaterThanOrEqual(0.6);
    });

    it('should review mid-quality response', async () => {
      const mockState = {
        get: jest.fn(() => ({ confidence: 0.5 })),
      };

      const result = await gate.evaluate(
        'You can upgrade your account. Click here to learn more about premium features.',
        { 
          metadata: { ticketId: 'test', createdAt: new Date() }, 
          state: mockState as any 
        } as ISessionContext,
      );

      expect(result.decision).toBe('review');
      expect(result.scores.final).toBeGreaterThanOrEqual(0.6);
      expect(result.scores.final).toBeLessThan(0.85);
    });

    it('should reject policy-violating response', async () => {
      const result = await gate.evaluate(
        'This involves a bomb',
        mockContext as ISessionContext,
      );

      expect(result.decision).toBe('reject');
      expect(result.scores.rule).toBe(false);
      expect(result.reasons[0]).toContain('Rule check failed');
    });

    it('should reject low-quality response', async () => {
      const mockState = {
        get: jest.fn(() => undefined),
      };

      const result = await gate.evaluate(
        'Ok',
        { 
          metadata: { ticketId: 'test', createdAt: new Date() }, 
          state: mockState as any 
        } as ISessionContext,
      );

      expect(result.decision).toBe('reject');
      expect(result.scores.final).toBeLessThan(0.6);
    });
  });

  describe('Score Computation', () => {
    it('should weight components correctly', async () => {
      const mockState = {
        get: jest.fn((key: string) => {
          if (key === 'analyzerResult') {
            return { confidence: 0.8 };
          }
          return undefined;
        }),
      };

      const result = await gate.evaluate(
        `Hello, here is detailed answer with steps:
1. First step https://docs.example.com
2. Second step https://guide.example.com
3. Third step

Best regards`,
        { 
          metadata: { ticketId: 'test', createdAt: new Date() }, 
          state: mockState as any 
        } as ISessionContext,
      );

      // Rule pass + Heuristic scoring + analyzer confidence included
      expect(result.scores.rule).toBe(true);
      expect(result.scores.final).toBeGreaterThan(0.5);
    });

    it('should clamp final score to 0-1', async () => {
      const result = await gate.evaluate(
        'a'.repeat(100),
        mockContext as ISessionContext,
      );

      expect(result.scores.final).toBeGreaterThanOrEqual(0);
      expect(result.scores.final).toBeLessThanOrEqual(1);
    });
  });

  describe('Reasoning', () => {
    it('should provide detailed breakdown', async () => {
      const result = await gate.evaluate(
        'This is a detailed explanation with information.',
        mockContext as ISessionContext,
      );

      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toBe('Rule check passed');
      expect(result.reasons.some((r) => r.includes('Heuristic'))).toBe(true);
    });

    it('should explain LLM validation trigger', async () => {
      const mockState = {
        get: jest.fn(() => ({ confidence: 0.2 })),
      };

      const result = await gate.evaluate(
        'X',
        { 
          metadata: { ticketId: 'test', createdAt: new Date() }, 
          state: mockState as any 
        } as ISessionContext,
      );

      const llmMentioned = result.reasons.some((r) =>
        r.includes('LLM'),
      );
      expect(llmMentioned).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty response', async () => {
      const result = await gate.evaluate(
        '',
        mockContext as ISessionContext,
      );

      expect(result.decision).toBeDefined();
      expect(result.scores.final).toBeDefined();
    });

    it('should handle object response with suggestion field', async () => {
      const result = await gate.evaluate(
        { suggestion: 'Here is the answer with https://link.com' },
        mockContext as ISessionContext,
      );

      expect(result.decision).toBeDefined();
      expect(result.scores.heuristic).toBeGreaterThan(0);
    });

    it('should handle null metadata', async () => {
      const result = await gate.evaluate(
        'Answer',
        { metadata: undefined, state: mockContext.state } as any,
      );

      expect(result.decision).toBeDefined();
    });

    it('should handle response with content field', async () => {
      const result = await gate.evaluate(
        { content: 'This is a detailed answer' },
        mockContext as ISessionContext,
      );

      expect(result.decision).toBeDefined();
      expect(result.scores.final).toBeGreaterThan(0);
    });

    it('should handle response with response field', async () => {
      const result = await gate.evaluate(
        { response: 'Answer text here' },
        mockContext as ISessionContext,
      );

      expect(result.decision).toBeDefined();
    });
  });
});
