import React, { useState } from 'react';
import { useTickets } from '../hooks/useSWRApi';
import { Ticket, TicketStatus } from '../types';

interface TicketListProps {
  onSelectTicket?: (ticketId: string) => void;
}

export const TicketList: React.FC<TicketListProps> = ({ onSelectTicket }) => {
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const { tickets, total, pages, isLoading, error } = useTickets(
    {
      status: status || undefined,
      page,
      limit,
    },
    true,
  );

  const statusColors: Record<TicketStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    review: 'bg-purple-100 text-purple-800',
  };

  const priorityColors: Record<string, string> = {
    low: 'text-gray-500',
    medium: 'text-orange-500',
    high: 'text-red-500',
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Tickets</h2>

      {/* Filter */}
      <div className="mb-4 flex gap-4 items-center">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as any);
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="review">Review</option>
        </select>
        <span className="text-sm text-gray-600">
          {total} total tickets
        </span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading tickets...</div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">Error loading tickets</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No tickets found</div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket?.(ticket.id)}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-gray-900 flex-1 truncate">
                      Ticket {ticket.id.slice(0, 8)}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        statusColors[ticket.status]
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {ticket.userMessage}
                  </p>
                  <div className="mt-2 flex gap-2 items-center text-xs text-gray-500">
                    <span>
                      Created: {new Date(ticket.createdAt).toLocaleString()}
                    </span>
                    {ticket.priorityLevel && (
                      <span className={priorityColors[ticket.priorityLevel]}>
                        {ticket.priorityLevel.toUpperCase()}
                      </span>
                    )}
                    {ticket.confidence !== undefined && (
                      <span>
                        Confidence: {(ticket.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1 || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page === pages || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

// Dashboard component - combines multiple views
export const Dashboard: React.FC<TicketListProps> = ({ onSelectTicket }) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    onSelectTicket?.(ticketId);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Quick Stats */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900">Pending</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">-</p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-orange-900">Processing</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">-</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-900">Completed</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">-</p>
        </div>
      </div>

      <TicketList onSelectTicket={handleSelectTicket} />
    </div>
  );
};
