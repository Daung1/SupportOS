import React, { useState } from 'react';
import { useTickets } from '../hooks/useSWRApi';
import { Ticket, ProblemType } from '../types';
import { TicketAnalysisCard } from './TicketAnalysisCard';

interface SupporterDashboardProps {
  onSelectTicket?: (ticketId: string) => void;
  onApproveTicket?: (ticketId: string) => void;
  onRejectTicket?: (ticketId: string, reason: string) => void;
}

type FilterType = 'all' | ProblemType;

export const SupporterDashboard: React.FC<SupporterDashboardProps> = ({
  onSelectTicket,
  onApproveTicket,
  onRejectTicket,
}) => {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'processed' | 'pending'>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const { tickets, total, pages, isLoading, error } = useTickets(
    {
      page,
      limit,
    },
    true, // Keep polling to get fresh data
  );

  const getProblemType = (analysis: any): ProblemType => {
    return (
      analysis?.classification?.type ||
      analysis?.type ||
      (analysis?.source === 'FAQMatcher' ? 'FAQ' : 'OTHER')
    );
  };

  // Filter analyzed tickets by type and show most recent first.
  const filteredTickets = (tickets?.filter(ticket => {
    const analysis = ticket.analysis as any;
    if (!analysis) return false;

    const problemType = getProblemType(analysis);

    if (filterType !== 'all' && problemType !== filterType) {
      return false;
    }

    if (filterStatus === 'pending' && ticket.approvalStatus !== 'pending') {
      return false;
    }
    if (filterStatus === 'processed' && ticket.approvalStatus === 'pending') {
      return false;
    }

    return true;
  }) || [])
    // Sort by createdAt descending (most recent first)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getTypeIcon = (analysis: any) => {
    const type = getProblemType(analysis);
    const icons: Record<string, string> = {
      FAQ: '❓',
      DOC_ANSWER: '📚',
      TECH_ISSUE: '🔧',
      OTHER: '👤',
      EDITABLE_RESPONSE: '✏️',
      RESULT_WITH_SUGGESTIONS: '💡',
    };
    return icons[type] || '❓';
  };

  const getConfidence = (analysis: any) => {
    return (analysis?.confidence ?? analysis?.classification?.confidence ?? 0) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          👤 Supporter Dashboard
        </h2>
        <p className="text-gray-600">
          Review and approve support tickets analyzed by AI agents
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900">Total Tickets</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{total}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <h3 className="text-sm font-medium text-green-900">Pending Review</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {tickets?.filter(t => t.approvalStatus === 'pending').length ?? 0}
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <h3 className="text-sm font-medium text-orange-900">Tech Issues</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {tickets?.filter(t => {
              const a = t.analysis as any;
              return getProblemType(a) === 'TECH_ISSUE';
            }).length ?? 0}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <h3 className="text-sm font-medium text-purple-900">Avg Confidence</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {tickets && tickets.length > 0
              ? Math.round(
                  tickets.reduce((sum, t) => sum + getConfidence(t.analysis), 0) / tickets.length
                )
              : 0}%
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Problem Type
            </label>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as FilterType);
                setPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="FAQ">❓ FAQ Questions</option>
              <option value="DOC_ANSWER">📚 Documentation Answers</option>
              <option value="TECH_ISSUE">🔧 Technical Issues</option>
              <option value="OTHER">👤 Requires Review</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Approval Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">⏳ Pending Review</option>
              <option value="processed">✓ Processed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Grid */}
      <div>
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">Loading tickets...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <p className="text-lg">Error loading tickets</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No tickets found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTickets.map(ticket => (
              <TicketAnalysisCard
                key={ticket.id}
                ticket={ticket}
                onViewDetails={onSelectTicket}
                onApprove={onApproveTicket}
                onReject={onRejectTicket}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1 || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            ← Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page === pages || isLoading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
