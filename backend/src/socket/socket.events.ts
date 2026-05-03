/**
 * WebSocket event types and payloads for ticket processing stream.
 * Events are emitted to room: `ticket:${ticketId}`
 */

export interface TicketStageEvent {
  ticketId: string;
  stage: 'queued' | 'processing' | 'completed' | 'failed' | 'review';
  timestamp: Date;
  message?: string;
}

export interface TicketIterationEvent {
  ticketId: string;
  agentName: string;
  iterationNumber: number;
  thought?: string;
  action?: string;
  observation?: string;
  timestamp: Date;
}

export interface TicketCostEvent {
  ticketId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model?: string;
  timestamp: Date;
}

export interface TicketCompletedEvent {
  ticketId: string;
  suggestion: string;
  confidence: number;
  requiresReview: boolean;
  timestamp: Date;
}

export interface TicketFailedEvent {
  ticketId: string;
  error: string;
  timestamp: Date;
}

/**
 * Client-to-server messages
 */
export interface SubscribeMessage {
  ticketId: string;
}

export interface UnsubscribeMessage {
  ticketId: string;
}
