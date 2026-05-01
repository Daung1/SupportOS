import React, { useState } from 'react';
import {
  Ticket,
  GeneratorOutputType,
  ProblemType,
  User,
} from '../types';
import {
  useAssignTicket,
  useDeleteTicket,
} from '../hooks/useSWRApi';

interface TicketAnalysisCardProps {
  ticket: Ticket;
  /** Currently signed-in supporter; enables the "Claim" shortcut. */
  currentSupporter?: User;
  /** All supporters available for assignment via the dropdown. */
  supporters?: User[];
  /** Called after a successful assign/delete so the parent can refresh. */
  onMutate?: () => void;
  onViewDetails?: (ticketId: string) => void;
  onApprove?: (ticketId: string) => void;
  onReject?: (ticketId: string, reason: string) => void;
}

export const TicketAnalysisCard: React.FC<TicketAnalysisCardProps> = ({
  ticket,
  currentSupporter,
  supporters = [],
  onMutate,
  onViewDetails,
  onApprove,
  onReject,
}) => {
  const analysis = ticket.analysis as any;
  const { assign, isLoading: assigning } = useAssignTicket();
  const { remove, isLoading: deleting } = useDeleteTicket();
  const [actionError, setActionError] = useState<string | null>(null);

  // Rendering style is driven by analysis. When the cascade hasn't produced
  // analysis yet (status pending/processing/dlq without a result), we still
  // want to show the card so supporters can assign or delete the ticket;
  // we just substitute a neutral "Awaiting AI" header in that case.
  const hasAnalysis = Boolean(analysis);

  const typeConfig: Record<ProblemType | GeneratorOutputType, {
    label: string;
    icon: string;
    color: string;
    bgColor: string;
  }> = {
    FAQ: { label: 'FAQ Question', icon: '❓', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    DOC_ANSWER: { label: 'Documentation Answer', icon: '📚', color: 'text-green-700', bgColor: 'bg-green-50' },
    TECH_ISSUE: { label: 'Technical Issue', icon: '🔧', color: 'text-red-700', bgColor: 'bg-red-50' },
    OTHER: { label: 'Requires Review', icon: '👤', color: 'text-purple-700', bgColor: 'bg-purple-50' },
    EDITABLE_RESPONSE: { label: 'Draft Response', icon: '✏️', color: 'text-orange-700', bgColor: 'bg-orange-50' },
    RESULT_WITH_SUGGESTIONS: { label: 'Suggestions', icon: '💡', color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  };

  const pendingTypeInfo = {
    label: 'Awaiting AI Analysis',
    icon: '⏳',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  };

  const problemType = hasAnalysis
    ? ((analysis.classification?.type ||
        analysis.type ||
        (analysis.source === 'FAQMatcher' ? 'FAQ' : 'OTHER')) as
        | ProblemType
        | GeneratorOutputType)
    : null;
  const typeInfo = problemType
    ? (typeConfig[problemType] ?? typeConfig.OTHER)
    : pendingTypeInfo;
  const confidence = hasAnalysis
    ? (ticket.confidence ??
        analysis.confidence ??
        analysis.classification?.confidence ??
        0)
    : null;

  const createdTime = new Date(ticket.createdAt).toLocaleString();

  const getSuggestedAction = () => {
    switch (problemType) {
      case 'FAQ':
        return { action: '→ Send FAQ Answer', color: 'bg-blue-600 hover:bg-blue-700' };
      case 'DOC_ANSWER':
        return { action: '→ Send Draft Response', color: 'bg-green-600 hover:bg-green-700' };
      case 'TECH_ISSUE':
        return { action: '→ Create Bug Report', color: 'bg-red-600 hover:bg-red-700' };
      case 'OTHER':
      case 'RESULT_WITH_SUGGESTIONS':
      default:
        return { action: '→ Human Review', color: 'bg-purple-600 hover:bg-purple-700' };
    }
  };

  const statusBadgeColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    processing: 'bg-blue-100 text-blue-700',
    waiting_approval: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    dlq: 'bg-red-200 text-red-800',
  };

  const isAssignedToMe =
    currentSupporter && ticket.assigneeId === currentSupporter.id;
  const assigneeLabel =
    ticket.assignee?.name ??
    (ticket.assigneeId ? `Unknown (${ticket.assigneeId})` : 'Unassigned');

  const runAssign = async (assigneeId: string | null) => {
    setActionError(null);
    try {
      await assign({ ticketId: ticket.id, assigneeId });
      onMutate?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Assign failed',
      );
    }
  };

  const runDelete = async () => {
    if (
      !window.confirm(
        `Delete ticket #${ticket.id.slice(0, 8)}? This will remove its logs and token-usage rows. This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await remove({ ticketId: ticket.id });
      onMutate?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Delete failed',
      );
    }
  };

  return (
    <div className={`${typeInfo.bgColor} border-2 ${typeInfo.color.replace('text-', 'border-')} rounded-lg p-4`}>
      <div className="space-y-3">
        {/* Header with Type */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl">{typeInfo.icon}</span>
            <div>
              <h3 className={`${typeInfo.color} font-bold`}>
                {typeInfo.label}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                Ticket #{ticket.id.slice(0, 8)} · {createdTime}
              </p>
              <p className="text-xs text-gray-700 mt-1">
                <span className="text-gray-500">From:</span>{' '}
                <span className="font-medium">
                  {ticket.user?.name ?? 'Anonymous / legacy'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-right">
              {hasAnalysis && confidence !== null ? (
                <>
                  <div className="text-sm font-semibold text-gray-700">
                    {(confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">confidence</div>
                </>
              ) : (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    statusBadgeColor[ticket.status] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {ticket.status}
                </span>
              )}
            </div>
            <button
              onClick={runDelete}
              disabled={deleting}
              title="Delete ticket"
              className="px-2 py-1 text-xs rounded bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? '…' : '🗑 Delete'}
            </button>
          </div>
        </div>

        {/* Assignment row */}
        <div className="bg-white rounded p-2 border border-gray-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-gray-700">
            <span className="text-gray-500">Assigned to:</span>{' '}
            <span
              className={`font-medium ${
                isAssignedToMe ? 'text-blue-700' : ''
              }`}
            >
              {assigneeLabel}
              {isAssignedToMe && ' (you)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Quick claim — visible only when not already mine */}
            {currentSupporter && !isAssignedToMe && (
              <button
                onClick={() => runAssign(currentSupporter.id)}
                disabled={assigning}
                className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {assigning ? '…' : 'Claim'}
              </button>
            )}
            {/* Reassign / unassign dropdown */}
            <select
              value={ticket.assigneeId ?? ''}
              onChange={(e) => runAssign(e.target.value || null)}
              disabled={assigning}
              className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
              title="Reassign"
            >
              <option value="">— Unassigned —</option>
              {supporters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1 rounded">
            {actionError}
          </div>
        )}

        {/* Ticket Content Preview */}
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-sm text-gray-700 line-clamp-3">
            {ticket.content}
          </p>
        </div>

        {/* Analysis-only details */}
        {hasAnalysis && (
          <>
            {/* Classification Reason */}
            {analysis.classification?.reason && (
              <div className="text-sm text-gray-700 border-l-4 border-gray-400 pl-3 py-2 bg-white rounded">
                <p><strong>Analysis:</strong> {analysis.classification.reason}</p>
              </div>
            )}

            {/* Matched Keywords (if available) */}
            {analysis.classification?.matchedKeywords && analysis.classification.matchedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {analysis.classification.matchedKeywords.slice(0, 3).map((kw: string) => (
                  <span
                    key={kw}
                    className="inline-block px-2 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-300"
                  >
                    {kw}
                  </span>
                ))}
                {analysis.classification.matchedKeywords.length > 3 && (
                  <span className="inline-block px-2 py-1 bg-white rounded-full text-xs text-gray-600 border border-gray-300">
                    +{analysis.classification.matchedKeywords.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* Suggested Action - Prominent */}
            <div className={`${getSuggestedAction().color} text-white rounded p-3 flex items-center justify-between font-bold`}>
              <span>Next Step:</span>
              <span>{getSuggestedAction().action}</span>
            </div>

            {/* Additional Info based on type */}
            {problemType === 'TECH_ISSUE' && analysis.bugReport && (
              <div className="bg-white rounded p-3 space-y-2 text-sm border border-red-200">
                <p><strong>Severity:</strong> <span className="uppercase text-red-600 font-semibold">{analysis.bugReport.severity}</span></p>
                {analysis.bugReport.environment?.os && (
                  <p><strong>OS:</strong> {analysis.bugReport.environment.os}</p>
                )}
              </div>
            )}

            {problemType === 'DOC_ANSWER' && analysis.searchResults && (
              <div className="bg-white rounded p-3 border border-green-200">
                <p className="text-xs font-semibold text-gray-700 mb-2">📄 Found {analysis.searchResults.length} document(s)</p>
                <div className="space-y-1">
                  {analysis.searchResults.slice(0, 2).map((doc: any, idx: number) => (
                    <p key={idx} className="text-xs text-gray-600 truncate">
                      • {doc.title}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Awaiting-AI hint when no analysis */}
        {!hasAnalysis && (
          <div className="bg-white rounded p-3 border border-gray-200 text-xs text-gray-600">
            AI hasn't analyzed this ticket yet. You can still assign or delete it from here.
          </div>
        )}

        {/* Status Badge */}
        {ticket.approvalStatus && ticket.approvalStatus !== 'pending' && (
          <div className="text-center text-xs py-2 rounded">
            <span className={`px-3 py-1 rounded-full font-medium ${
              ticket.approvalStatus === 'approved'
                ? 'bg-green-100 text-green-700'
                : ticket.approvalStatus === 'rejected'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {ticket.approvalStatus.toUpperCase()}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onViewDetails?.(ticket.id)}
            className="flex-1 px-3 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded font-medium text-sm transition-colors border border-gray-300"
          >
            View Full Details
          </button>
          {ticket.approvalStatus === 'pending' && (
            <>
              <button
                onClick={() => onApprove?.(ticket.id)}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium text-sm transition-colors"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Reason for rejection:');
                  if (reason) onReject?.(ticket.id, reason);
                }}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm transition-colors"
              >
                ✗
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
