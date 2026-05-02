/**
 * CascadeOrchestrator - revised three-layer ticket handling pipeline.
 *
 * Layers:
 *   L0 TriageService - LLM Flash router. Decides if the input is
 *                      in-domain, what intent it is, and offers a
 *                      category hint + optional rewrite. Out-of-domain
 *                      inputs (greetings, abuse, chitchat) short-
 *                      circuit here without touching L1/L3.
 *   L1 FAQMatcher    - vector retrieval over the FAQ corpus. Uses
 *                      the L0 reformulated text when available.
 *                      Returns top-1 match if score and margin both
 *                      pass thresholds.
 *   L3 MultiAgent    - full LLM pipeline as fallback for novel
 *                      questions L1 didn't handle.
 *
 * The legacy L2 SimpleFilter has been removed: its keyword-based
 * category classification is fully subsumed by L0's category output,
 * and the "reply with a templated category acknowledgement" UX it
 * provided was always a stopgap. With L0 we now have a real intent
 * signal, so we either answer (L1) or escalate (L3) — no third path.
 *
 * Flow:
 *   processTicket(ctx, skipLevel3?)
 *     -> L0.triage(text)
 *     -> if !inDomain or intent in {greeting, chitchat, abuse}:
 *          return canned friendly response (level 0, success=false,
 *          requiresLevel3=false). Frontend renders this directly.
 *     -> if intent in {complaint, unclear}:
 *          return clarification prompt (level 0, success=false,
 *          requiresLevel3=true so caller can offer ticket creation).
 *     -> intent=question:
 *          q := reformulated ?? raw
 *          L1.match(q, categoryHint)
 *          if matched -> return level 1 answer
 *          if skipLevel3 -> return "no quick answer" with category
 *          else -> L3.execute(ctx) -> return level 3 answer
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MultiAgentOrchestrator, MultiAgentResult } from '../agents/orchestrator/multi-agent-orchestrator.service';
import {
  ILogRepository,
  LOG_REPOSITORY,
} from '../agents/orchestrator/ports/orchestrator-ports';
import { SharedSafetyResult } from '../agents/core/shared-state';
import { ISessionContext } from '../agents/core/execution-context.interface';
import { FAQMatcher, FAQMatchResult } from './faq.matcher';
import { TriageResult, TriageService } from './triage.service';

export type CascadeSource =
  | 'Triage'
  | 'FAQMatcher'
  | 'MultiAgent'
  | 'Error';

export interface CascadeResult {
  /**
   * 0 = no answer (either OOD, or quick-answer mode escalated)
   * 1 = FAQ vector hit
   * 3 = MultiAgent full pipeline
   * (level 2 was the legacy SimpleFilter; intentionally retired.)
   */
  level: 0 | 1 | 3;
  source: CascadeSource;
  success: boolean;
  category: string;
  answer: string;
  confidence: number;
  processingTimeMs: number;
  error?: string;

  faqId?: string;
  faqMargin?: number;
  pipelineResult?: MultiAgentResult;
  safetyDecision?: SharedSafetyResult;

  /** Triage signals attached to every cascade run for downstream UI. */
  triage?: TriageResult;
  /**
   * True when L0 decided the input is out-of-domain (chitchat,
   * greeting, abuse) and we returned a friendly response without
   * trying to retrieve. The frontend uses this to render the canned
   * message verbatim instead of the FAQ/AI flow.
   */
  outOfDomain?: boolean;
  /**
   * True when the cascade decided the user should escalate to a
   * full ticket (no quick answer found, or input was too vague).
   * Distinct from outOfDomain: an OOD input never warrants a ticket.
   */
  requiresTicket?: boolean;
}

export interface CascadeOrchestratorOptions {
  /** Override FAQMatcher's absolute score threshold. */
  faqMinConfidence?: number;
}

export const CASCADE_ORCHESTRATOR_OPTIONS = Symbol(
  'CASCADE_ORCHESTRATOR_OPTIONS',
);

const FRIENDLY_OOD_MESSAGE =
  "Hi! I'm here to help with order, shipping, refund, account, or product questions. " +
  'Could you describe what you need help with?';
const CLARIFY_MESSAGE =
  'I want to make sure I help with the right thing — could you describe your issue ' +
  'in a sentence or two? For example: "my order #1234 hasn\'t arrived" or "I want to refund order #5678".';

@Injectable()
export class CascadeOrchestrator {
  private readonly logger = new Logger(CascadeOrchestrator.name);

