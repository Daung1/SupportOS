/**
 * Generator Agent Implementation
 *
 * Intelligent response generator with four-scenario handling based on the
 * classification result produced by ProblemClassifier + FAQMatcher:
 *
 *   Scenario A (FAQ)          -> direct answer ready to send to the customer
 *   Scenario B (DOC_ANSWER)   -> editable draft reply + searched document sources,
 *                                supports editing + "Chat with AI" optimization
 *   Scenario C (TECH_ISSUE)   -> bug report for Tech Department + auto customer email
 *   Scenario D (OTHER)        -> suggested reply + actionable next-steps for support staff
 *
 * Extends BaseAgent and follows the TAO (Thought-Action-Observation) Loop.
 *
 * Design notes:
 * - Classification is deterministic (rule-based via ProblemClassifier and FAQMatcher)
 *   so the "THOUGHT" step does not require an LLM call.  This keeps Generator
 *   cheap and predictable for scenarios A and C.
 * - The LLM is only invoked when we actually need to produce natural language
 *   (scenario B draft content, scenario D suggestion).  This keeps token costs low.
 * - All outputs share a common envelope (GeneratorAgentOutput) that the frontend
 *   can switch on using the `type` field.
 */

import { Injectable, Optional } from '@nestjs/common';
import { BaseAgent } from '../base/base.agent';
import { ISessionContext } from '../core/execution-context.interface';
import { TAOIteration } from '../core/types';
import {
  SharedState,
  SharedClassificationResult,
  SharedFAQResult,
  SharedGeneratorResult,
} from '../core/shared-state';
import { ProblemClassifier } from '../../classifier/problem.classifier';
import {
  ClassificationResult,
  ProblemType,
} from '../../classifier/classification-rules';
import { EditableContentManager } from '../../generator/editable-content.manager';
import {
  TechAssignmentManager,
  BugReport,
  TechAssignment,
} from '../../generator/tech-assignment.manager';
import { FAQMatcher, FAQMatchResult } from '../../cascade/faq.matcher';

export type GeneratorOutputType =
  | 'FAQ'
  | 'EDITABLE_RESPONSE'
  | 'TECH_ISSUE'
  | 'RESULT_WITH_SUGGESTIONS';

export interface GeneratorNextStep {
  action: string;
  note: string;
}

export interface GeneratorSearchSource {
  id?: string;
  title: string;
  relevance: number;
  excerpt: string;
  url?: string;
}

export interface GeneratorAgentOutput {
  /** Type of response produced - frontend switches on this field */
  type: GeneratorOutputType;
  /** Data source that produced the content (faq / searcher_docs / tech_assignment / other) */
  source: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Classification reasoning (for audit / debugging) */
  classification: ClassificationResult;

  // --- Scenario A (FAQ) ---
  /** FAQ answer, ready to send to the customer as-is */
  answer?: string;
  faqId?: string;

  // --- Scenario B (DOC_ANSWER) ---
  /** Draft content for support staff to edit or send */
  draftContent?: string;
  /** Frontend features that are available for this output */
  editable?: boolean;
  chatOptimizable?: boolean;
  /** Document sources used to build the draft */
  searchResults?: GeneratorSearchSource[];
  /** Version record id for edit history */
  editableRecordId?: string;

  // --- Scenario C (TECH_ISSUE) ---
  /** Bug report to send to the Tech Department */
  bugReport?: BugReport;
  /** Auto-generated acknowledgement email to the customer */
  customerEmail?: TechAssignment['customerEmail'];
  /** Full tech assignment including assignedTo, dueDate, etc. */
  techAssignment?: {
    id: string;
    assignedTo: string;
    dueDate: Date;
    status: TechAssignment['status'];
  };

  // --- Scenario D (OTHER) ---
  /** Suggested reply for support staff to review */
  suggestion?: string;
  /** Actionable next-steps to guide the support agent */
  nextSteps?: GeneratorNextStep[];
  /** Whether this output requires human judgement before sending */
  requiresHumanJudgment?: boolean;
}

