import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { SingleAgentOrchestrator } from './agents/base/single-agent-orchestrator.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly orchestrator: SingleAgentOrchestrator,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // NOTE: GET /api/health is owned by HealthController (A.8) and
  // returns a richer payload (queue stats, latency, error rate).
  // The legacy stub previously here was removed to avoid two
  // controllers fighting for the same path.

  /**
   * Test endpoint for AnalyzerAgent
   * POST /analyze
   * Body: { content: string }
   * Returns: Analysis result with TAO Loop history
   */
  @Post('analyze')
  async analyzeTicket(
    @Body() dto: { content: string; ticketId?: string },
  ): Promise<any> {
    try {
      const result = await this.orchestrator.executeAnalyzer(
        dto.content,
        undefined,
        dto.ticketId,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test endpoint for SearcherAgent
   * POST /search
   * Body: { query: string; ticketId?: string }
   * Returns: Search result with document list and TAO Loop history
   */
  @Post('search')
  async searchDocuments(
    @Body() dto: { query: string; ticketId?: string },
  ): Promise<any> {
    try {
      const result = await this.orchestrator.executeSearcher(
        dto.query,
        undefined,
        dto.ticketId,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