  constructor(
    private readonly triageService: TriageService,
    private readonly faqMatcher: FAQMatcher,
    private readonly multiAgentOrchestrator: MultiAgentOrchestrator,
    @Optional() @Inject(LOG_REPOSITORY)
    private readonly logRepository?: ILogRepository,
    @Optional() @Inject(CASCADE_ORCHESTRATOR_OPTIONS)
    options?: CascadeOrchestratorOptions,
  ) {
    if (options?.faqMinConfidence !== undefined) {
      this.faqMatcher.setConfidenceThreshold(options.faqMinConfidence);
    }
  }

  // ---------------------------------------------------------------------------
  // Public entry points
  // ---------------------------------------------------------------------------

  async processTicket(
    context: ISessionContext,
    skipLevel3 = false,
  ): Promise<CascadeResult> {
    const startedAt = Date.now();
    const ticketText = context.input ?? '';
    const logCtx = this.logContextFrom(context);

    this.appendLog({ ...logCtx, type: 'cascade.start', timestamp: startedAt });

    try {
      // ------------------- Layer 0: Triage -----------------------
      const triage = await this.triageService.triage(ticketText);
      this.appendLog({
        ...logCtx,
        type: 'cascade.level0_triage',
        timestamp: Date.now(),
        payload: {
          inDomain: triage.inDomain,
          intent: triage.intent,
          category: triage.category,
          confidence: triage.confidence,
          degraded: triage.degraded ?? false,
        },
      });

      // OOD or pure social -> friendly response, do not retrieve.
      if (
        !triage.inDomain ||
        triage.intent === 'greeting' ||
        triage.intent === 'chitchat' ||
        triage.intent === 'abuse'
      ) {
        const result: CascadeResult = {
          level: 0,
          source: 'Triage',
          success: true,
          category: 'out_of_domain',
          answer: FRIENDLY_OOD_MESSAGE,
          confidence: triage.confidence,
          processingTimeMs: Date.now() - startedAt,
          triage,
          outOfDomain: true,
          requiresTicket: false,
        };
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 0, outOfDomain: true },
        });
        return result;
      }

      // Vague/complaint -> ask for clarification, but still allow
      // the user to escalate to a real ticket if they choose.
      if (triage.intent === 'complaint' || triage.intent === 'unclear') {
        const result: CascadeResult = {
          level: 0,
          source: 'Triage',
          success: true,
          category: triage.category ?? 'unclear',
          answer: CLARIFY_MESSAGE,
          confidence: triage.confidence,
          processingTimeMs: Date.now() - startedAt,
          triage,
          outOfDomain: false,
          requiresTicket: true,
        };
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 0, intent: triage.intent },
        });
        return result;
      }

      // intent === 'question': prefer the rewritten form for
      // retrieval since paraphrases embed slightly better.
      const queryForL1 = triage.reformulated ?? ticketText;

      // ------------------- Layer 1: Vector FAQMatcher --------------
      const faqResult = await this.faqMatcher.match(
        queryForL1,
        triage.category ?? undefined,
      );
      if (faqResult.matched) {
        const result = this.buildLevel1Result(faqResult, startedAt, triage);
        this.appendLog({
          ...logCtx,
          type: 'cascade.level1_hit',
          timestamp: Date.now(),
          payload: {
            faqId: faqResult.faqId,
            confidence: faqResult.confidence,
            margin: faqResult.margin,
            categoryHint: triage.category,
            processingTimeMs: faqResult.processingTime,
          },
        });
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 1, success: true },
        });
        return result;
      }
      this.appendLog({
        ...logCtx,
        type: 'cascade.level1_miss',
        timestamp: Date.now(),
        payload: {
          confidence: faqResult.confidence,
          reason: faqResult.reason,
          margin: faqResult.margin,
        },
      });

      // Quick-answer mode: don't burn LLM tokens on L3.
      if (skipLevel3) {
        this.appendLog({
          ...logCtx,
          type: 'cascade.level3_skipped',
          timestamp: Date.now(),
          payload: { reason: 'Quick answer mode - L1 below threshold' },
        });
        this.appendLog({
          ...logCtx,
          type: 'cascade.end',
          timestamp: Date.now(),
          payload: { level: 0, success: false, requiresLevel3: true },
        });
        return {
          level: 0,
          source: 'FAQMatcher',
          success: false,
          category: triage.category ?? 'requires_deep_analysis',
          answer: '',
          confidence: faqResult.confidence,
          processingTimeMs: Date.now() - startedAt,
          error: 'No quick answer found. Please generate a ticket for deep analysis.',
          triage,
          outOfDomain: false,
          requiresTicket: true,
        };
      }

      // ------------------- Layer 3: MultiAgent ---------------------
      this.appendLog({
        ...logCtx,
        type: 'cascade.level3_entry',
        timestamp: Date.now(),
      });
      const pipelineResult = await this.multiAgentOrchestrator.execute(context);
      const result = this.buildLevel3Result(pipelineResult, startedAt, triage);
      this.appendLog({
        ...logCtx,
        type: 'cascade.level3_complete',
        timestamp: Date.now(),
        payload: {
          success: pipelineResult.success,
          pipelineId: pipelineResult.pipelineId,
          safety: pipelineResult.safetyDecision?.decision,
          routes: pipelineResult.routes.map((r) => ({
            id: r.routeId,
            success: r.success,
            skipped: r.skipped,
          })),
        },
      });
      this.appendLog({
        ...logCtx,
        type: 'cascade.end',
        timestamp: Date.now(),
        payload: { level: 3, success: result.success },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cascade processing failed: ${message}`);
      this.appendLog({
        ...logCtx,
        type: 'cascade.error',
        timestamp: Date.now(),
        payload: { error: message },
      });
      return {
        level: 0,
        source: 'Error',
        success: false,
        category: 'error',
        answer: '',
        confidence: 0,
        processingTimeMs: Date.now() - startedAt,
        error: message,
      };
    }
  }

  /**
   * Convenience helper for batch processing.  Runs ticket pipelines in
   * parallel; callers that want bounded concurrency should use the
   * ConcurrentOrchestrator (A.7) instead of this method.
   */
  async processTickets(contexts: ISessionContext[]): Promise<CascadeResult[]> {
    return Promise.all(contexts.map((ctx) => this.processTicket(ctx)));
  }

  // ---------------------------------------------------------------------------
  // Layer result builders
  // ---------------------------------------------------------------------------

  private buildLevel1Result(
    faq: FAQMatchResult,
    startedAt: number,
    triage: TriageResult,
  ): CascadeResult {
    return {
      level: 1,
      source: 'FAQMatcher',
      success: true,
      category: faq.category ?? this.extractCategoryFromFaqId(faq.faqId),
      answer: faq.answer ?? '',
      confidence: faq.confidence,
      processingTimeMs: Date.now() - startedAt,
      faqId: faq.faqId,
      faqMargin: faq.margin,
      triage,
      outOfDomain: false,
      requiresTicket: false,
    };
  }

  private buildLevel3Result(
    pipeline: MultiAgentResult,
    startedAt: number,
    triage: TriageResult,
  ): CascadeResult {
    const generator = pipeline.generatorOutput as
      | {
          answer?: string;
          content?: string;
          draftContent?: string;
          suggestion?: string;
          category?: string;
          confidence?: number;
          classification?: { type?: string };
          type?: string;
        }
      | undefined;

    const answer =
      this.firstString(
        generator?.content,
        generator?.answer,
        generator?.draftContent,
        generator?.suggestion,
      ) ?? '';

    return {
      level: 3,
      source: 'MultiAgent',
      success: pipeline.success,
      category:
        generator?.category ??
        generator?.classification?.type ??
        generator?.type ??
        triage.category ??
        'general',
      answer,
      confidence: generator?.confidence ?? 0,
      processingTimeMs: Date.now() - startedAt,
      error: pipeline.error,
      pipelineResult: pipeline,
      safetyDecision: pipeline.safetyDecision,
      triage,
      outOfDomain: false,
      requiresTicket: !pipeline.success,
    };
  }

  private firstString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === 'string');
  }

  private extractCategoryFromFaqId(faqId?: string): string {
    if (!faqId) return 'unknown';
    const match = faqId.match(/^([^_]+)/);
    return match ? match[1] : 'unknown';
  }

  // ---------------------------------------------------------------------------
  // Logging helpers
  // ---------------------------------------------------------------------------

  private logContextFrom(context: ISessionContext) {
    return {
      pipelineId: 'cascade',
      sessionId: context.sessionId,
      taskId: context.taskId,
      ticketId: context.metadata?.ticketId,
    };
  }

  /**
   * Append a pipeline event to the log repository.  Errors are logged
   * and swallowed - a failing log port must not abort cascade
   * processing.  Handles both sync and async implementations.
   */
  private appendLog(event: {
    pipelineId: string;
    sessionId?: string;
    taskId?: string;
    ticketId?: string;
    type: any;
    timestamp: number;
    payload?: Record<string, any>;
  }): void {
    if (!this.logRepository) return;
    try {
      const maybe = this.logRepository.appendPipelineEvent(event);
      if (maybe && typeof (maybe as Promise<void>).then === 'function') {
        (maybe as Promise<void>).catch((err) => {
          this.logger.warn(
            `Cascade log append failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    } catch (err) {
      this.logger.warn(
        `Cascade log append threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
