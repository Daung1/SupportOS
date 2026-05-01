/// <reference types="vite/client" />

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { api, normalizeTicketDetail, normalizeTicketList } from '../lib/api';
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
  User,
  UserRole,
} from '../types';

// Fetcher for SWR
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const fetcher = (url: string) => {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  console.log('[SWR Fetcher] Fetching:', fullUrl);
  return fetch(fullUrl)
    .then((res) => {
      console.log('[SWR Fetcher] Response status:', res.status);
      return res.json();
    })
    .catch((err) => {
      console.error('[SWR Fetcher] Error:', err);
      throw err;
    });
};

// Use single ticket
export const useTicket = (ticketId: string | null, shouldFetch = true) => {
  const { data, error, isLoading, mutate } = useSWR(
    shouldFetch && ticketId ? `/tickets/${ticketId}` : null,
    async (url: string) => normalizeTicketDetail(await fetcher(url)),
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    },
  );

  return {
    ticket: data?.ticket,
    logs: data?.logs,
    tokenUsage: data?.tokenUsage,
    iterations: data?.iterations,
    isLoading,
    error,
    mutate,
  };
};

// List tickets
export const useTickets = (
  filters?: {
    status?: string;
    page?: number;
    limit?: number;
    tags?: string[];
    userId?: string;
    /** Supporter id, or the literal "none" for unassigned only. */
    assigneeId?: string;
  },
  shouldFetch = true,
) => {
  const query = new URLSearchParams();
  if (filters?.status) query.append('status', filters.status);
  if (filters?.page) query.append('page', filters.page.toString());
  if (filters?.limit) query.append('limit', filters.limit.toString());
  if (filters?.userId) query.append('userId', filters.userId);
  if (filters?.assigneeId) query.append('assigneeId', filters.assigneeId);
  if (filters?.tags?.length) {
    filters.tags.forEach((tag) => query.append('tags', tag));
  }

  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse<Ticket>>(
    shouldFetch ? `/tickets?${query}` : null,
    async (url: string) => normalizeTicketList(await fetcher(url)),
    {
      revalidateOnFocus: false,
      dedupingInterval: 3000,
      refreshInterval: shouldFetch ? 3000 : 0,
    },
  );

  return {
    tickets: data?.items || [],
    total: data?.total || 0,
    page: data?.page || 1,
    pages: data?.pages || 1,
    isLoading,
    error,
    mutate,
  };
};

// List users for the identity switcher
export const useUsers = (role?: UserRole) => {
  const key = role ? `/users?role=${role}` : '/users';
  const { data, error, isLoading, mutate } = useSWR<User[]>(
    key,
    async (url: string) => {
      const raw = await fetcher(url);
      return (raw?.data ?? raw) as User[];
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  return {
    users: data || [],
    isLoading,
    error,
    mutate,
  };
};

// Create ticket mutation
export const useCreateTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    '/tickets',
    async (_key: string, { arg }: { arg: CreateTicketRequest }) => {
      return api.createTicket(arg);
    },
  );

  return {
    createTicket: trigger,
    isLoading: isMutating,
    error,
  };
};

// Approve ticket mutation
// NOTE: useSWRMutation requires a non-null key — using `null` causes the
// trigger to throw "Can't trigger the mutation: missing key". The key is a
// just a SWR cache identifier here and is never read inside the fetcher.
export const useApproveTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    'mutation/approve-ticket',
    async (_key: string, { arg }: any) => {
      return api.approveTicket(arg.ticketId, arg.data);
    },
  ) as any;

  return {
    approve: trigger,
    isLoading: isMutating,
    error,
  };
};

// Assign ticket to a supporter (or null to unassign)
export const useAssignTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    'mutation/assign-ticket',
    async (
      _key: string,
      { arg }: { arg: { ticketId: string; assigneeId: string | null } },
    ) => {
      return api.assignTicket(arg.ticketId, arg.assigneeId);
    },
  );

  return {
    assign: trigger as unknown as (arg: {
      ticketId: string;
      assigneeId: string | null;
    }) => Promise<Ticket>,
    isLoading: isMutating,
    error,
  };
};

// Hard-delete a ticket
export const useDeleteTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    'mutation/delete-ticket',
    async (_key: string, { arg }: { arg: { ticketId: string } }) => {
      return api.deleteTicket(arg.ticketId);
    },
  );

  return {
    remove: trigger as unknown as (arg: { ticketId: string }) => Promise<void>,
    isLoading: isMutating,
    error,
  };
};

// Reject ticket mutation
export const useRejectTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    'mutation/reject-ticket',
    async (_key: string, { arg }: any) => {
      return api.rejectTicket(arg.ticketId, arg.data);
    },
  ) as any;

  return {
    reject: trigger,
    isLoading: isMutating,
    error,
  };
};

// Chat with AI mutation
export const useChatWithAI = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    'mutation/chat-with-ai',
    async (_key: string, { arg }: any) => {
      return api.chatWithAI(arg.ticketId, arg.data);
    },
  ) as any;

  return {
    chat: trigger,
    isLoading: isMutating,
    error,
  };
};

// Fetch logs
export const useTicketLogs = (ticketId: string | null) => {
  const { data, error, isLoading, mutate } = useSWR<TicketLog[]>(
    ticketId ? `/tickets/${ticketId}/logs` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );

  return {
    logs: data || [],
    isLoading,
    error,
    mutate,
  };
};

// Fetch token usage
export const useTokenUsage = (ticketId: string | null) => {
  const { data, error, isLoading, mutate } = useSWR<TokenUsage[]>(
    ticketId ? `/tickets/${ticketId}/token-usage` : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );

  return {
    tokenUsage: data || [],
    isLoading,
    error,
    mutate,
  };
};

// Calculate total cost
export const calculateTotalCost = (tokenUsage: TokenUsage[]): number => {
  return tokenUsage.reduce((sum, usage) => sum + usage.cost, 0);
};

// Calculate total tokens
export const calculateTotalTokens = (tokenUsage: TokenUsage[]): { input: number; output: number } => {
  return tokenUsage.reduce(
    (sum, usage) => ({
      input: sum.input + usage.inputTokens,
      output: sum.output + usage.outputTokens,
    }),
    { input: 0, output: 0 },
  );
};
