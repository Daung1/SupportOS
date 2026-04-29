// Ticket status enum
export type TicketStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'review';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited';
export type SafetyDecision = 'approve' | 'review' | 'reject';

// Core domain types
export interface Ticket {
  id: string;
  userMessage: string;
  status: TicketStatus;
  priorityLevel: 'low' | 'medium' | 'high';
  
  // Processing results
  analyzerResult?: {
    category?: string;
    confidence?: number;
  };
  generatedResponse?: string;
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
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  tags?: string[];
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
  userMessage: string;
  priorityLevel?: 'low' | 'medium' | 'high';
  tags?: string[];
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
