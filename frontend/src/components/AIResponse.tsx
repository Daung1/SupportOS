import React from 'react';

interface AIResponseProps {
  response?: string;
  finalContent?: string | null;
  category?: string;
  isLoading?: boolean;
  /**
   * Ticket lifecycle status. When this is `failed` or `dlq` we render a
   * dedicated "did not complete" card instead of treating `response` as
   * AI output - otherwise the friendly fallback ("we have received your
   * ticket...") shows up under a "Generated Response" header, which
   * looks like the AI literally generated a status acknowledgment.
   */
  status?: string;
  /**
   * Raw failure reason (from `ticket.analysis.error`). Optional - only
   * surfaced under the failure card so engineers can debug without
   * leaking it as if it were the AI's answer.
   */
  failureReason?: string;
}

const FAILED_STATUSES = new Set(['failed', 'dlq']);

export const AIResponse: React.FC<AIResponseProps> = ({
  response,
  finalContent,
  category,
  isLoading,
  status,
  failureReason,
}) => {
  const isFailed = !!status && FAILED_STATUSES.has(status);
  // Determine which scenario to render
  const content = finalContent ?? response;

  const isRejected = finalContent === null;
  const isApproved = finalContent && finalContent !== response;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        AI Response
      </h3>

      {isLoading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-2">Generating response...</p>
        </div>
      )}

      {!isLoading && isFailed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-xs font-medium text-amber-700 mb-2">
            ⚠️ AI processing did not complete
          </p>
          <p className="text-sm text-gray-700 mb-3">
            We couldn't auto-generate a confident answer for this ticket.
            Our team will pick it up from here and follow up shortly.
          </p>
          {failureReason && (
            <details className="mt-2">
              <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900">
                Technical details (for support staff)
              </summary>
              <p className="text-xs text-gray-600 mt-2 font-mono whitespace-pre-wrap break-words">
                {failureReason}
              </p>
            </details>
          )}
        </div>
      )}

      {!isLoading && !isFailed && !content && (
        <div className="text-center py-8 text-gray-500">
          No response available yet
        </div>
      )}

      {!isLoading && !isFailed && content && (
        <>
          {/* Scenario: FAQ Match */}
          {category === 'faq' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-blue-600 mb-2">SCENARIO 1: FAQ Match</p>
              <p className="text-sm text-gray-700">{content}</p>
            </div>
          )}

          {/* Scenario: Simple Filter */}
          {category === 'simple' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-green-600 mb-2">SCENARIO 2: Simple Filter</p>
              <p className="text-sm text-gray-700">{content}</p>
            </div>
          )}

          {/* Scenario: Multi-Agent */}
          {category === 'multi_agent' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-purple-600 mb-2">SCENARIO 3: Multi-Agent Processing</p>
              <p className="text-sm text-gray-700">{content}</p>
            </div>
          )}

          {/* Default: Generated Response */}
          {!category && !isRejected && !isApproved && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Generated Response</p>
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
              </div>
            </div>
          )}

          {/* Scenario: Approved/Edited */}
          {isApproved && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-green-600 mb-2">SCENARIO 4: Approved & Ready to Send</p>
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
              </div>
            </div>
          )}

          {/* Scenario: Rejected */}
          {isRejected && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-red-600 mb-2">Response Rejected</p>
              <p className="text-sm text-red-700">
                This response was rejected during safety evaluation and will not be sent.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
