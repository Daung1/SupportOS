/**
 * Tools Module
 * NestJS module that provides all tools for agents
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GeminiModule } from '../gemini/gemini.module';
import { ToolRegistry } from './tool-registry.service';
import { TextAnalyzerTool } from './text-analyzer.tool';
import { SearchTool } from './search.tool';
import { DocumentEmbeddingService } from './document-embedding.service';

@Module({
  imports: [DatabaseModule, GeminiModule],
  providers: [
    ToolRegistry,
    TextAnalyzerTool,
    SearchTool,
    DocumentEmbeddingService,
  ],
  exports: [
    ToolRegistry,
    TextAnalyzerTool,
    SearchTool,
    DocumentEmbeddingService,
  ],
})
export class ToolsModule {}
