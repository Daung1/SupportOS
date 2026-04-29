import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { api } from '../lib/api';
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
} from '../types';

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Use single ticket
export const useTicket = (ticketId: string | null, shouldFetch = true) => {
  const { data, error, isLoading, mutate } = useSWR<TicketDetail>(
    shouldFetch && ticketId ? `/api/tickets/${ticketId}` : null,
    fetcher,
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
  },
  shouldFetch = true,
) => {
  const query = new URLSearchParams();
  if (filters?.status) query.append('status', filters.status);
  if (filters?.page) query.append('page', filters.page.toString());
  if (filters?.limit) query.append('limit', filters.limit.toString());
  if (filters?.tags?.length) {
    filters.tags.forEach((tag) => query.append('tags', tag));
  }

  const { data, error, isLoading, mutate } = useSWR<PaginatedResponse<Ticket>>(
    shouldFetch ? `/api/tickets?${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 3000,
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

// Create ticket mutation
export const useCreateTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    '/api/tickets',
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
export const useApproveTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    null as any,
    async (_key: unknown, { arg }: any) => {
      return api.approveTicket(arg.ticketId, arg.data);
    },
  ) as any;

  return {
    approve: trigger,
    isLoading: isMutating,
    error,
  };
};

// Reject ticket mutation
export const useRejectTicket = () => {
  const { trigger, isMutating, error } = useSWRMutation(
    null as any,
    async (_key: unknown, { arg }: any) => {
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
    null as any,
    async (_key: unknown, { arg }: any) => {
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
    ticketId ? `/api/tickets/${ticketId}/logs` : null,
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
    ticketId ? `/api/tickets/${ticketId}/token-usage` : null,
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