/** Internal action shape produced by parseAction() */
interface GeneratorAction {
  type: 'FINISH' | 'GENERATE_FAQ' | 'GENERATE_EDITABLE' | 'GENERATE_TECH' | 'GENERATE_OTHER';
  classification: ClassificationResult;
  faqMatch?: FAQMatchResult;
}

@Injectable()
export class GeneratorAgent extends BaseAgent {
  name = 'GeneratorAgent';
  description =
    'Classifies tickets and produces a scenario-specific response: FAQ, editable draft, tech bug report, or suggestions for support staff.';

  constructor(
    private readonly problemClassifier: ProblemClassifier,
    private readonly editableContentManager: EditableContentManager,
    private readonly techAssignmentManager: TechAssignmentManager,
    @Optional() private readonly faqMatcher?: FAQMatcher,
  ) {
    super();
  }

  /**
   * STEP 1 - THINK
   *
   * Classification is deterministic (rules + similarity matching).  We run it
   * here and serialize the result so parseAction() can read it back.  No LLM
   * call is needed for this step, which keeps the agent fast and cheap.
   */
  protected async think(
    context: ISessionContext,
    _history: TAOIteration[],
  ): Promise<string> {
    const shared = SharedState.from(context);
    const classification = await this.problemClassifier.classifyProblem(context);

    let faqMatch: FAQMatchResult | undefined;

    // If classifier tagged it FAQ, try FAQ matcher for an authoritative answer.
    if (classification.type === ProblemType.FAQ && this.faqMatcher) {
      try {
        faqMatch = await this.faqMatcher.match(context.input);
        // If FAQ matcher did not actually find a match, demote to DOC_ANSWER.
        if (!faqMatch?.matched) {
          classification.type = shared.has('searcherResult')
            ? ProblemType.DOC_ANSWER
            : ProblemType.OTHER;
          classification.reason += ' (FAQ match failed, demoted)';
        }
      } catch (_e) {
        faqMatch = undefined;
      }
    }

    // Cache for downstream access and for audit log readability.
    // ClassificationResult uses the ProblemType enum; its runtime values are
    // the same strings as SharedClassificationResult's literal union, so the
    // cast is safe at this boundary.
    shared.set(
      'problemClassification',
      classification as unknown as SharedClassificationResult,
    );
    if (faqMatch) {
      shared.set('faqResult', faqMatch as SharedFAQResult);
    }

    const payload = {
      classification,
      faqMatch: faqMatch
        ? {
            matched: faqMatch.matched,
            faqId: faqMatch.faqId,
            confidence: faqMatch.confidence,
          }
        : undefined,
    };

    return [
      `THOUGHT: Problem classified as ${classification.type} ` +
        `(confidence=${classification.confidence.toFixed(2)}). ` +
        `Reason: ${classification.reason}.`,
      `ACTION: ${this.classificationToActionName(classification.type)}`,
      `DATA: ${JSON.stringify(payload)}`,
    ].join('\n');
  }

  /**
   * STEP 2 - PARSE ACTION
   *
   * Converts the structured thought into a typed GeneratorAction.  Because
   * think() produces deterministic output, parseAction() is a simple extractor.
   */
  protected async parseAction(thought: string): Promise<GeneratorAction> {
    const actionMatch = thought.match(/ACTION:\s*([^\n]+)/i);
    const dataMatch = thought.match(/DATA:\s*(\{[\s\S]*\})/);

    let classification: ClassificationResult = {
      type: ProblemType.OTHER,
      confidence: 0.5,
      reason: 'Default classification (unparseable thought)',
      matchedKeywords: [],
    };
    let faqMatch: FAQMatchResult | undefined;

    if (dataMatch) {
      try {
        const parsed = JSON.parse(dataMatch[1]);
        if (parsed.classification) {
          classification = parsed.classification;
        }
        if (parsed.faqMatch) {
          faqMatch = parsed.faqMatch;
        }
      } catch {
        // fall through - keep defaults
      }
    }

    const actionName = actionMatch ? actionMatch[1].trim().toUpperCase() : '';

    switch (actionName) {
      case 'GENERATE_FAQ':
        return { type: 'GENERATE_FAQ', classification, faqMatch };
      case 'GENERATE_EDITABLE':
        return { type: 'GENERATE_EDITABLE', classification };
      case 'GENERATE_TECH':
        return { type: 'GENERATE_TECH', classification };
      case 'GENERATE_OTHER':
      default:
        return { type: 'GENERATE_OTHER', classification };
    }
  }

