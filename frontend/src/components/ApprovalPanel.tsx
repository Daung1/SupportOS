import React, { useState } from 'react';
import { useApproveTicket, useRejectTicket, useChatWithAI } from '../hooks/useSWRApi';

interface ApprovalPanelProps {
  ticketId: string;
  currentContent?: string;
  requiresReview?: boolean;
  approvalStatus?: string;
  onApprovalStatusChange?: () => void;
}

export const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  ticketId,
  currentContent,
  requiresReview,
  approvalStatus,
  onApprovalStatusChange,
}) => {
  const [editedContent, setEditedContent] = useState(currentContent || '');
  const [chatMessage, setChatMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [approverName, setApproverName] = useState('');

  const { approve, isLoading: isApproving, error: approveError } = useApproveTicket();
  const { reject, isLoading: isRejecting, error: rejectError } = useRejectTicket();
  const { chat, isLoading: isChating, error: chatError } = useChatWithAI();

  const isAlreadyApproved = approvalStatus === 'approved' || approvalStatus === 'rejected';

  const handleApprove = async () => {
    if (!approverName.trim()) {
      alert('Please enter your name');
      return;
    }

    try {
      await approve({
        ticketId,
        data: {
          approvedBy: approverName,
          editedContent: editedContent !== currentContent ? editedContent : undefined,
        },
      });
      onApprovalStatusChange?.();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      await reject({
        ticketId,
        data: { reason },
      });
      onApprovalStatusChange?.();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const handleChat = async () => {
    if (!chatMessage.trim()) return;

    try {
      const response = await chat({
        ticketId,
        data: { message: chatMessage },
      });
      setEditedContent(response.response);
      setChatMessage('');
      setShowChat(false);
    } catch (err) {
      console.error('Failed to chat:', err);
    }
  };

  if (isAlreadyApproved) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Approval Status</h3>
        <div
          className={`p-4 rounded-lg ${
            approvalStatus === 'approved'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`font-medium ${
              approvalStatus === 'approved'
                ? 'text-green-900'
                : 'text-red-900'
            }`}
          >
            {approvalStatus === 'approved'
              ? '✓ Approved'
              : '✗ Rejected'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">
        {requiresReview ? 'Manual Review Required' : 'Approval'}
      </h3>

      {/* Approver Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Your Name
        </label>
        <input
          type="text"
          value={approverName}
          onChange={(e) => setApproverName(e.target.value)}
          placeholder="Enter your name"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          disabled={isApproving || isRejecting}
        />
      </div>

      {/* Content Edit */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Content to Send
        </label>
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          rows={6}
          disabled={isApproving || isRejecting}
        />
      </div>

      {/* Errors */}
      {(approveError || rejectError || chatError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {approveError?.toString() || rejectError?.toString() || chatError?.toString()}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={isApproving || isRejecting || !approverName.trim()}
          className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isApproving ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={isApproving || isRejecting}
          className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Chat with AI
        </button>
      </div>

      {/* Chat with AI */}
      {showChat && (
        <div className="mt-4 pt-4 border-t">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ask AI to refine the response
          </label>
          <textarea
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            placeholder="Tell AI how to improve the response..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            rows={3}
            disabled={isChating}
          />
          <button
            onClick={handleChat}
            disabled={isChating || !chatMessage.trim()}
            className="mt-2 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {isChating ? 'Refining...' : 'Refine'}
          </button>
        </div>
      )}
    </div>
  );
};
