/**
 * Cascade module - exports all classes and utilities for level 1-2 cascade.
 */

export { FAQMatcher, FAQMatchResult } from './faq.matcher';
export { FAQ_DATABASE, default as FAQ_DATABASE_DEFAULT } from './faq.data';
export {
  calculateSimilarity,
  chineseTokenize,
  chineseCharacterSplit,
  editDistance,
  normalizeText,
  extractKeyPhrases,
  tokenOverlap
} from './similarity.utils';
export { SimpleFilter, FilterCategory, SimpleFilterResult } from './simple.filter';
export { FILTER_RULES, RuleCategory, FilterRuleLibrary } from './rules.data';
export {
  CascadeOrchestrator,
  CascadeResult,
  CascadeSource,
  CascadeOrchestratorOptions,
  CASCADE_ORCHESTRATOR_OPTIONS,
} from './cascade-orchestrator.service';
