// Ticket status enum
export type TicketStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'review'
  | 'dlq';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SafetyDecision = 'approve' | 'review' | 'reject';

// Problem Classification Types
export type ProblemType = 'FAQ' | 'DOC_ANSWER' | 'TECH_ISSUE' | 'OTHER';
export type GeneratorOutputType = 'FAQ' | 'EDITABLE_RESPONSE' | 'TECH_ISSUE' | 'RESULT_WITH_SUGGESTIONS';

// Analyzer & Classification Results
export interface ClassificationResult {
  type: ProblemType;
  confidence: number;
  reason: string;
  matchedKeywords: string[];
}

export interface GeneratorSearchSource {
  id?: string;
  title: string;
  relevance: number;
  excerpt: string;
  url?: string;
}

export interface BugReport {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  environment: {
    os?: string;
    appVersion?: string;
    browser?: string;
  };
  steps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
}

export interface TechAssignmentEmail {
  to: string;
  subject: string;
  body: string;
}

export interface GeneratorAgentOutput {
  // Common fields
  type: GeneratorOutputType;
  source: string;
  confidence: number;
  classification: ClassificationResult;
  
  // Scenario A (FAQ)
  answer?: string;
  faqId?: string;
  
  // Scenario B (DOC_ANSWER)
  draftContent?: string;
  editable?: boolean;
  chatOptimizable?: boolean;
  searchResults?: GeneratorSearchSource[];
  editableRecordId?: string;
  
  // Scenario C (TECH_ISSUE)
  bugReport?: BugReport;
  customerEmail?: TechAssignmentEmail;
  
  // Scenario D (RESULT_WITH_SUGGESTIONS)
  suggestion?: string;
  nextSteps?: Array<{
    action: string;
    note: string;
  }>;
}

export interface AnalysisResult extends GeneratorAgentOutput {
  // Extended for full analysis
  processedAt?: string;
}

// Lightweight identity returned by /api/users
export type UserRole = 'user' | 'supporter';

export interface User {
  id: string;
  name: string;
  email?: string | null;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

// Core domain types
export interface Ticket {
  id: string;
  content: string;
  status: TicketStatus;
  priority?: 'low' | 'medium' | 'high';

  // Submitting user (lightweight identity, no auth)
  userId?: string | null;
  user?: User | null;

  // Assigned supporter
  assigneeId?: string | null;
  assignee?: User | null;

  // Processing results
  analysis?: any;
  suggestion?: string;
  finalContent?: string | null;
  
  // Safety evaluation
  confidence?: number;
  hallucination?: number;
  safetyDecision?: SafetyDecision;
  requiresReview?: boolean;
  safetyScores?: {
    rule?: boolean;
    heuristic?: number;
    llm?: number;
    final?: number;
  };
  safetyReasons?: string[];
  
  // Approval tracking
  approvalStatus?: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  edits?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface TicketLog {
  id: string;
  ticketId: string;
  agentName: string;
  phase: string;
  actionType?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  duration: number;
  timestamp: string;
}

export interface TokenUsage {
  id: string;
  ticketId: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
}

export interface TAOIteration {
  ticketId?: string;
  agentName: string;
  iteration: number;
  thought?: string;
  action?: string;
  observation?: string;
  timestamp: string;
}

export interface TicketDetail {
  ticket: Ticket;
  logs: TicketLog[];
  tokenUsage: TokenUsage[];
  iterations: TAOIteration[];
}

export interface CreateTicketRequest {
  content: string;
  priority?: 'low' | 'medium' | 'high';
  userId?: string;
}

export interface ApproveTicketRequest {
  approvedBy: string;
  editedContent?: string;
}

export interface RejectTicketRequest {
  reason: string;
}

export interface ChatWithAIRequest {
  message: string;
}

// WebSocket events
export interface SocketEvent<T = unknown> {
  event: string;
  ticketId: string;
  data: T;
  timestamp: string;
}

export interface TicketStageChangeEvent {
  ticketId: string;
  stage: TicketStatus;
  timestamp: string;
}

export interface TicketIterationEvent {
  ticketId: string;
  agentName: string;
  iteration: number;
  thought?: string;
  action?: string;
  observation?: string;
  timestamp: string;
}

export interface TicketCostUpdateEvent {
  ticketId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
}

export interface TicketCompletedEvent {
  ticketId: string;
  finalContent: string;
  confidence: number;
  timestamp: string;
}

export interface TicketFailedEvent {
  ticketId: string;
  error: string;
  timestamp: string;
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
