import React, { useState, useEffect, useRef } from 'react';
import { useCreateTicket, useTickets } from '../hooks/useSWRApi';
import { CreateTicketRequest, Ticket } from '../types';

interface ChatMessage {
  id: string;
  type: 'user' | 'system';
  content: string;
  timestamp: string;
  ticketId?: string;
}

interface ChatBoxProps {
  onTicketCreated?: (ticketId: string) => void;
  onError?: (error: string) => void;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  onTicketCreated,
  onError,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [createdTicketIds, setCreatedTicketIds] = useState<string[]>([]);
  const { createTicket, isLoading, error } = useCreateTicket();
  const { tickets } = useTickets({ limit: 100 }, true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAnalysisSummary = (ticket: Ticket) => {
    const analysis = ticket.analysis as any;
    if (!analysis) return null;

    const problemType =
      analysis.classification?.type ||
      analysis.type ||
      (analysis.source === 'FAQMatcher' ? 'FAQ' : 'OTHER');
    const confidence =
      ticket.confidence ?? analysis.confidence ?? analysis.classification?.confidence ?? 0;
    const source = analysis.source || analysis.cascade?.source || 'AnalyzeAgent';

    return `AI processed this ticket via ${source}: ${problemType} (${(confidence * 100).toFixed(0)}% confidence).`;
  };

  // Add an AI processing result once the submitted ticket has been analyzed.
  useEffect(() => {
    const analyzedTickets = tickets.filter(
      (ticket) =>
        createdTicketIds.includes(ticket.id) &&
        ticket.analysis &&
        ['completed', 'waiting_approval', 'failed', 'dlq'].includes(ticket.status),
    );

    analyzedTickets.forEach((ticket) => {
      const summary = getAnalysisSummary(ticket);
      if (!summary) return;

      setMessages((prev) => {
        if (prev.some((msg) => msg.id === `analysis-${ticket.id}`)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: `analysis-${ticket.id}`,
            type: 'system',
            content: summary,
            timestamp: new Date().toLocaleTimeString(),
            ticketId: ticket.id,
          },
        ];
      });
    });
  }, [tickets, createdTicketIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      onError?.('Please enter a message');
      return;
    }

    // Add user message to chat
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setMessage('');

    try {
      const req: CreateTicketRequest = {
        content: message,
        priority: 'medium', // Default priority
      };

      const ticket = await createTicket(req);
      setCreatedTicketIds((prev) =>
        prev.includes(ticket.id) ? prev : [...prev, ticket.id],
      );
      onTicketCreated?.(ticket.id);

      // Add system message about ticket creation
      const systemMsg: ChatMessage = {
        id: `sys-${ticket.id}`,
        type: 'system',
        content: `✓ Ticket #${ticket.id.slice(0, 8)} created successfully! Our AI agents are analyzing your request...`,
        timestamp: new Date().toLocaleTimeString(),
        ticketId: ticket.id,
      };
      setMessages(prev => [...prev, systemMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create ticket';
      onError?.(errorMsg);
      
      // Add error message to chat
      const errorSystemMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        content: `✗ Error: ${errorMsg}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setMessages(prev => [...prev, errorSystemMsg]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg h-[600px] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <h2 className="text-xl font-bold text-white">💬 Support Chat</h2>
        <p className="text-blue-100 text-sm mt-1">Ask a question and our AI agents will help</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium mb-2">👋 Welcome to SupportOS</p>
            <p className="text-sm">Send a message below to create a support ticket</p>
          </div>
        ) : (
          <>
            {messages.map(msg => (
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
                  <p className="text-sm break-words">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.type === 'user'
                      ? 'text-blue-100'
                      : msg.content.startsWith('✗')
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error instanceof Error ? error.message : 'An error occurred'}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Message Input */}
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
