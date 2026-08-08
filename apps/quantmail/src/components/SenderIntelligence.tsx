'use client';

import { useMemo } from 'react';

interface SenderIntelligenceProps {
  senderEmail: string;
  senderName?: string;
  /** Total emails received from this sender */
  totalReceived?: number;
  /** Total emails sent to this sender */
  totalSent?: number;
  /** Last interaction timestamp */
  lastInteraction?: string;
  /** Average response time in hours */
  avgResponseTime?: number;
}

/**
 * Sender Intelligence Card — shown in the reading pane header.
 * Provides at-a-glance relationship context:
 * - How many emails exchanged
 * - Last interaction
 * - Your average response time
 * 
 * Gmail only shows sender name + email. We show the full relationship context.
 */
export function SenderIntelligence({
  senderEmail,
  senderName,
  totalReceived = 0,
  totalSent = 0,
  lastInteraction,
  avgResponseTime,
}: SenderIntelligenceProps) {
  const interactionLevel = useMemo(() => {
    const total = totalReceived + totalSent;
    if (total >= 50) return { label: 'Frequent', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.08)' };
    if (total >= 20) return { label: 'Regular', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.08)' };
    if (total >= 5) return { label: 'Occasional', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' };
    return { label: 'New', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.08)' };
  }, [totalReceived, totalSent]);

  const lastInteractionText = useMemo(() => {
    if (!lastInteraction) return null;
    const date = new Date(lastInteraction);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }, [lastInteraction]);

  if (totalReceived + totalSent === 0) return null;

  return (
    <div className="sender-intelligence">
      <div className="si-badge" style={{ background: interactionLevel.bg, color: interactionLevel.color }}>
        {interactionLevel.label}
      </div>
      <div className="si-stats">
        <span className="si-stat">
          <strong>{totalReceived + totalSent}</strong> emails exchanged
        </span>
        {lastInteractionText && (
          <span className="si-stat si-stat--muted">
            Last: {lastInteractionText}
          </span>
        )}
        {avgResponseTime !== undefined && avgResponseTime > 0 && (
          <span className="si-stat si-stat--muted">
            Avg reply: {avgResponseTime < 1 ? `${Math.round(avgResponseTime * 60)}m` : `${Math.round(avgResponseTime)}h`}
          </span>
        )}
      </div>
    </div>
  );
}
