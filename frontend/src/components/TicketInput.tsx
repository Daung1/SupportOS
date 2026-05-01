import React, { useState } from 'react';
import { useCreateTicket } from '../hooks/useSWRApi';
import { CreateTicketRequest } from '../types';

interface TicketInputProps {
  onTicketCreated?: (ticketId: string) => void;
  onError?: (error: string) => void;
}

export const TicketInput: React.FC<TicketInputProps> = ({
  onTicketCreated,
  onError,
}) => {
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const { createTicket, isLoading, error } = useCreateTicket();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted! Message:', message);

    if (!message.trim()) {
      console.log('Message is empty');
      onError?.('Please enter a message');
      return;
    }

    try {
      console.log('Creating ticket with:', { content: message, priority });
      const req: CreateTicketRequest = {
        content: message,
        priority: priority,
      };

      const ticket = await createTicket(req);
      console.log('Ticket created:', ticket);
      setMessage('');
      onTicketCreated?.(ticket.id);
    } catch (err) {
      console.error('Error creating ticket:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create ticket';
      onError?.(errorMsg);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Submit Support Ticket
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Message */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your issue..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={5}
            disabled={isLoading}
          />
        </div>

        {/* Priority */}
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error instanceof Error ? error.message : 'An error occurred'}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }`}
        >
          {isLoading ? 'Creating...' : 'Submit Ticket'}
        </button>
      </form>
    </div>
  );
};
