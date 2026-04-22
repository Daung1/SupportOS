/**
 * Agents Module
 * NestJS module that provides agent framework exports and configuration
 */

import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { ToolsModule } from '../tools/tools.module';
import { ClassifierModule } from '../classifier/classifier.module';
import { GeneratorSupportModule } from '../generator/generator.module';
import { CascadeModule } from '../cascade/cascade.module';
import { AnalyzerAgent } from './impl/analyzer.agent';
import { SearcherAgent } from './impl/searcher.agent';
import { GeneratorAgent } from './impl/generator.agent';
import { SingleAgentOrchestrator } from './base/single-agent-orchestrator.service';

/**
 * AgentsModule
 * Main module for agent framework
 *
 * This module aggregates all agent-related functionality including:
 * - Core types and interfaces
 * - BaseAgent abstract class
 * - Concrete agent implementations (Analyzer / Searcher / Generator)
 * - Classifier + Generator support services
 * - Orchestration services
 */
@Module({
  imports: [
    GeminiModule,
    ToolsModule,
    ClassifierModule,
    GeneratorSupportModule,
    CascadeModule,
  ],
  providers: [
    AnalyzerAgent,
    SearcherAgent,
    GeneratorAgent,
    SingleAgentOrchestrator,
  ],
  exports: [
    AnalyzerAgent,
    SearcherAgent,
    GeneratorAgent,
    SingleAgentOrchestrator,
  ],
})
export class AgentsModule {}
