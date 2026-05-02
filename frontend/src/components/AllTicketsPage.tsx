import React, { useMemo, useState } from 'react';
import { useTickets, useUsers } from '../hooks/useSWRApi';
import { ProblemType, User } from '../types';
import { TicketAnalysisCard } from './TicketAnalysisCard';

interface AllTicketsPageProps {
  currentUser: User;
  onSelectTicket?: (ticketId: string) => void;
  onApproveTicket?: (ticketId: string) => void;
  onRejectTicket?: (ticketId: string, reason: string) => void;
}

type FilterType = 'all' | ProblemType;
type FilterUser = 'all' | string;
type ViewScope = 'unassigned' | 'all';

export const AllTicketsPage: React.FC<AllTicketsPageProps> = ({
  currentUser,
  onSelectTicket,
  onApproveTicket,
  onRejectTicket,
}) => {
  const [viewScope, setViewScope] = useState<ViewScope>('unassigned');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'processed' | 'pending'>('all');
  const [filterUserId, setFilterUserId] = useState<FilterUser>('all');
  // Fine-grained filter for "All Tickets" view.
  // Values: '' = no filter | 'none' = unassigned | <supporterId>.
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const { users: submittingUsers } = useUsers('user');
  const { users: supporterUsers } = useUsers('supporter');

  // Translate the view scope (and optional Assigned-To filter when scope is "all")
  // into the backend query param. The backend treats the literal "none" as "unassigned only".
  const assigneeIdParam = useMemo<string | undefined>(() => {
    if (viewScope === 'unassigned') return 'none';
    // scope === 'all'
    return filterAssigneeId === '' ? undefined : filterAssigneeId;
  }, [viewScope, filterAssigneeId]);

  const { tickets, total, pages, isLoading, error, mutate } = useTickets(
    {
      page,
      limit,
      userId: filterUserId === 'all' ? undefined : filterUserId,
      assigneeId: assigneeIdParam,
    },
    true,
  );

  const getProblemType = (analysis: any): ProblemType => {
    return (
      analysis?.classification?.type ||
      analysis?.type ||
      (analysis?.source === 'FAQMatcher' ? 'FAQ' : 'OTHER')
    );
  };

  const filteredTickets = (tickets?.filter((ticket) => {
    const analysis = ticket.analysis as any;

    if (filterType !== 'all') {
      if (!analysis) return false;
      const problemType = getProblemType(analysis);
      if (problemType !== filterType) return false;
    }

    if (filterStatus === 'pending' && ticket.approvalStatus !== 'pending') {
      return false;
    }
    if (filterStatus === 'processed' && ticket.approvalStatus === 'pending') {
      return false;
    }
    return true;
  }) || []).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const getConfidence = (analysis: any) => {
    return (analysis?.confidence ?? analysis?.classification?.confidence ?? 0) * 100;
  };

  const scopeLabel = useMemo(() => {
    if (viewScope === 'unassigned') return 'Unassigned';
    if (filterAssigneeId === '') return 'All Tickets';
    if (filterAssigneeId === 'none') return 'All Tickets · Unassigned';
    const target = supporterUsers.find((s) => s.id === filterAssigneeId);
    return target
      ? `All Tickets · Assigned to ${target.name}`
      : 'All Tickets';
  }, [viewScope, filterAssigneeId, supporterUsers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          📚 All Tickets
        </h2>
        <p className="text-gray-600">
          Browse and manage all support tickets
          <span className="ml-2 text-sm text-gray-500">
            · Currently viewing:{' '}
            <span className="font-medium text-gray-700">{scopeLabel}</span>
          </span>
        </p>
      </div>

      {/* View scope tabs */}
      <div className="bg-white rounded-lg shadow-md p-3">
        <p className="text-xs text-gray-500 mb-2">
          View tickets:
        </p>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { key: 'unassigned', label: '🆕 Unassigned' },
              { key: 'all', label: '🔍 All Tickets' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setViewScope(tab.key);
                if (tab.key !== 'all') {
                  // Reset the per-supporter filter
                  setFilterAssigneeId('');
                }
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                viewScope === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900">
            Tickets in view
          </h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{total}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <h3 className="text-sm font-medium text-green-900">Pending Review</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {tickets?.filter((t) => t.approvalStatus === 'pending').length ?? 0}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <h3 className="text-sm font-medium text-purple-900">Assigned to me</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {tickets?.filter((t) => t.assigneeId === currentUser.id).length ?? 0}
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <h3 className="text-sm font-medium text-orange-900">Avg Confidence</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {(() => {
              const analyzed =
                tickets?.filter((t) => t.analysis) ?? [];
              if (analyzed.length === 0) return '0';
              return Math.round(
                analyzed.reduce(
                  (sum, t) => sum + getConfidence(t.analysis),
                  0,
                ) / analyzed.length,
              );
            })()}
            %
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

          {/* Submitting User Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Submitted By
            </label>
            <select
              value={filterUserId}
              onChange={(e) => {
                setFilterUserId(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Users</option>
              {submittingUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee Filter — only meaningful when scope is "All Tickets".
              Disabled in Unassigned view with a hint. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assigned To
              {viewScope !== 'all' && (
                <span className="ml-1 text-xs text-gray-400 font-normal">
                  (switch to "All Tickets" to use)
                </span>
              )}
            </label>
            <select
              value={filterAssigneeId}
              onChange={(e) => {
                setFilterAssigneeId(e.target.value);
                setPage(1);
              }}
              disabled={viewScope !== 'all'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Anyone</option>
              <option value="none">— Unassigned —</option>
              {supporterUsers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === currentUser.id ? `${s.name} (me)` : s.name}
                </option>
              ))}
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
            <p className="text-lg">No tickets found in this view</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTickets.map((ticket) => (
              <TicketAnalysisCard
                key={ticket.id}
                ticket={ticket}
                currentSupporter={currentUser}
                supporters={supporterUsers}
                onMutate={() => mutate()}
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
