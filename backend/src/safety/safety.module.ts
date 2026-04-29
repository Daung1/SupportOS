import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { SafetyGate } from './safety-gate.service';
import { SAFETY_GATE } from '../agents/orchestrator/ports/orchestrator-ports';

/**
 * Safety Module - provides content safety evaluation.
 * 
 * Exports SafetyGate for use by MultiAgentOrchestrator.
 * Optionally depends on GeminiModule for LLM-based validation.
 */
@Module({
  imports: [GeminiModule],
  providers: [
    SafetyGate,
    {
      provide: SAFETY_GATE,
      useExisting: SafetyGate,
    },
  ],
  exports: [SafetyGate, SAFETY_GATE],
})
export class SafetyModule {}
