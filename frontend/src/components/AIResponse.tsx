import React, { useState, useEffect, useRef } from 'react';
import { GeneratorSearchSource } from '../types';

interface AIResponseProps {
  response?: string;
  finalContent?: string | null;
  category?: string;
  isLoading?: boolean;
  status?: string;
  failureReason?: string;
  searchResults?: GeneratorSearchSource[];

  /** When true, renders content in email format with Send to User button. */
  emailFormat?: boolean;
  userName?: string;
  userEmail?: string | null;

  /** Chat with AI props (email format only) */
  showChat?: boolean;
  chatMessage?: string;
  onChatToggle?: () => void;
  onChatMessageChange?: (msg: string) => void;
  onSendChat?: () => void;
  isChatLoading?: boolean;
  chatError?: string | null;

  /** Send to User props */
  onSendToUser?: () => void;
  isSending?: boolean;
  sendSuccess?: boolean;
}

const FAILED_STATUSES = new Set(['failed', 'dlq']);

export const AIResponse: React.FC<AIResponseProps> = ({
  response,
  finalContent,
  category,
  isLoading,
  status,
  failureReason,
  searchResults,
  emailFormat = false,
  userName,
  userEmail,
  showChat = false,
  chatMessage = '',
  onChatToggle,
  onChatMessageChange,
  onSendChat,
  isChatLoading = false,
  chatError,
  onSendToUser,
  isSending = false,
  sendSuccess = false,
}) => {
  const isFailed = !!status && FAILED_STATUSES.has(status);
  const content = finalContent ?? response;
  const isRejected = finalContent === null;
  const isApproved = finalContent && finalContent !== response;

  // Editable body state for the email format
  const [editableBody, setEditableBody] = useState(content ?? '');
  const prevContentRef = useRef(content);
  useEffect(() => {
    if (content !== prevContentRef.current) {
      prevContentRef.current = content;
      setEditableBody(content ?? '');
    }
  }, [content]);

  const recipientLabel = userName
    ? userEmail
      ? `${userName} <${userEmail}>`
      : userName
    : userEmail ?? 'Customer';

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Card header — no Chat with AI button here anymore */}
      <h3 className="text-lg font-bold text-gray-900 mb-4">AI Response</h3>

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
          {emailFormat ? (
            /* ── Email-formatted display ── */
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              {/* Email header */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-14 shrink-0">To:</span>
                  <span className="text-gray-800 font-medium">{recipientLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-14 shrink-0">Subject:</span>
                  <span className="text-gray-800">Re: Your Support Request</span>
                </div>
              </div>

              {/* Email body — editable */}
              <div className="px-5 pt-4 pb-2 text-sm text-gray-800 leading-relaxed space-y-3">
                <p>Dear {userName ?? 'Customer'},</p>
                <textarea
                  value={editableBody}
                  onChange={(e) => setEditableBody(e.target.value)}
                  rows={Math.max(10, editableBody.split('\n').length + 1)}
                  className="w-full resize-none border border-gray-200 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <div className="pt-1 border-t border-gray-100 text-gray-600">
                  <p>Best regards,</p>
                  <p className="font-medium">Support Team</p>
                </div>
              </div>

              {/* Email footer: Chat with AI in bottom-right */}
              <div className="px-5 py-2 border-t border-gray-100 flex items-center gap-2">
                {/* Input expands to the LEFT of the button when chat is open */}
                {showChat && (
                  <div className="flex-1 flex items-start gap-2">
                    <textarea
                      value={chatMessage}
                      onChange={(e) => onChatMessageChange?.(e.target.value)}
                      placeholder="Tell AI how to improve the response..."
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-400 focus:outline-none"
                      rows={2}
                      disabled={isChatLoading}
                      autoFocus
                    />
                    <button
                      onClick={onSendChat}
                      disabled={isChatLoading || !chatMessage.trim()}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap"
                    >
                      {isChatLoading ? '...' : 'Send'}
                    </button>
                  </div>
                )}
                {chatError && showChat && (
                  <p className="text-red-600 text-xs">{chatError}</p>
                )}
                {onChatToggle && (
                  <button
                    onClick={onChatToggle}
                    className="ml-auto shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
                  >
                    {showChat ? '✕ Close' : '💬 Chat with AI'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Original scenario display ── */
            <>
              {category === 'faq' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-blue-600 mb-2">SCENARIO 1: FAQ Match</p>
                  <p className="text-sm text-gray-700">{content}</p>
                </div>
              )}
              {category === 'simple' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-green-600 mb-2">SCENARIO 2: Simple Filter</p>
                  <p className="text-sm text-gray-700">{content}</p>
                </div>
              )}
              {category === 'multi_agent' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-purple-600 mb-2">SCENARIO 3: Multi-Agent Processing</p>
                  <p className="text-sm text-gray-700">{content}</p>
                </div>
              )}
              {!category && !isRejected && !isApproved && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">Generated Response</p>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
                  </div>
                </div>
              )}
              {isApproved && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-xs font-medium text-green-600 mb-2">SCENARIO 4: Approved & Ready to Send</p>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
                  </div>
                </div>
              )}
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

          {/* Send to User button — small, left-aligned */}
          {emailFormat && onSendToUser && (
            <div className="mb-4">
              {sendSuccess ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs font-medium">
                  ✓ Sent to user
                </span>
              ) : (
                <button
                  onClick={onSendToUser}
                  disabled={isSending}
                  className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                >
                  {isSending ? 'Sending...' : '📨 Send to User'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Reference Links */}
      {searchResults && searchResults.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Reference Sources
          </p>
          <ul className="space-y-1">
            {searchResults.map((src, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-gray-400 text-xs font-medium min-w-[1.2rem]">
                  [{idx + 1}]
                </span>
                <div>
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {src.title}
                    </a>
                  ) : (
                    <span className="text-gray-700 font-medium">{src.title}</span>
                  )}
                  {src.excerpt && (
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{src.excerpt}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
