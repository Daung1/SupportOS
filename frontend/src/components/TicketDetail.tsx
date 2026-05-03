import React, { useState } from 'react';
import {
  useTicket,
  useTicketLogs,
  useTokenUsage,
  useAssignTicket,
} from '../hooks/useSWRApi';
import { useTicketStream } from '../hooks/useTicketStream';
import { AgentTracer } from './AgentTracer';
import { AIResponse } from './AIResponse';
import { SafetyIndicator } from './SafetyIndicator';
import { TokenCost } from './TokenCost';
import { ApprovalPanel } from './ApprovalPanel';
import { LogViewer } from './LogViewer';
import { GeneratorOutputType, ProblemType, User } from '../types';

interface TicketDetailProps {
  ticketId: string;
  onBack?: () => void;
  /**
   * Currently signed-in supporter. When provided, enables the
   * "Claim" / reassignment controls on the Assigned to row.
   * In user-mode this stays undefined and the row stays read-only.
   */
  currentSupporter?: User | null;
  /** All supporters available for assignment via the dropdown. */
  supporters?: User[];
}

export const TicketDetail: React.FC<TicketDetailProps> = ({
  ticketId,
  onBack,
  currentSupporter,
  supporters = [],
}) => {
  const [tab, setTab] = useState<
    'overview' | 'response' | 'approval' | 'logs' | 'cost'
  >('overview');
  const [refresh, setRefresh] = useState(0);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  const { ticket, logs, tokenUsage, iterations, isLoading, mutate } =
    useTicket(ticketId);

  const { logs: logsData, isLoading: logsLoading } = useTicketLogs(ticketId);
  const { tokenUsage: tokenUsageData, isLoading: costLoading } =
    useTokenUsage(ticketId);
  const { assign, isLoading: assigning } = useAssignTicket();

  // Real-time updates via WebSocket
  const streamState = useTicketStream(ticketId);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    review: 'bg-purple-100 text-purple-800',
  };

  const tabButtons = [
    { id: 'overview', label: 'Overview' },
    { id: 'response', label: 'Response' },
    { id: 'approval', label: 'Approval' },
    { id: 'logs', label: 'Audit Logs' },
    { id: 'cost', label: 'Token Cost' },
  ] as const;

  const handleRefresh = () => {
    mutate();
    setRefresh((r) => r + 1);
  };

  const runAssign = async (assigneeId: string | null) => {
    setAssignError(null);
    setAssignSuccess(null);
    try {
      await assign({ ticketId, assigneeId });
      setAssignSuccess(
        assigneeId ? 'Assignment updated' : 'Unassigned successfully',
      );
      setTimeout(() => setAssignSuccess(null), 3000);
      mutate();
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Assign failed',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-4">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-center text-gray-600">Ticket not found</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived values for the "Quick Actions" panel (mirrors what users see on
  // the dashboard card so context isn't lost when drilling into a ticket).
  // ---------------------------------------------------------------------------
  const analysis = ticket.analysis as any;
  const hasAnalysis = Boolean(analysis);
  const problemType: ProblemType | GeneratorOutputType | null = hasAnalysis
    ? ((analysis.classification?.type ||
        analysis.type ||
        (analysis.source === 'FAQMatcher' ? 'FAQ' : 'OTHER')) as
        | ProblemType
        | GeneratorOutputType)
    : null;

  const nextStepConfig: Record<
    ProblemType | GeneratorOutputType,
    { label: string; color: string }
  > = {
    FAQ: { label: '→ Send FAQ Answer', color: 'bg-blue-600' },
    DOC_ANSWER: { label: '→ Send Draft Response', color: 'bg-green-600' },
    EDITABLE_RESPONSE: { label: '→ Send Draft Response', color: 'bg-green-600' },
    TECH_ISSUE: { label: '→ Create Bug Report', color: 'bg-red-600' },
    OTHER: { label: '→ Human Review', color: 'bg-purple-600' },
    RESULT_WITH_SUGGESTIONS: { label: '→ Human Review', color: 'bg-purple-600' },
  };
  const nextStep = problemType ? nextStepConfig[problemType] : null;

  const isSupporterMode = Boolean(currentSupporter && supporters.length > 0);
  const isAssignedToMe =
    !!currentSupporter && ticket.assigneeId === currentSupporter.id;
  const assigneeLabel =
    ticket.assignee?.name ??
    (ticket.assigneeId ? `Unknown (${ticket.assigneeId})` : 'Unassigned');

  // Severity sources (in order): bugReport.severity (TECH_ISSUE scenario),
  // analysis.priority (analyzer output), ticket.priority (DTO default).
  const severity =
    (analysis?.bugReport?.severity as string | undefined) ??
    (analysis?.priority as string | undefined) ??
    ticket.priority ??
    null;
  const severityColor: Record<string, string> = {
    urgent: 'bg-red-600 text-white',
    high: 'bg-red-500 text-white',
    medium: 'bg-yellow-500 text-white',
    low: 'bg-gray-400 text-white',
  };

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">
                Ticket {ticket.id.slice(0, 8)}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  statusColors[ticket.status]
                }`}
              >
                {ticket.status}
              </span>
            </div>
            <p className="text-gray-600">
              Created {new Date(ticket.createdAt).toLocaleString()}
              {ticket.user && (
                <>
                  {' · '}From{' '}
                  <span className="font-medium text-gray-800">
                    {ticket.user.name}
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
          >
            Refresh
          </button>
        </div>

        {/* Message */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-gray-700">{ticket.content}</p>
        </div>

        {/* Progress */}
        {streamState.stages.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600 mb-2">Processing Progress:</p>
            <div className="flex gap-2">
              {streamState.stages.map((stage, idx) => (
                <div
                  key={idx}
                  className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-800"
                >
                  {stage.stage}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions panel — mirrors the dashboard card so supporters
          keep the same context (assignment, suggested action, severity)
          after drilling into a ticket. */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 space-y-3">
        {/* Assigned to row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-700">
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
          {isSupporterMode && (
            <div className="flex items-center gap-2">
              {!isAssignedToMe && currentSupporter && (
                <button
                  onClick={() => runAssign(currentSupporter.id)}
                  disabled={assigning}
                  className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {assigning ? '…' : 'Claim'}
                </button>
              )}
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
          )}
        </div>

        {assignError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1 rounded">
            {assignError}
          </div>
        )}
        {assignSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-1 rounded">
            ✓ {assignSuccess}
          </div>
        )}

        {/* Next Step + Severity row */}
        {(nextStep || severity) && (
          <div className="flex items-center gap-3 flex-wrap">
            {nextStep && (
              <div
                className={`${nextStep.color} text-white rounded px-3 py-2 flex items-center gap-2 text-sm font-bold flex-1 min-w-[200px] justify-between`}
              >
                <span>Next Step:</span>
                <span>{nextStep.label}</span>
              </div>
            )}
            {severity && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-600 font-medium">Severity:</span>
                <span
                  className={`px-3 py-1 rounded-full uppercase text-xs font-bold ${
                    severityColor[severity.toLowerCase()] ??
                    'bg-gray-300 text-gray-800'
                  }`}
                >
                  {severity}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b">
          {tabButtons.map((btn) => (
            <button
              key={btn.id}
              onClick={() => setTab(btn.id)}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                tab === btn.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AIResponse
                response={ticket.suggestion}
                finalContent={ticket.finalContent}
                category={ticket.approvalStatus}
                status={ticket.status}
                failureReason={
                  (ticket.analysis as any)?.error as string | undefined
                }
                isLoading={
                  streamState.isConnected &&
                  ticket.status === 'processing'
                }
              />
            </div>
            <div>
              <SafetyIndicator
                decision={ticket.safetyDecision}
                finalScore={ticket.safetyScores?.final}
                rulePass={ticket.safetyScores?.rule}
                heuristicScore={ticket.safetyScores?.heuristic}
                llmScore={ticket.safetyScores?.llm}
                reasons={ticket.safetyReasons}
              />
            </div>
          </div>
        )}

        {/* Response & Approval */}
        {tab === 'response' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AIResponse
                response={ticket.suggestion}
                finalContent={ticket.finalContent}
                category={ticket.approvalStatus}
                status={ticket.status}
                failureReason={
                  (ticket.analysis as any)?.error as string | undefined
                }
              />
            </div>
            <div>
              <AgentTracer
                iterations={
                  streamState.iterations.length > 0
                    ? streamState.iterations
                    : iterations || []
                }
                isLoading={
                  streamState.isConnected &&
                  ticket.status === 'processing'
                }
              />
            </div>
          </div>
        )}

        {/* Approval */}
        {tab === 'approval' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ApprovalPanel
                ticketId={ticketId}
                currentContent={ticket.finalContent ?? ticket.suggestion}
                requiresReview={ticket.requiresReview}
                approvalStatus={ticket.approvalStatus}
                onApprovalStatusChange={handleRefresh}
              />
            </div>
            <div>
              <SafetyIndicator
                decision={ticket.safetyDecision}
                finalScore={ticket.safetyScores?.final}
                rulePass={ticket.safetyScores?.rule}
                heuristicScore={ticket.safetyScores?.heuristic}
                llmScore={ticket.safetyScores?.llm}
                reasons={ticket.safetyReasons}
              />
            </div>
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <LogViewer
              logs={logsData || logs || []}
              isLoading={logsLoading}
            />
          </div>
        )}

        {/* Cost */}
        {tab === 'cost' && (
          <TokenCost
            tokenUsage={tokenUsageData || tokenUsage}
            costUpdates={streamState.costs}
            isLoading={costLoading}
          />
        )}
      </div>
    </div>
  );
};
