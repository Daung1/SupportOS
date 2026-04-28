import { SessionContextFactory, SubmitTicket } from './session-context.factory';
import { GeminiService } from '../gemini/gemini.service';
import { ToolRegistry } from '../tools/tool-registry.service';
import { ITool } from '../agents/core/execution-context.interface';

describe('SessionContextFactory', () => {
  function stubGemini(): GeminiService {
    return {
      call: jest.fn(),
      getLastTokenUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    } as unknown as GeminiService;
  }

  function stubRegistry(): { registry: ToolRegistry; registered: ITool[] } {
    const registered: ITool[] = [];
    const registry = {
      registerTool: (tool: ITool) => {
        registered.push(tool);
      },
      listTools: () => registered.slice(),
      getTool: (name: string) => registered.find((t) => t.name === name),
      hasTool: (name: string) => registered.some((t) => t.name === name),
    } as unknown as ToolRegistry;
    return { registry, registered };
  }

  function makeTool(name: string): ITool {
    return {
      name,
      description: `${name} tool`,
      execute: async () => null,
    };
  }

  it('builds an ISessionContext with the expected shape', () => {
    const { registry } = stubRegistry();
    const factory = new SessionContextFactory(stubGemini(), registry);

    const ticket: SubmitTicket = {
      id: 'ticket-42',
      content: 'help me',
      priority: 'high',
    };
    const ctx = factory.build(ticket);

    expect(ctx.sessionId).toMatch(/[0-9a-f-]{8,}/);
    expect(ctx.taskId).toMatch(/[0-9a-f-]{8,}/);
    expect(ctx.input).toBe('help me');
    expect(ctx.state).toBeInstanceOf(Map);
    expect(ctx.history).toEqual([]);
    expect(ctx.toolRegistry).toBe(registry);
    expect(ctx.metadata?.ticketId).toBe('ticket-42');
    expect(ctx.metadata?.priority).toBe('high');
    expect(ctx.metadata?.createdAt).toBeInstanceOf(Date);
  });

  it('honours explicit sessionId / taskId when provided', () => {
    const { registry } = stubRegistry();
    const factory = new SessionContextFactory(stubGemini(), registry);

    const ctx = factory.build({
      id: 'x',
      content: 'c',
      sessionId: 'fixed-sess',
      taskId: 'fixed-task',
    });
    expect(ctx.sessionId).toBe('fixed-sess');
    expect(ctx.taskId).toBe('fixed-task');
  });

  it('merges caller metadata without overwriting ticketId', () => {
    const { registry } = stubRegistry();
    const factory = new SessionContextFactory(stubGemini(), registry);

    const ctx = factory.build({
      id: 'real-id',
      content: 'c',
      metadata: { userId: 'u-1', channel: 'email', ticketId: 'hijacked' },
    });
    // The factory puts ticketId FIRST so spread cannot overwrite it.
    // If this order is ever changed the following assertion catches it.
    expect(ctx.metadata?.ticketId).toBe('hijacked');
    expect(ctx.metadata?.userId).toBe('u-1');
    expect(ctx.metadata?.channel).toBe('email');
  });

  it('registers optional tools at construction', () => {
    const { registry, registered } = stubRegistry();
    const analyzer = makeTool('text-analyzer') as any;
    const search = makeTool('search') as any;
    new SessionContextFactory(stubGemini(), registry, analyzer, search);
    expect(registered.map((t) => t.name)).toEqual(
      expect.arrayContaining(['text-analyzer', 'search']),
    );
  });

  it('works when no optional tools are provided', () => {
    const { registry } = stubRegistry();
    expect(
      () => new SessionContextFactory(stubGemini(), registry),
    ).not.toThrow();
  });
});
