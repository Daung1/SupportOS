/**
 * Agents Module
 * NestJS module that provides agent framework exports and configuration
 */

import { Module } from '@nestjs/common';
import { GeminiModule } from '../gemini/gemini.module';
import { ToolsModule } from '../tools/tools.module';
import { AnalyzerAgent } from './impl/analyzer.agent';
import { SearcherAgent } from './impl/searcher.agent';
import { SingleAgentOrchestrator } from './base/single-agent-orchestrator.service';

/**
 * AgentsModule
 * Main module for agent framework
 *
 * This module aggregates all agent-related functionality including:
 * - Core types and interfaces
 * - BaseAgent abstract class
 * - Concrete agent implementations (AnalyzerAgent)
 * - Orchestration services
 *
 * Usage:
 * @Module({
 *   imports: [AgentsModule],
 * })
 * export class AppModule {}
 */
@Module({
  imports: [GeminiModule, ToolsModule],
  providers: [AnalyzerAgent, SearcherAgent, SingleAgentOrchestrator],
  exports: [AnalyzerAgent, SearcherAgent, SingleAgentOrchestrator],
})
export class AgentsModule {}
