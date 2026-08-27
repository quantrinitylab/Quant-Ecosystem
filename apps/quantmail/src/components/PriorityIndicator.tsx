'use client';

import { useMemo } from 'react';
import { IconDot } from './icons';

interface PriorityIndicatorProps {
  email: {
    from?: { name?: string; email?: string };
    subject?: string;
    snippet?: string;
    isStarred?: boolean;
    hasAttachments?: boolean;
    isRead?: boolean;
  };
}

type PriorityLevel = 'critical' | 'high' | 'normal' | 'low';

/**
 * AI-style priority scoring indicator.
 * Displays a colored dot/bar showing email importance.
 * Gmail doesn't have this — we show signal strength for each email.
 */
export function PriorityIndicator({ email }: PriorityIndicatorProps) {
  const priority = useMemo(() => computePriority(email), [email]);

  if (priority === 'normal' || priority === 'low') return null;

  return (
    <span
      className={`priority-indicator priority-${priority} inline-flex`}
      role="img"
      aria-label={`${priority} priority`}
      title={`${priority} priority`}
    >
      {/*
       * The colour is the whole signal here, so the dot carries an explicit
       * tone rather than inheriting one: `.priority-critical` and
       * `.priority-high` never existed as CSS rules — the old 🔴/🟠 emoji were
       * supplying their own hue, which is exactly why they differed per
       * platform.
       */}
      <IconDot size={8} tone={priority === 'critical' ? '#F87171' : '#FF8C42'} />
    </span>
  );
}

function computePriority(email: PriorityIndicatorProps['email']): PriorityLevel {
  const combined = `${email.subject ?? ''} ${email.snippet ?? ''}`.toLowerCase();
  let score = 0;

  // Urgency signals
  if (combined.includes('urgent') || combined.includes('asap')) score += 3;
  if (combined.includes('action required') || combined.includes('immediate')) score += 3;
  if (combined.includes('deadline') || combined.includes('overdue')) score += 2;
  if (combined.includes('please respond') || combined.includes('waiting for your')) score += 2;
  if (combined.includes('important') || combined.includes('critical')) score += 2;

  // Personal signals (direct communication)
  if (email.from?.name && !email.from.name.includes('noreply')) score += 1;
  if (email.isStarred) score += 1;
  if (email.hasAttachments) score += 1;

  // Low priority signals
  if (combined.includes('unsubscribe') || combined.includes('newsletter')) score -= 2;
  if (combined.includes('noreply') || combined.includes('no-reply')) score -= 1;
  if (combined.includes('promotional') || combined.includes('deal')) score -= 2;

  if (score >= 4) return 'critical';
  if (score >= 2) return 'high';
  if (score <= -1) return 'low';
  return 'normal';
}