  /**
   * STEP 3 - EXECUTE ACTION
   *
   * Dispatches to the appropriate scenario handler and returns a final
   * observation (shouldStop = true) so the TAO Loop terminates in one step.
   */
  protected async executeAction(
    context: ISessionContext,
    action: GeneratorAction,
  ): Promise<{
    success: boolean;
    output?: GeneratorAgentOutput;
    error?: string;
    shouldStop?: boolean;
  }> {
    try {
      let output: GeneratorAgentOutput;

      switch (action.type) {
        case 'GENERATE_FAQ':
          output = this.handleScenarioA_FAQ(context, action);
          break;
        case 'GENERATE_EDITABLE':
          output = await this.handleScenarioB_Editable(context, action);
          break;
        case 'GENERATE_TECH':
          output = this.handleScenarioC_TechIssue(context, action);
          break;
        case 'GENERATE_OTHER':
        default:
          output = await this.handleScenarioD_Other(context, action);
          break;
      }

      // Publish the final generator output to shared state so downstream
      // consumers (SafetyGate, orchestrator) can pick it up without knowing
      // which scenario ran.
      SharedState.from(context).set(
        'generatorResult',
        output as unknown as SharedGeneratorResult,
      );

      return { success: true, output, shouldStop: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        shouldStop: true,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Scenario A: FAQ - direct answer, ready to send to customer
  // ---------------------------------------------------------------------------
  private handleScenarioA_FAQ(
    context: ISessionContext,
    action: GeneratorAction,
  ): GeneratorAgentOutput {
    // Prefer the full FAQMatchResult stored on shared state (it carries the
    // answer text).  The thought payload only keeps a simplified view.
    const shared = SharedState.from(context);
    const faq: FAQMatchResult | undefined =
      (shared.get('faqResult') as FAQMatchResult | undefined) ??
      action.faqMatch;

    return {
      type: 'FAQ',
      source: 'faq',
      confidence: faq?.confidence ?? action.classification.confidence,
      classification: action.classification,
      answer:
        faq?.answer ??
        'Thank you for reaching out. Please refer to our help center for the standard answer to this question.',
      faqId: faq?.faqId,
      editable: false,
      chatOptimizable: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Scenario B: DOC_ANSWER - editable draft + AI chat optimization
  // ---------------------------------------------------------------------------
  private async handleScenarioB_Editable(
    context: ISessionContext,
    action: GeneratorAction,
  ): Promise<GeneratorAgentOutput> {
    const shared = SharedState.from(context);
    const searcherResult = shared.get('searcherResult') ?? {
      documentsFound: 0,
    };
    const documents: any[] = Array.isArray(searcherResult.documents)
      ? searcherResult.documents
      : Array.isArray(searcherResult.sources)
        ? searcherResult.sources
        : [];

    const draftContent = await this.generateDraftFromSearch(context, documents);

    const editableRecord = this.editableContentManager.createEditableContent(
      context.taskId,
      draftContent,
    );

    const searchResults: GeneratorSearchSource[] = documents
      .slice(0, 5)
      .map((doc: any) => ({
        id: doc.id,
        title: doc.title ?? 'Untitled',
        relevance: doc.relevance ?? doc.score ?? 0,
        excerpt:
          doc.excerpt ??
          (typeof doc.content === 'string'
            ? doc.content.substring(0, 200)
            : ''),
        url: doc.url,
      }));

    return {
      type: 'EDITABLE_RESPONSE',
      source: 'searcher_docs',
      confidence:
        searcherResult.avgRelevance ??
        action.classification.confidence ??
        0.78,
      classification: action.classification,
      draftContent,
      editable: true,
      chatOptimizable: true,
      searchResults,
      editableRecordId: editableRecord.currentVersion.versionId,
    };
  }

  // ---------------------------------------------------------------------------
  // Scenario C: TECH_ISSUE - bug report to tech team + auto email to customer
  // ---------------------------------------------------------------------------
  private handleScenarioC_TechIssue(
    context: ISessionContext,
    action: GeneratorAction,
  ): GeneratorAgentOutput {
    const shared = SharedState.from(context);
    const analyzerResult = shared.get('analyzerResult') ?? ({} as any);
    const metadata: Record<string, any> = context.metadata ?? {};

    const bugReport = this.techAssignmentManager.createBugReport(
      context.taskId,
      context.input,
      {
        os: analyzerResult.os ?? metadata.os,
        appVersion: analyzerResult.appVersion ?? metadata.appVersion,
        userAgent: metadata.userAgent,
      },
    );

    const customerEmail: string =
      analyzerResult.customerEmail ??
      metadata.customerEmail ??
      'customer@unknown.email';

    const assignment = this.techAssignmentManager.createAssignment(
      context.taskId,
      bugReport,
      customerEmail,
    );

    return {
      type: 'TECH_ISSUE',
      source: 'tech_assignment',
      confidence: action.classification.confidence,
      classification: action.classification,
      bugReport,
      customerEmail: assignment.customerEmail,
      techAssignment: {
        id: assignment.id,
        assignedTo: assignment.assignedTo,
        dueDate: assignment.dueDate,
        status: assignment.status,
      },
      nextSteps: [
        {
          action: 'Notify tech department',
          note: `Alert ${assignment.assignedTo} to review bug report ${bugReport.id}.`,
        },
        {
          action: 'Send customer acknowledgement email',
          note: `Automatic reply scheduled for ${customerEmail}.`,
        },
        {
          action: 'Track resolution',
          note: `Due by ${assignment.dueDate.toDateString()} (7 business days).`,
        },
      ],
      requiresHumanJudgment: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Scenario D: OTHER - suggestion + next-step guidance for support staff
  // ---------------------------------------------------------------------------
  private async handleScenarioD_Other(
    context: ISessionContext,
    action: GeneratorAction,
  ): Promise<GeneratorAgentOutput> {
    const shared = SharedState.from(context);
    const analyzerResult = shared.get('analyzerResult') ?? ({} as any);
    const searcherResult = shared.get('searcherResult');

    const suggestion = await this.generateSuggestion(context);

    const nextSteps: GeneratorNextStep[] = [
      {
        action: 'Verify ticket category',
        note: `Current category: ${analyzerResult.category || 'unspecified'}. Adjust if it does not match the real issue.`,
      },
    ];

    const relatedDocCount = searcherResult?.documents?.length ?? 0;
    if (relatedDocCount > 0) {
      nextSteps.push({
        action: 'Review related documents',
        note: `${relatedDocCount} related document(s) were found. Check whether any of them applies.`,
      });
    }

    nextSteps.push({
      action: 'Compose custom response',
      note: 'Use the AI suggestion below as a starting point and customise it for the customer.',
    });

    if (analyzerResult.priority === 'high' || analyzerResult.priority === 'urgent') {
      nextSteps.push({
        action: 'Escalate if needed',
        note: 'Ticket is marked high priority - consider escalating to a senior agent or manager.',
      });
    } else {
      nextSteps.push({
        action: 'Assess escalation',
        note: 'Decide whether this ticket needs to be escalated based on customer sentiment and impact.',
      });
    }

    return {
      type: 'RESULT_WITH_SUGGESTIONS',
      source: 'other',
      confidence: action.classification.confidence ?? 0.5,
      classification: action.classification,
      suggestion,
      nextSteps,
      requiresHumanJudgment: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private classificationToActionName(type: ProblemType): GeneratorAction['type'] {
    switch (type) {
      case ProblemType.FAQ:
        return 'GENERATE_FAQ';
      case ProblemType.DOC_ANSWER:
        return 'GENERATE_EDITABLE';
      case ProblemType.TECH_ISSUE:
        return 'GENERATE_TECH';
      case ProblemType.OTHER:
      default:
        return 'GENERATE_OTHER';
    }
  }

  /**
   * Compose a draft reply from the searched documents.  Falls back to a
   * safe generic reply when no documents are found.
   *
   * An LLM call is used when documents are available, to synthesize a
   * coherent reply that cites the knowledge base.  Failure falls back to a
   * deterministic concatenation.
   */
  private async generateDraftFromSearch(
    context: ISessionContext,
    documents: any[],
  ): Promise<string> {
    if (!documents || documents.length === 0) {
      return (
        `Thank you for reaching out. Based on our current information, here is what we can share regarding "${context.input.substring(0, 120).trim()}". ` +
        'We are looking into the details and will follow up with a more complete answer as soon as possible.'
      );
    }

    const topDocs = documents.slice(0, 3);
    const excerpts = topDocs
      .map(
        (d: any, i: number) =>
          `${i + 1}. ${d.title ?? 'Untitled'}: ${(d.excerpt ?? d.content ?? '').toString().substring(0, 300)}`,
      )
      .join('\n');

    const systemPrompt = `You are a customer-support writer.  Combine the referenced documents into a single friendly reply for the customer.

Rules:
- Write in the language of the customer question.
- 2-4 short paragraphs.
- Answer the question directly first, then add supporting details.
- Do NOT invent facts that are not in the references.
- End with a brief offer of further help.`;

    const userPrompt = `Customer question:\n${context.input}\n\nReference documents:\n${excerpts}\n\nWrite the draft reply:`;

    try {
      const response = await context.modelClient.call(
        [{ role: 'user', content: userPrompt }],
        systemPrompt,
        { temperature: 0.4, maxTokens: 600 },
        this.buildCallContext(context),
      );
      const trimmed = (response || '').trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    } catch {
      // Fall back to deterministic draft below.
    }

    let draft = 'Based on our documentation:\n\n';
    for (const doc of topDocs) {
      draft += `From "${doc.title ?? 'Untitled'}":\n${(doc.excerpt ?? doc.content ?? '').toString().substring(0, 200)}\n\n`;
    }
    draft += 'If you need more information, feel free to ask for clarification.';
    return draft;
  }

  /**
   * Generate a suggestion reply used by support staff for scenario D.  This is
   * a best-effort generation - on LLM failure a safe generic suggestion is
   * returned so the ticket can still be handled manually.
   */
  private async generateSuggestion(context: ISessionContext): Promise<string> {
    const systemPrompt = `You are an assistant for customer-support staff.
Generate a concise (2-3 short paragraphs) draft reply they can use as a starting point.
Be friendly and actionable, but do not invent policy specifics.`;

    try {
      const response = await context.modelClient.call(
        [{ role: 'user', content: `Customer ticket: ${context.input}` }],
        systemPrompt,
        { temperature: 0.7, maxTokens: 400 },
        this.buildCallContext(context),
      );
      const trimmed = (response || '').trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    } catch {
      // fall through
    }

    return 'Thank you for contacting us. We are looking into your request and will follow up shortly. Meanwhile, could you share any additional context that might help us resolve it faster?';
  }
}
