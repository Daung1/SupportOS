/**
 * Cascade module - exports all classes and utilities for the L0/L1/L3
 * cascade. (Legacy L2 SimpleFilter has been retired.)
 */

export { FAQMatcher, FAQMatchResult } from './faq.matcher';
export { FAQ_DATABASE, default as FAQ_DATABASE_DEFAULT } from './faq.data';
export {
  FAQEmbeddingService,
  buildFaqEmbedText,
  cosine,
} from './faq-embedding.service';
export {
  TriageService,
  TriageResult,
  TriageIntent,
  SupportCategory,
} from './triage.service';
export {
  CascadeOrchestrator,
  CascadeResult,
  CascadeSource,
  CascadeOrchestratorOptions,
  CASCADE_ORCHESTRATOR_OPTIONS,
} from './cascade-orchestrator.service';
