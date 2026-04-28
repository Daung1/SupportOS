/**
 * TokensModule - binds the TokenTracker singleton to both ports.
 *
 * - TOKEN_RECORDER  (producer side)  - consumed by GeminiService
 * - TOKEN_TRACKER   (consumer side)  - consumed by MultiAgentOrchestrator
 *
 * Both tokens resolve to the same `TokenTracker` instance so recorded
 * usage is seen by the flushing orchestrator end-to-end.
 */

import { Module } from '@nestjs/common';
import { TokenTracker } from './token-tracker.service';
import { TOKEN_RECORDER } from './token-recorder.interface';
import { TOKEN_TRACKER } from '../agents/orchestrator/ports/orchestrator-ports';

@Module({
  providers: [
    TokenTracker,
    { provide: TOKEN_RECORDER, useExisting: TokenTracker },
    { provide: TOKEN_TRACKER, useExisting: TokenTracker },
  ],
  exports: [TokenTracker, TOKEN_RECORDER, TOKEN_TRACKER],
})
export class TokensModule {}
