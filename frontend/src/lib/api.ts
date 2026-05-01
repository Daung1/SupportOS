/// <reference types="vite/client" />

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

// directly use backend URL without proxy
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

type BackendListResponse<T> =
  | PaginatedResponse<T>
  | {
      data: T[];
      meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
      };
    }
  | T[];

export const unwrapApiResponse = <T,>(data: ApiResponse<T> | T): T => {
  if (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    'data' in data
  ) {
    return (data as ApiResponse<T>).data as T;
  }
  return data as T;
};

export const normalizeTicketList = (
  payload: BackendListResponse<Ticket> | ApiResponse<BackendListResponse<Ticket>>,
): PaginatedResponse<Ticket> => {
  const data = unwrapApiResponse(payload);

  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: 1,
      limit: data.length,
      pages: 1,
    };
  }

  if ('items' in data) {
    return data;
  }

  const items = data.data ?? [];
  const meta = data.meta ?? {};
  return {
    items,
    total: meta.total ?? items.length,
    page: meta.page ?? 1,
    limit: meta.limit ?? items.length,
    pages:
      meta.totalPages ??
      Math.max(
        1,
        Math.ceil(
          (meta.total ?? items.length) / ((meta.limit ?? items.length) || 1),
        ),
      ),
  };
};

export const normalizeTicketDetail = (
  payload: TicketDetail | (Ticket & { logs?: TicketLog[]; tokenUsage?: TokenUsage[]; iterations?: unknown[] }),
): TicketDetail => {
  const data = unwrapApiResponse(payload);

  if ('ticket' in data) {
    return data;
  }

  const { logs = [], tokenUsage = [], iterations = [], ...ticket } = data;
  return {
    ticket: ticket as Ticket,
    logs,
    tokenUsage,
    iterations: iterations as TicketDetail['iterations'],
  };
};

export const api = {
  // Tickets
  async createTicket(req: CreateTicketRequest): Promise<Ticket> {
    console.log('api.createTicket called with:', req);
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    console.log('Response status:', res.status, res.statusText);
    if (!res.ok) {
      const errorBody = await res.text();
      console.error('Response error body:', errorBody);
      throw new Error(`Failed to create ticket: ${res.statusText}`);
    }
    const data = await res.json();
    console.log('Response data:', data);
    return data.data || data;
  },

  async getTicket(id: string): Promise<TicketDetail> {
    const res = await fetch(`${API_BASE}/tickets/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch ticket: ${res.statusText}`);
    const data = await res.json();
    return normalizeTicketDetail(data);
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
    return normalizeTicketList(data);
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
