import { 
  Ticket, 
  TicketDetail, 
  CreateTicketRequest, 
  ApproveTicketRequest,
  RejectTicketRequest,
  ChatWithAIRequest,
  PaginatedResponse,
  TokenUsage,
  TicketLog,
  ApiResponse
} from '../types';

const API_BASE = '/api';

export const api = {
  // Tickets
  async createTicket(req: CreateTicketRequest): Promise<Ticket> {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Failed to create ticket: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  async getTicket(id: string): Promise<TicketDetail> {
    const res = await fetch(`${API_BASE}/tickets/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch ticket: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  async listTickets(params?: { 
    status?: string; 
    page?: number; 
    limit?: number;
    tags?: string[];
  }): Promise<PaginatedResponse<Ticket>> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.tags?.length) {
      params.tags.forEach(tag => query.append('tags', tag));
    }

    const res = await fetch(`${API_BASE}/tickets?${query}`);
    if (!res.ok) throw new Error(`Failed to fetch tickets: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  async getTicketLogs(ticketId: string): Promise<TicketLog[]> {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/logs`);
    if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  async getTokenUsage(ticketId: string): Promise<TokenUsage[]> {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/token-usage`);
    if (!res.ok) throw new Error(`Failed to fetch token usage: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  // Approval
  async approveTicket(ticketId: string, req: ApproveTicketRequest): Promise<Ticket> {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Failed to approve ticket: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  async rejectTicket(ticketId: string, req: RejectTicketRequest): Promise<Ticket> {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Failed to reject ticket: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  // Chat with AI
  async chatWithAI(ticketId: string, req: ChatWithAIRequest): Promise<{ response: string }> {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`Failed to chat with AI: ${res.statusText}`);
    const data = await res.json();
    return data.data || data;
  },

  // Health
  async getHealth(): Promise<any> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Failed to fetch health: ${res.statusText}`);
    return res.json();
  },
};
