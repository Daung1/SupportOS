import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCreateTicket, useTickets } from '../hooks/useSWRApi';
import { CreateTicketRequest, Ticket, User } from '../types';

// Message displayed in the chat. NOT stored anywhere — computed on every
// render from the per-user ticket list returned by the backend, so it
// survives page navigation and full reloads.
interface ChatMessage {
  id: string;
  type: 'user' | 'system';
  content: string;
  timestamp: string;
  ticketId?: string;
}

interface ChatBoxProps {
  currentUser: User;
  onTicketCreated?: (ticketId: string) => void;
  onError?: (error: string) => void;
}

const PROCESSED_STATUSES = new Set([
  'completed',
  'waiting_approval',
  'failed',
  'dlq',
]);

const getAnalysisSummary = (ticket: Ticket): string | null => {
  const analysis = ticket.analysis as any;
  if (!analysis) return null;

  const problemType =
    analysis.classification?.type ||
    analysis.type ||
    (analysis.source === 'FAQMatcher' ? 'FAQ' : 'OTHER');
  const confidence =
    ticket.confidence ??
    analysis.confidence ??
    analysis.classification?.confidence ??
    0;
  const source = analysis.source || analysis.cascade?.source || 'AnalyzeAgent';

  return `AI processed this ticket via ${source}: ${problemType} (${(confidence * 100).toFixed(0)}% confidence).`;
};

const formatTimestamp = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
};

/**
 * Build the chronological message list from the user's tickets.
 *
 * Each ticket contributes:
 *   1. one "user" bubble (the original submitted content), and
 *   2. one "system" bubble that either reports it's still being analyzed
 *      or summarizes the AI result once analysis is complete.
 *
 * Because the source of truth is the backend, switching pages or
 * refreshing the browser does not lose anything.
 */
const buildMessages = (tickets: Ticket[]): ChatMessage[] => {
  const sorted = [...tickets].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const messages: ChatMessage[] = [];
  for (const ticket of sorted) {
    messages.push({
      id: `user-${ticket.id}`,
      type: 'user',
      content: ticket.content,
      timestamp: formatTimestamp(ticket.createdAt),
      ticketId: ticket.id,
    });

    const summary = getAnalysisSummary(ticket);
    if (summary && PROCESSED_STATUSES.has(ticket.status)) {
      messages.push({
        id: `analysis-${ticket.id}`,
        type: 'system',
        content: summary,
        timestamp: formatTimestamp(ticket.updatedAt ?? ticket.createdAt),
        ticketId: ticket.id,
      });
    } else {
      messages.push({
        id: `pending-${ticket.id}`,
        type: 'system',
        content: `✓ Ticket #${ticket.id.slice(0, 8)} created. Our AI agents are analyzing your request…`,
        timestamp: formatTimestamp(ticket.createdAt),
        ticketId: ticket.id,
      });
    }
  }
  return messages;
};

export const ChatBox: React.FC<ChatBoxProps> = ({
  currentUser,
  onTicketCreated,
  onError,
}) => {
  const [message, setMessage] = useState('');
  const [transientErrors, setTransientErrors] = useState<ChatMessage[]>([]);
  const { createTicket, isLoading, error } = useCreateTicket();
  const { tickets } = useTickets(
    { limit: 100, userId: currentUser.id },
    true,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(
    () => [...buildMessages(tickets), ...transientErrors],
    [tickets, transientErrors],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) {
      onError?.('Please enter a message');
      return;
    }

    const submitted = trimmed;
    setMessage('');

    try {
      const req: CreateTicketRequest = {
        content: submitted,
        priority: 'medium',
        userId: currentUser.id,
      };

      const ticket = await createTicket(req);
      onTicketCreated?.(ticket.id);
      // Nothing to push into local state — the user's bubble + "processing"
      // status will appear automatically on the next SWR refresh
      // (every 3s) once the new ticket row is returned by GET /tickets.
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to create ticket';
      onError?.(errorMsg);

      setTransientErrors((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: 'system',
          content: `✗ Error: ${errorMsg}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg h-[600px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <h2 className="text-xl font-bold text-white">💬 Support Chat</h2>
        <p className="text-blue-100 text-sm mt-1">
          Chatting as <span className="font-semibold">{currentUser.name}</span>
          {' · '}history is saved automatically
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">👋 Welcome to SupportOS</p>
            <p className="text-sm">
              Send a message below to create a support ticket
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.type === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : msg.content.startsWith('✗')
                        ? 'bg-red-100 text-red-800 rounded-bl-none'
                        : 'bg-gray-200 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {msg.content}
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      msg.type === 'user'
                        ? 'text-blue-100'
                        : msg.content.startsWith('✗')
                          ? 'text-red-600'
                          : 'text-gray-600'
                    }`}
                  >
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error instanceof Error ? error.message : 'An error occurred'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your question here..."
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                  handleSubmit(e as any);
                }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${
                isLoading || !message.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {isLoading ? '...' : '→'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
