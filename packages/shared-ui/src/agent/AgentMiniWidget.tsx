'use client';

// ============================================================================
// Shared UI - AgentMiniWidget Component
// ============================================================================

import React from 'react';
import { useReducedMotion } from 'framer-motion';

export interface AgentMiniWidgetProps {
  runningCount: number;
  hasApprovalsPending: boolean;
  onClick: () => void;
}

export const AgentMiniWidget: React.FC<AgentMiniWidgetProps> = ({
  runningCount,
  hasApprovalsPending,
  onClick,
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-gray-200 hover:shadow-xl transition-shadow"
      aria-label={`Agent widget: ${runningCount} running${hasApprovalsPending ? ', approvals pending' : ''}`}
    >
      <span className="text-sm font-medium text-gray-900">{runningCount}</span>
      <span className="text-xs text-gray-500">agents</span>
      {hasApprovalsPending && (
        <span
          className={`w-2.5 h-2.5 rounded-full bg-red-500${prefersReducedMotion ? '' : ' animate-pulse'}`}
          aria-label="Approvals pending"
        />
      )}
    </button>
  );
};
