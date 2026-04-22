/**
 * Classification Rules for Problem Type Detection
 * Contains keywords and patterns for identifying different problem types.
 * All keywords are in English.
 */

export interface ClassificationRules {
  techIssueKeywords: string[];
  faqMatchKeywords: string[];
  documentableKeywords: string[];
  urgentKeywords: string[];
}

export const CLASSIFICATION_RULES: ClassificationRules = {
  // Tech Issue Keywords - patterns that indicate technical problems
  techIssueKeywords: [
    'bug',
    'crash',
    'crashed',
    'crashing',
    'error',
    'fail',
    'failed',
    'failing',
    'exception',
    'system error',
    'application error',
    'app crash',
    'system failure',
    'unable',
    'cannot',
    'can not',
    'does not work',
    'not working',
    'issue',
    'problem',
    'malfunction',
    'glitch',
    'freeze',
    'frozen',
    'hang',
    'hanging',
    'lag',
    'laggy',
    'broken',
    'stuck',
  ],

  // FAQ Match Keywords - high confidence questions with direct answers
  faqMatchKeywords: [
    'how to',
    'how do i',
    'how can i',
    'how to modify',
    'how to change',
    'how to view',
    'how to cancel',
    'how to return',
    'how to delete',
    'how to contact',
    'return process',
    'return policy',
    'fee',
    'fees',
    'cost',
    'costs',
    'price',
    'pricing',
    'standard',
    'policy',
    'shipping',
    'delivery',
    'logistics',
  ],

  // Documentable Keywords - issues that can be answered from documentation
  documentableKeywords: [
    'order',
    'shipping',
    'logistics',
    'return',
    'refund',
    'payment',
    'account',
    'login',
    'password',
    'product',
    'specification',
    'compatible',
    'compatibility',
    'delay',
    'delayed',
    'lost',
    'damaged',
    'expected',
    'actual',
  ],

  // Urgent Keywords - problems that need immediate attention
  urgentKeywords: [
    'urgent',
    'urgently',
    'immediately',
    'serious',
    'severe',
    'data loss',
    'account hacked',
    'account compromised',
    'financial loss',
    'cannot login',
    'cannot access',
    'locked out',
  ],
};

export enum ProblemType {
  FAQ = 'FAQ',
  DOC_ANSWER = 'DOC_ANSWER',
  TECH_ISSUE = 'TECH_ISSUE',
  OTHER = 'OTHER',
}

export interface ClassificationResult {
  type: ProblemType;
  confidence: number;
  reason: string;
  matchedKeywords: string[];
}
