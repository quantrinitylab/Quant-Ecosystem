// ============================================================================
// QuantLive - Action Chip Component
// ============================================================================

import React from 'react';
import type { QuantLiveActionChipProps } from './types';

export const QuantLiveActionChip: React.FC<QuantLiveActionChipProps> = ({
  action,
  className = '',
}) => {
  if (!action) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-sm text-gray-700 ${className}`}
    >
      {action.icon && <span aria-hidden="true">{action.icon}</span>}
      <span>{action.label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        <span
          className="w-1 h-1 rounded-full bg-gray-500 animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-gray-500 animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-1 h-1 rounded-full bg-gray-500 animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: '300ms' }}
        />
      </span>
    </div>
  );
};
