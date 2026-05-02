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
  /** Human-readable time-of-day shown under each bubble. */
  timestamp: string;
  /**
   * Monotonic creation time in ms - used as the sort key when we merge
   * the three message sources (persistent / pending / transient) so a
   * back-end answer that arrives after the user's input lands directly
   * below it instead of being grouped with all the other system bubbles.
   */
  createdAt: number;
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

const FAILED_STATUSES = new Set(['failed', 'dlq']);

const REVIEWING_MESSAGE =
  'Our team is reviewing this ticket and will get back to you shortly.';

/**
 * Build the system reply that appears under each persisted ticket in
 * the chat transcript.
 *
 * Design rule: the chat is a customer-facing surface, not a debug
 * panel. So we NEVER expose engineering metadata like
 *
 *   "AI processed this ticket via MultiAgent: OTHER (50% confidence)."
 *   "Max iterations (10) reached without finishing"
 *   "Gemini API call failed: 503 ..."
 *
 * Instead:
 *   - status=`completed` AND we have a real `ticket.suggestion`
 *     -> show the suggestion (the actual AI-generated answer)
 *   - everything else (waiting_approval, failed, dlq, completed-with-
 *     no-suggestion, low-confidence multi-agent fallthrough)
 *     -> show the friendly REVIEWING_MESSAGE
 *
 * The detailed metadata is still visible in the dedicated AI Response /
 * ticket-detail panels for engineers.
 */
const getAnalysisSummary = (ticket: Ticket): string | null => {
  if (FAILED_STATUSES.has(ticket.status)) {
    return REVIEWING_MESSAGE;
  }

  const suggestion = ticket.suggestion?.trim();

  // Successful end state: the cascade produced an answer the user
  // can act on. Echo it directly into the chat so the conversation
  // ends naturally instead of with a vague "we'll get back to you".
  if (ticket.status === 'completed' && suggestion) {
    return suggestion;
  }

  // waiting_approval => human needs to vet the AI suggestion before
  // we expose it; "completed" without a suggestion => something went
  // sideways; anything else still in flight => not ready yet. All
  // collapse to the same friendly status line.
  return REVIEWING_MESSAGE;
};

const formatTimestamp = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
};

