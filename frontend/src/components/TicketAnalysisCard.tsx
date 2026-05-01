import React from 'react';
import { Ticket, GeneratorOutputType, ProblemType } from '../types';

interface TicketAnalysisCardProps {
  ticket: Ticket;
  onViewDetails?: (ticketId: string) => void;
  onApprove?: (ticketId: string) => void;
  onReject?: (ticketId: string, reason: string) => void;
}

export const TicketAnalysisCard: React.FC<TicketAnalysisCardProps> = ({
  ticket,
  onViewDetails,
  onApprove,
  onReject,
}) => {
  const analysis = ticket.analysis as any;
  
  if (!analysis) {
    return null;
  }

  // Map problem types to display info
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

  const problemType = (
    analysis.classification?.type ||
    analysis.type ||
    (analysis.source === 'FAQMatcher' ? 'FAQ' : 'OTHER')
  ) as ProblemType | GeneratorOutputType;
  const typeInfo = typeConfig[problemType] ?? typeConfig.OTHER;
  const confidence =
    ticket.confidence ?? analysis.confidence ?? analysis.classification?.confidence ?? 0;
  
  // Format timestamp
  const createdTime = new Date(ticket.createdAt).toLocaleString();

  // Map type to suggested action
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
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-700">
              {(confidence * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">confidence</div>
          </div>
        </div>

        {/* Ticket Content Preview */}
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-sm text-gray-700 line-clamp-3">
            {ticket.content}
          </p>
        </div>

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
