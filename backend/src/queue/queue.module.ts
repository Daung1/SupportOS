/**
 * QueueModule - wires ConcurrentOrchestrator on top of the cascade.
 *
 * Depends on:
 *   - CascadeModule (for CascadeOrchestrator)
 *   - GeminiModule  (for the model client referenced by the built context)
 *   - ToolsModule   (for ToolRegistry + tool singletons)
 *
 * LogRepository (A.8) and CONCURRENT_ORCHESTRATOR_OPTIONS are both
 * optional; the orchestrator wires them via @Optional() so this module
 * does not need to know about them.
 */

import { Module } from '@nestjs/common';
import { CascadeModule } from '../cascade/cascade.module';
import { GeminiModule } from '../gemini/gemini.module';
import { ToolsModule } from '../tools/tools.module';
import { ConcurrentOrchestrator } from './concurrent-orchestrator.service';
import { SessionContextFactory } from './session-context.factory';

@Module({
  imports: [CascadeModule, GeminiModule, ToolsModule],
  providers: [SessionContextFactory, ConcurrentOrchestrator],
  exports: [SessionContextFactory, ConcurrentOrchestrator],
})
export class QueueModule {}
