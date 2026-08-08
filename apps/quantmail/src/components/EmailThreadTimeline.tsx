'use client';

import { useMemo } from 'react';
import { IdentityAvatar } from './IdentityAvatar';

interface TimelineEvent {
  id: string;
  type: 'sent' | 'received' | 'replied' | 'forwarded' | 'starred' | 'labeled';
  participant: { name?: string; email: string };
  timestamp: string;
  subject?: string;
}

interface EmailThreadTimelineProps {
  events: TimelineEvent[];
}

const EVENT_CONFIG: Record<TimelineEvent['type'], { icon: string; label: string; color: string }> = {
  sent: { icon: '📤', label: 'Sent', color: '#60a5fa' },
  received: { icon: '📥', label: 'Received', color: '#4ade80' },
  replied: { icon: '↩️', label: 'Replied', color: '#a78bfa' },
  forwarded: { icon: '➡️', label: 'Forwarded', color: '#fbbf24' },
  starred: { icon: '⭐', label: 'Starred', color: '#ffb547' },
  labeled: { icon: '🏷️', label: 'Labeled', color: '#ec4899' },
};

/**
 * Thread activity timeline — shows a chronological view of all thread events.
 * GitHub has this for issues/PRs (timeline of comments, commits, labels).
 * We bring the same concept to email threads — showing every interaction
 * (sent, received, replied, forwarded, starred) in a visual timeline.
 */
export function EmailThreadTimeline({ events }: EmailThreadTimelineProps) {
  if (!events || events.length === 0) return null;

  return (
    <div className="thread-timeline">
      <h3 className="thread-timeline-title">Thread activity</h3>
      <div className="thread-timeline-track">
        {events.map((event) => {
          const config = EVENT_CONFIG[event.type];
          return (
            <div key={event.id} className="thread-timeline-event">
              <div className="timeline-event-dot" style={{ borderColor: config.color }} />
              <div className="timeline-event-content">
                <div className="timeline-event-header">
                  <IdentityAvatar name={event.participant.name || event.participant.email} size="sm" />
                  <span className="timeline-event-name">
                    {event.participant.name || event.participant.email}
                  </span>
                  <span className="timeline-event-action">{config.label.toLowerCase()}</span>
                  <time className="timeline-event-time">
                    {new Date(event.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
