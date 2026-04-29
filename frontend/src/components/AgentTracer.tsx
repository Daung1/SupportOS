import React from 'react';
import { TAOIteration } from '../types';

interface AgentTracerProps {
  iterations: TAOIteration[];
  isLoading?: boolean;
}

export const AgentTracer: React.FC<AgentTracerProps> = ({
  iterations,
  isLoading,
}) => {
  if (isLoading && iterations.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600 mt-2">Processing...</p>
      </div>
    );
  }

  if (iterations.length === 0) {
    return <div className="text-center py-8 text-gray-500">No iterations yet</div>;
  }

  return (
    <div className="space-y-4">
      {iterations.map((iter, idx) => (
        <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900">
              {iter.agentName} - Iteration {iter.iteration}
            </h4>
            <span className="text-xs text-gray-500">
              {new Date(iter.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {iter.thought && (
            <div className="mt-2 mb-2">
              <p className="text-xs font-medium text-gray-600 mb-1">Thought:</p>
              <div className="bg-gray-50 px-3 py-2 rounded text-sm text-gray-700">
                {iter.thought}
              </div>
            </div>
          )}

          {iter.action && (
            <div className="mt-2 mb-2">
              <p className="text-xs font-medium text-gray-600 mb-1">Action:</p>
              <div className="bg-blue-50 px-3 py-2 rounded text-sm text-blue-700 font-mono">
                {iter.action}
              </div>
            </div>
          )}

          {iter.observation && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-600 mb-1">Observation:</p>
              <div className="bg-green-50 px-3 py-2 rounded text-sm text-green-700">
                {iter.observation}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
