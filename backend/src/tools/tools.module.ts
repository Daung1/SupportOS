/**
 * Tools Module
 * NestJS module that provides all tools for agents
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ToolRegistry } from './tool-registry.service';
import { TextAnalyzerTool } from './text-analyzer.tool';
import { SearchTool } from './search.tool';

@Module({
  imports: [DatabaseModule],
  providers: [ToolRegistry, TextAnalyzerTool, SearchTool],
  exports: [ToolRegistry, TextAnalyzerTool, SearchTool],
})
export class ToolsModule {}
