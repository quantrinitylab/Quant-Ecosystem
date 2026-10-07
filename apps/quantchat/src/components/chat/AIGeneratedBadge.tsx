'use client';

import React from 'react';

// ============================================================================
// Task 12.8 (Requirement 11.8 / Property 33): AI-generated label.
//
// Every piece of AI-authored content in QuantChat MUST surface a visible
// "✨ AI-generated" badge so automated messages are distinguishable from
// user-authored ones. Render this badge wherever `isAIGenerated === true`.
// ============================================================================

export interface AIGeneratedBadgeProps {
  /** Size variant — `sm` for inline-with-bubbles, `md` for standalone rows. */
  size?: 'sm' | 'md';
  /** Optional override label (defaults to "AI-generated"). */
  label?: string;
  className?: string;
}

export function AIGeneratedBadge({
  size = 'sm',
  label = 'AI-generated',
  className = '',
}: AIGeneratedBadgeProps) {
  const sizeClasses =
    size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-0.5' : 'text-xs px-2 py-1 gap-1';

  return (
    <span
      data-ai-generated="true"
      role="note"
      aria-label={`This content is ${label}`}
      title={`This content is ${label}`}
      className={`inline-flex items-center rounded-full font-medium bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 text-violet-600 dark:text-violet-300 ring-1 ring-inset ring-violet-500/30 ${sizeClasses} ${className}`}
    >
      <span aria-hidden="true">{'\u2728'}</span>
      <span>{label}</span>
    </span>
  );
}

export default AIGeneratedBadge;
