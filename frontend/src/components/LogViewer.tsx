import React, { useState } from 'react';
import { TicketLog } from '../types';

interface LogViewerProps {
  logs: TicketLog[];
  isLoading?: boolean;
}

const renderJSON = (data: unknown): React.ReactNode => {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return '(Unable to render)';
  }
};

export const LogViewer: React.FC<LogViewerProps> = ({ logs, isLoading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getPhaseColor = (phase: string) => {
    if (phase.includes('start')) return 'bg-blue-100 text-blue-800';
    if (phase.includes('iteration')) return 'bg-purple-100 text-purple-800';
    if (phase.includes('end')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading logs...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No logs available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="border border-gray-200 rounded-lg overflow-hidden hover:bg-gray-50 transition-colors"
        >
          <div
            onClick={() =>
              setExpandedId(expandedId === log.id ? null : log.id)
            }
            className="p-4 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">
                    {log.agentName}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getPhaseColor(
                      log.phase,
                    )}`}
                  >
                    {log.phase}
                  </span>
                  {log.actionType && (
                    <span className="text-xs text-gray-500">
                      {log.actionType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(log.timestamp).toLocaleString()}
                  {log.duration && ` · ${log.duration}ms`}
                </p>
              </div>
              <span className="text-gray-400">
                {expandedId === log.id ? '▼' : '▶'}
              </span>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedId === log.id && (
            <div className="border-t bg-gray-50 p-4 space-y-3">
              {log.toolName && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    Tool
                  </p>
                  <p className="text-sm font-mono text-gray-800">
                    {log.toolName}
                  </p>
                </div>
              )}

              {log.input ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    Input
                  </p>
                  <div className="bg-white border border-gray-200 rounded p-2 text-xs overflow-auto max-h-48">
                    <code className="text-gray-800 whitespace-pre-wrap">
                      {renderJSON(log.input) as React.ReactNode}
                    </code>
                  </div>
                </div>
              ) : null}

              {log.output ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    Output
                  </p>
                  <div className="bg-white border border-gray-200 rounded p-2 text-xs overflow-auto max-h-48">
                    <code className="text-gray-800 whitespace-pre-wrap">
                      {renderJSON(log.output) as React.ReactNode}
                    </code>
                  </div>
                </div>
              ) : null}

              {log.error && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">
                    Error
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs">
                    <code className="text-red-800">{log.error}</code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
