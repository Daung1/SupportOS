import React, { useState } from 'react';
import { useTicket, useTicketLogs, useTokenUsage } from '../hooks/useSWRApi';
import { useTicketStream } from '../hooks/useTicketStream';
import { AgentTracer } from './AgentTracer';
import { AIResponse } from './AIResponse';
import { SafetyIndicator } from './SafetyIndicator';
import { TokenCost } from './TokenCost';
import { ApprovalPanel } from './ApprovalPanel';
import { LogViewer } from './LogViewer';

interface TicketDetailProps {
  ticketId: string;
  onBack?: () => void;
}

export const TicketDetail: React.FC<TicketDetailProps> = ({
  ticketId,
  onBack,
}) => {
  const [tab, setTab] = useState<
    'overview' | 'response' | 'approval' | 'logs' | 'cost'
  >('overview');
  const [refresh, setRefresh] = useState(0);

  const { ticket, logs, tokenUsage, iterations, isLoading, mutate } =
    useTicket(ticketId);

  const { logs: logsData, isLoading: logsLoading } = useTicketLogs(ticketId);
  const { tokenUsage: tokenUsageData, isLoading: costLoading } =
    useTokenUsage(ticketId);

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
