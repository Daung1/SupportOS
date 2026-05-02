/**
 * Cascade module - NestJS module definition.
 *
 * Wires the L0 (TriageService) -> L1 (FAQMatcher, vector) -> L3
 * (MultiAgent) pipeline. The legacy L2 SimpleFilter has been removed
 * because L0 now produces a richer category signal directly from
 * the LLM router.
 *
 * FAQEmbeddingService is a `@Injectable()` with an `onModuleInit`
 * lifecycle hook - it batch-embeds the FAQ corpus on app boot and
 * keeps the vectors in memory. It is provided here (rather than via
 * a useFactory) so Nest manages its lifecycle and DI dependencies
 * (PrismaService, GeminiService) cleanly.
 */

import { Module, forwardRef } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { DatabaseModule } from '../database/database.module';
import { GeminiModule } from '../gemini/gemini.module';
import { CascadeOrchestrator } from './cascade-orchestrator.service';
import { FAQEmbeddingService } from './faq-embedding.service';
import { FAQMatcher } from './faq.matcher';
import { TriageService } from './triage.service';

const providers = [
  FAQEmbeddingService,
  FAQMatcher,
  TriageService,
  CascadeOrchestrator,
];

@Module({
  imports: [
    DatabaseModule,
    GeminiModule,
    forwardRef(() => AgentsModule),
  ],
  providers: [...providers],
  exports: [...providers],
})
export class CascadeModule {}
