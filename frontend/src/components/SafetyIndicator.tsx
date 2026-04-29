import React from 'react';
import { SafetyDecision } from '../types';

interface SafetyIndicatorProps {
  decision?: SafetyDecision;
  finalScore?: number;
  rulePass?: boolean;
  heuristicScore?: number;
  llmScore?: number;
  reasons?: string[];
}

export const SafetyIndicator: React.FC<SafetyIndicatorProps> = ({
  decision,
  finalScore,
  rulePass,
  heuristicScore,
  llmScore,
  reasons,
}) => {
  const getDecisionColor = (decision?: SafetyDecision) => {
    switch (decision) {
      case 'approve':
        return 'bg-green-100 text-green-900 border-green-300';
      case 'review':
        return 'bg-yellow-100 text-yellow-900 border-yellow-300';
      case 'reject':
        return 'bg-red-100 text-red-900 border-red-300';
      default:
        return 'bg-gray-100 text-gray-900 border-gray-300';
    }
  };

  const getScoreColor = (score?: number) => {
    if (score === undefined) return 'text-gray-600';
    if (score >= 0.85) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Safety Evaluation</h3>

      {/* Main Decision */}
      {decision && (
        <div className={`border-2 rounded-lg p-4 mb-4 ${getDecisionColor(decision)}`}>
          <h4 className="font-bold text-lg capitalize">{decision}</h4>
          {finalScore !== undefined && (
            <p className={`text-sm mt-1 font-semibold ${getScoreColor(finalScore)}`}>
              Final Score: {(finalScore * 100).toFixed(1)}%
            </p>
          )}
        </div>
      )}

      {/* Detailed Scores */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {rulePass !== undefined && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs font-medium text-gray-600">Rule Check</p>
            <p className={`text-lg font-bold ${rulePass ? 'text-green-600' : 'text-red-600'}`}>
              {rulePass ? 'Pass' : 'Fail'}
            </p>
          </div>
        )}
        {heuristicScore !== undefined && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs font-medium text-gray-600">Heuristic</p>
            <p className={`text-lg font-bold ${getScoreColor(heuristicScore)}`}>
              {(heuristicScore * 100).toFixed(0)}%
            </p>
          </div>
        )}
        {llmScore !== undefined && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs font-medium text-gray-600">LLM Validation</p>
            <p className={`text-lg font-bold ${getScoreColor(llmScore)}`}>
              {(llmScore * 100).toFixed(0)}%
            </p>
          </div>
        )}
      </div>

      {/* Reasons */}
      {reasons && reasons.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Evaluation Reasons:</p>
          <ul className="space-y-1">
            {reasons.map((reason, idx) => (
              <li
                key={idx}
                className="text-sm text-gray-600 flex items-start gap-2"
              >
                <span className="text-gray-400 mt-0.5">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
