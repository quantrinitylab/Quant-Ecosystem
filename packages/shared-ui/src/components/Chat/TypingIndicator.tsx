'use client';

// ============================================================================
// Shared UI - Typing Indicator Component
// ============================================================================

import React from 'react';
import { useReducedMotion } from 'framer-motion';

export interface TypingIndicatorProps {
  users: string[];
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ users, className = '' }) => {
  const prefersReducedMotion = useReducedMotion();

  if (users.length === 0) return null;

  const getText = (): string => {
    if (users.length === 1) return `${users[0]} is typing`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing`;
    return `${users[0]} and ${users.length - 1} others are typing`;
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-2 ${className}`}>
      <div className="flex gap-1">
        <span
          className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
          style={prefersReducedMotion ? undefined : { animationDelay: '0ms' }}
        />
        <span
          className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
          style={prefersReducedMotion ? undefined : { animationDelay: '150ms' }}
        />
        <span
          className={`w-2 h-2 bg-gray-400 rounded-full${prefersReducedMotion ? '' : ' animate-bounce'}`}
          style={prefersReducedMotion ? undefined : { animationDelay: '300ms' }}
        />
      </div>
      <span className="text-xs text-gray-500 italic">{getText()}</span>
    </div>
  );
};
