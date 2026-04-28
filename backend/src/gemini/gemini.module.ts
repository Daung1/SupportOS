/**
 * Gemini Module
 * NestJS module that provides Gemini LLM service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [ConfigModule, TokensModule],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