/** Best-effort ms-since-epoch from a backend ISO string. */
const toEpochMs = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
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
    const ticketCreatedMs = toEpochMs(ticket.createdAt);
    const ticketUpdatedMs = toEpochMs(ticket.updatedAt ?? ticket.createdAt);

    messages.push({
      id: `user-${ticket.id}`,
      type: 'user',
      content: ticket.content,
      timestamp: formatTimestamp(ticket.createdAt),
      createdAt: ticketCreatedMs,
      ticketId: ticket.id,
    });

    const summary = getAnalysisSummary(ticket);
    if (summary && PROCESSED_STATUSES.has(ticket.status)) {
      messages.push({
        id: `analysis-${ticket.id}`,
        type: 'system',
        content: summary,
        timestamp: formatTimestamp(ticket.updatedAt ?? ticket.createdAt),
        // Pin analyses 1ms after their ticket so they always sort
        // directly below the user bubble even when the AI replied in
        // the same wall-clock millisecond.
        createdAt: Math.max(ticketUpdatedMs, ticketCreatedMs + 1),
        ticketId: ticket.id,
      });
    } else {
      messages.push({
        id: `pending-${ticket.id}`,
        type: 'system',
        content: `✓ We have received your ticket and will reply as soon as possible. Thank you for your patience.`,
        timestamp: formatTimestamp(ticket.createdAt),
        createdAt: ticketCreatedMs + 1,
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

  // Combined: persistent + pending + errors, merged in chronological
  // order. We can't just spread the three arrays back-to-back: a user
  // bubble (pending) and the system answer for that same exchange
  // (transient) need to appear next to each other, not grouped at the
  // top/bottom of the transcript respectively. Sorting by createdAt
  // keeps each Q/A pair together.
  //
  // Dedupe rules (all keyed on ticketId):
  //   - When a pending or transient message carries a ticketId and the
  //     persistent counterpart for that ticket is *visible* in the
  //     transcript, drop the local copy. This stops the "Generate as
  //     Ticket" flow from showing two near-identical bubbles (the
  //     immediate local one + the one rebuilt from `tickets`) and keeps
  //     the user bubble visible across the SWR refresh window so the
  //     conversation never flickers blank.
  //   - In `isNewConversation` mode we deliberately HIDE all backend
  //     tickets, so dedup must NOT consult `persistentMessages` -
  //     otherwise a freshly-created ticket lands in the SWR list,
  //     dedup filters out the local pending bubble, and the
  //     persistent counterpart isn't rendered either, leaving the
  //     user's question to vanish from the transcript entirely.
  //   - Pending/transient messages without a ticketId always render
  //     (they're tied to the live exchange, not to a backend record).
  const messages = useMemo(() => {
    const visiblePersistent = isNewConversation ? [] : persistentMessages;
    const persistedTicketIds = new Set(
      visiblePersistent
        .filter((m) => m.ticketId)
        .map((m) => m.ticketId as string),
    );
    const dedupedPending = pendingMessages.filter(
      (m) => !m.ticketId || !persistedTicketIds.has(m.ticketId),
    );
    const dedupedTransient = transientErrors.filter(
      (m) => !m.ticketId || !persistedTicketIds.has(m.ticketId),
    );

    const combined = [
      ...visiblePersistent,
      ...dedupedPending,
      ...dedupedTransient,
    ];
    combined.sort((a, b) => a.createdAt - b.createdAt);

    if (isNewConversation) {
      const banner: ChatMessage = {
        id: 'new-conv-banner',
        type: 'system',
        content: '📝 New conversation started. Type your question below.',
        timestamp: new Date().toLocaleTimeString(),
        createdAt: 0, // pin to top
      };
      return [banner, ...combined];
    }
    return combined;
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
    const sendTime = Date.now();
    const userMsg: ChatMessage = {
      id: `pending-user-${sendTime}`,
      type: 'user',
      content: userMessage,
      timestamp: new Date().toLocaleTimeString(),
      createdAt: sendTime,
      isLocalPending: true,
    };
    setPendingMessages((prev) => [...prev, userMsg]);

    try {
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

      // Three terminal outcomes from the cascade:
      //   1. matched FAQ      -> show answer (raw, no metadata chrome)
      //   2. out-of-domain    -> show friendly reply but keep the user
      //                          bubble visible so the conversation
      //                          history reads naturally; just strip
      //                          isLocalPending so we don't offer a
      //                          ticket CTA on chitchat
      //   3. requires ticket  -> show clarify/no-answer message and
      //                          keep the bubble + CTA so the user can
      //                          escalate to a real ticket
      const matched = result.level === 1 && result.answer;

      const replyTime = Date.now();

      if (result.outOfDomain) {
        // Demote the pending user bubble to a "settled" message: it
        // stays in the transcript, but loses the "Generate as Ticket"
        // affordance because OOD inputs (greetings, chitchat, abuse,
        // weather questions, …) shouldn't open support tickets.
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, isLocalPending: false } : m,
          ),
        );
        setTransientErrors((prev) => [
          ...prev,
          {
            id: `ood-${replyTime}`,
            type: 'system',
            content: `👋 ${result.answer || result.message || 'Hi! How can I help?'}`,
            timestamp: new Date().toLocaleTimeString(),
            createdAt: replyTime,
          },
        ]);
      } else if (matched) {
        setTransientErrors((prev) => [
          ...prev,
          {
            id: `answer-${replyTime}`,
            type: 'system',
            content: result.answer,
            timestamp: new Date().toLocaleTimeString(),
            createdAt: replyTime,
          },
        ]);
      } else {
        // requiresTicket path: in-domain but no quick answer.
        const note =
          result.message ||
          'No quick answer found. Click "Generate as Ticket" below to send to our AI agents.';
        setTransientErrors((prev) => [
          ...prev,
          {
            id: `no-answer-${replyTime}`,
            type: 'system',
            content: `🤔 ${note}`,
            timestamp: new Date().toLocaleTimeString(),
            createdAt: replyTime,
          },
        ]);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to get quick answer';
      onError?.(errorMsg);

      const errTime = Date.now();
      setTransientErrors((prev) => [
        ...prev,
        {
          id: `error-${errTime}`,
          type: 'system',
          content: `✗ Error: ${errorMsg}`,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: errTime,
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

      // Don't remove the pending bubble - that produces a ~1s blank
      // window where the user's question literally disappears between
      // "ticket created" and "SWR refreshed and rebuilt the message
      // list". Instead: tag it with the new ticketId and clear the
      // local-pending flag (which hides the "Generate as Ticket"
      // button). The dedupe in `messages` useMemo will then quietly
      // hand off rendering to the persistent `user-${ticket.id}`
      // bubble once SWR catches up, with no visible transition.
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isLocalPending: false, ticketId: ticket.id }
            : m,
        ),
      );
      onTicketCreated?.(ticket.id);

      // Show success message immediately. We tag it with `ticketId`
      // so that once SWR refreshes and the persistent buildMessages()
      // entry for this ticket lands in the transcript, useMemo can
      // recognise the duplicate and drop the transient one - otherwise
      // the user sees the same "we received your ticket" bubble twice.
      const okTime = Date.now();
      setTransientErrors((prev) => [
        ...prev,
        {
          id: `success-${okTime}`,
          type: 'system',
          content: `✓ We have received your ticket and will reply as soon as possible. Thank you for your patience.`,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: okTime,
          ticketId: ticket.id,
        },
      ]);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to create ticket';
      onError?.(errorMsg);

      const errTime = Date.now();
      setTransientErrors((prev) => [
        ...prev,
        {
          id: `error-${errTime}`,
          type: 'system',
          content: `✗ Error: ${errorMsg}`,
          timestamp: new Date().toLocaleTimeString(),
          createdAt: errTime,
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
