/**
 * Generator Support Module
 *
 * Provides the helper services that back GeneratorAgent's four scenarios:
 *   - EditableContentManager    (scenario B: version history for editable drafts)
 *   - TechAssignmentManager     (scenario C: bug reports + customer emails)
 *   - AIOptimizationService     (scenario B: Chat-with-AI optimization)
 *
 * AIOptimizationService depends on an IModelClient - we bind the token
 * 'IModelClient' to the existing GeminiService provider so no extra
 * adapter is needed.
 */

import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { GeminiService } from '../gemini/gemini.service';
import { EditableContentManager } from './editable-content.manager';
import { TechAssignmentManager } from './tech-assignment.manager';
import {
  AIOptimizationService,
  MODEL_CLIENT_TOKEN,
} from './ai-optimization.service';

@Module({
  imports: [GeminiModule],
  providers: [
    EditableContentManager,
    TechAssignmentManager,
    {
      provide: MODEL_CLIENT_TOKEN,
      useExisting: GeminiService,
    },
    AIOptimizationService,
  ],
  exports: [
    EditableContentManager,
    TechAssignmentManager,
    AIOptimizationService,
  ],
})
export class GeneratorSupportModule {}
