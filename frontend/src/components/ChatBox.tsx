import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCreateTicket, useTickets } from '../hooks/useSWRApi';
import { CreateTicketRequest, Ticket, User } from '../types';

// Message displayed in the chat.
// Two sources:
// 1. From backend (via ticket list) - persistent, survives page reload
// 2. Local state (pending messages) - temporary, until "Generate as Ticket" is clicked
interface ChatMessage {
  id: string;
  type: 'user' | 'system' | 'pending';
  content: string;
  timestamp: string;
  ticketId?: string;
  isLocalPending?: boolean;  // true if not yet converted to ticket
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
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const { createTicket, isLoading, error } = useCreateTicket();
  const { tickets } = useTickets(
    { limit: 100, userId: currentUser.id },
    true,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistent messages from backend tickets
  const persistentMessages = useMemo(
    () => buildMessages(tickets),
    [tickets],
  );

  // Combined: persistent + pending + errors (but if in new conversation mode, hide persistent)
  const messages = useMemo(() => {
    if (isNewConversation) {
      // In new conversation mode, only show new conversation banner + pending/errors
      const newConvMessage: ChatMessage = {
        id: 'new-conv-banner',
        type: 'system',
        content: '📝 New conversation started. Type your question below.',
        timestamp: new Date().toLocaleTimeString(),
      };
      return [newConvMessage, ...pendingMessages, ...transientErrors];
    }
    // Normal mode: show all persistent + pending + errors
    return [...persistentMessages, ...pendingMessages, ...transientErrors];
  }, [isNewConversation, persistentMessages, pendingMessages, transientErrors]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 1. Send message and try quick answer from L1/L2
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) {
      onError?.('Please enter a message');
      return;
    }

    const userMessage = trimmed;
    setMessage('');
    setCreatingTicket(true);

    // First, add user message to pending display
    const userMsg: ChatMessage = {
      id: `pending-user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      timestamp: new Date().toLocaleTimeString(),
      isLocalPending: true,
    };
    setPendingMessages((prev) => [...prev, userMsg]);

    try {
      // Call quick answer endpoint (L1/L2 only)
      const response = await fetch('/api/tickets/chat/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage,
          userId: currentUser.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Quick answer failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.answer) {
        // Found answer from L1 or L2 - display it
        setTransientErrors((prev) => [
          ...prev,
          {
            id: `answer-${Date.now()}`,
            type: 'system',
            content: `${
              result.level === 1 ? '📚' : '📋'
            } ${result.source} (${(result.confidence * 100).toFixed(0)}% confidence):\n\n${result.answer}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        // No quick answer found - prompt user to generate ticket
        setTransientErrors((prev) => [
          ...prev,
          {
            id: `no-answer-${Date.now()}`,
            type: 'system',
            content: `❌ ${result.message || 'No quick answer found.'}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to get quick answer';
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
    } finally {
      setCreatingTicket(false);
    }
  };

  // 2. Generate ticket from pending message
  const handleGenerateTicket = async (messageId: string) => {
    const pendingMsg = pendingMessages.find((m) => m.id === messageId);
    if (!pendingMsg) return;

    setCreatingTicket(true);
    try {
      const req: CreateTicketRequest = {
        content: pendingMsg.content,
        priority: 'medium',
        userId: currentUser.id,
      };

      const ticket = await createTicket(req);
      
      // Remove from pending and let it appear via SWR refresh
      setPendingMessages((prev) => prev.filter((m) => m.id !== messageId));
      onTicketCreated?.(ticket.id);

      // Show success message
      setTransientErrors((prev) => [
        ...prev,
        {
          id: `success-${Date.now()}`,
          type: 'system',
          content: `✓ Ticket #${ticket.id.slice(0, 8)} created. Our AI agents are analyzing your request…`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
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
    } finally {
      setCreatingTicket(false);
    }
  };

  // 3. Start new conversation
  const handleNewConversation = () => {
    setPendingMessages([]);
    setTransientErrors([]);
    setMessage('');
    setIsNewConversation(true);
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
              Send a message below to chat. Click "Generate as Ticket" to create a support ticket.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className="max-w-xs lg:max-w-md space-y-2">
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      msg.type === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : msg.content.startsWith('✗')
                          ? 'bg-red-100 text-red-800 rounded-bl-none'
                          : msg.content.startsWith('✓')
                            ? 'bg-green-100 text-green-800 rounded-bl-none'
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
                            : msg.content.startsWith('✓')
                              ? 'text-green-600'
                              : 'text-gray-600'
                      }`}
                    >
                      {msg.timestamp}
                    </p>
                  </div>
                  
                  {/* "Generate as Ticket" button for pending user messages */}
                  {msg.isLocalPending && msg.type === 'user' && (
                    <button
                      onClick={() => handleGenerateTicket(msg.id)}
                      disabled={creatingTicket}
                      className="text-xs px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {creatingTicket ? 'Creating...' : '🎫 Generate as Ticket'}
                    </button>
                  )}
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

        <form onSubmit={handleSend} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your question here..."
              disabled={creatingTicket}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !creatingTicket) {
                  handleSend(e as any);
                }
              }}
            />
            <button
              type="submit"
              disabled={creatingTicket || !message.trim()}
              className={`px-6 py-2 rounded-lg font-medium text-white transition-colors whitespace-nowrap ${
                creatingTicket || !message.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              Send
            </button>
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={creatingTicket}
              className="px-4 py-2 rounded-lg font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              title="Start a new conversation"
            >
              📄 New
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
