// ============================================================================
// Shared UI - ApprovalDialog Component
// ============================================================================

import React from 'react';

export interface ApprovalRequest {
  id: string;
  agentName: string;
  action: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  timeoutMs: number;
}

export interface ApprovalDialogProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  open: boolean;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  request,
  onApprove,
  onReject,
  open,
}) => {
  if (!open) return null;

  const riskColors: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-dialog-title"
    >
      <div className="absolute inset-0 bg-black bg-opacity-50" aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 id="approval-dialog-title" className="text-lg font-semibold text-gray-900 mb-4">
          Permission Request
        </h2>

        <div className="space-y-3 mb-6">
          <div>
            <span className="text-sm text-gray-500">Agent:</span>
            <p className="text-sm font-medium text-gray-900">{request.agentName}</p>
          </div>

          <div>
            <span className="text-sm text-gray-500">Action:</span>
            <p className="text-sm text-gray-900">{request.action}</p>
          </div>

          <div>
            <span className="text-sm text-gray-500">Risk Level:</span>
            <span
              className={`ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded-full ${riskColors[request.riskLevel]}`}
            >
              {request.riskLevel}
            </span>
          </div>

          <div>
            <span className="text-sm text-gray-500">Timeout:</span>
            <span className="ml-2 text-sm text-gray-900">
              {Math.round(request.timeoutMs / 1000)}s
            </span>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};
