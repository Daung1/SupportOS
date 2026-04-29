import { Test, TestingModule } from '@nestjs/testing';
import {
  ConcurrentOrchestrator,
  ConcurrentTaskResult,
} from '../queue/concurrent-orchestrator.service';
import { TicketRepository } from './ticket.repository';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  let service: TicketService;
  let repository: jest.Mocked<Pick<
    TicketRepository,
    | 'create'
    | 'findPaged'
    | 'countFiltered'
    | 'findByIdWithRelations'
    | 'findById'
    | 'findLogs'
    | 'findTokenUsages'
    | 'appendTokenAggregate'
    | 'updateOutcome'
  >>;
  let orchestrator: { submit: jest.Mock };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findPaged: jest.fn(),
      countFiltered: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findById: jest.fn(),
      findLogs: jest.fn(),
      findTokenUsages: jest.fn(),
      appendTokenAggregate: jest.fn(),
      updateOutcome: jest.fn(),
    };

    orchestrator = { submit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TicketRepository, useValue: repository },
        {
          provide: ConcurrentOrchestrator,
          useValue: orchestrator,
        },
      ],
    }).compile();

    service = module.get(TicketService);
  });

  it('create persists and dispatches orchestrator.submit', async () => {
    repository.create!.mockResolvedValue({
      id: 'tix_1',
      content: 'hello',
      status: 'processing',
      priority: 'medium',
      analysis: null,
      suggestion: null,
      confidence: null,
      hallucination: null,
      requiresReview: false,
      approvalStatus: null,
      edits: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orchestrator.submit.mockResolvedValue({
      ticketId: 'tix_1',
      sessionId: 'sid',
      taskId: 'tid',
      success: true,
      durationMs: 1,
      queueWaitMs: 0,
      retriesUsed: 0,
      dlq: false,
      cascadeResult: {
        level: 1,
        source: 'FAQMatcher',
        success: true,
        category: 'auth',
        answer: 'FAQ answer',
        confidence: 1,
        processingTimeMs: 5,
      },
    } satisfies ConcurrentTaskResult);

    await service.create({
      content: 'hello',
      priority: 'medium',
    });

    expect(repository.create).toHaveBeenCalledWith({
      content: 'hello',
      priority: 'medium',
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(orchestrator.submit).toHaveBeenCalledWith({
      id: 'tix_1',
      content: 'hello',
      priority: 'medium',
    });

    expect(repository.updateOutcome).toHaveBeenCalledWith(
      'tix_1',
      expect.objectContaining({
        status: 'completed',
        suggestion: 'FAQ answer',
      }),
    );
  });

  it('list returns pagination meta', async () => {
    repository.findPaged!.mockResolvedValue([]);
    repository.countFiltered!.mockResolvedValue(0);

    const res = await service.list(2, 10, undefined);

    expect(repository.findPaged).toHaveBeenCalledWith({
      skip: 10,
      take: 10,
      status: undefined,
    });
    expect(res.meta.page).toBe(2);
    expect(res.meta.total).toBe(0);
  });
});
