import React from 'react';
import { TokenUsage, TicketCostUpdateEvent } from '../types';

interface TokenCostProps {
  tokenUsage?: TokenUsage[];
  costUpdates?: TicketCostUpdateEvent[];
  isLoading?: boolean;
}

export const TokenCost: React.FC<TokenCostProps> = ({
  tokenUsage = [],
  costUpdates = [],
  isLoading,
}) => {
  const totalCost = tokenUsage.reduce((sum, u) => sum + u.cost, 0);
  const totalInputTokens = tokenUsage.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutputTokens = tokenUsage.reduce((sum, u) => sum + u.outputTokens, 0);
  const totalTokens = totalInputTokens + totalOutputTokens;

  const latestCostUpdate = costUpdates.length > 0 
    ? costUpdates[costUpdates.length - 1] 
    : null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Token Cost</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs font-medium text-blue-600 mb-1">Total Cost</p>
          <p className="text-2xl font-bold text-blue-900">
            ${totalCost.toFixed(4)}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-xs font-medium text-green-600 mb-1">Input Tokens</p>
          <p className="text-2xl font-bold text-green-900">
            {totalInputTokens.toLocaleString()}
          </p>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <p className="text-xs font-medium text-orange-600 mb-1">Output Tokens</p>
          <p className="text-2xl font-bold text-orange-900">
            {totalOutputTokens.toLocaleString()}
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-xs font-medium text-purple-600 mb-1">Total Tokens</p>
          <p className="text-2xl font-bold text-purple-900">
            {totalTokens.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Real-time Cost Update */}
      {latestCostUpdate && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Real-time Update:</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-600">New Cost</p>
              <p className="text-lg font-bold text-green-600">
                ${latestCostUpdate.cost.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Input Tokens</p>
              <p className="text-lg font-bold text-gray-900">
                +{latestCostUpdate.inputTokens}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Output Tokens</p>
              <p className="text-lg font-bold text-gray-900">
                +{latestCostUpdate.outputTokens}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Breakdown */}
      {tokenUsage.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Token Usage by Agent
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-700 font-medium">
                    Agent
                  </th>
                  <th className="px-4 py-2 text-right text-gray-700 font-medium">
                    Input
                  </th>
                  <th className="px-4 py-2 text-right text-gray-700 font-medium">
                    Output
                  </th>
                  <th className="px-4 py-2 text-right text-gray-700 font-medium">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokenUsage.map((usage, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-4 py-2 text-gray-900">{usage.agent}</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {usage.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {usage.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-900 font-medium">
                      ${usage.cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && tokenUsage.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Loading token data...
        </div>
      )}
    </div>
  );
};
