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

function TimelineEventIcon({ type }: { type: TimelineEvent['type'] }) {
  switch (type) {
    case 'sent':
      return (
        <svg
          className="size-3 text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" x2="11" y1="2" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      );
    case 'received':
      return (
        <svg
          className="size-3 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        </svg>
      );
    case 'replied':
      return (
        <svg
          className="size-3 text-purple-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </svg>
      );
    case 'forwarded':
      return (
        <svg
          className="size-3 text-amber-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 14 20 9 15 4" />
          <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
        </svg>
      );
    case 'starred':
      return (
        <svg className="size-3 text-[#FF8C42]" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'labeled':
    default:
      return (
        <svg
          className="size-3 text-pink-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <path d="M7 7h.01" />
        </svg>
      );
  }
}

const EVENT_CONFIG: Record<TimelineEvent['type'], { label: string; color: string }> = {
  sent: { label: 'Sent', color: '#60a5fa' },
  received: { label: 'Received', color: '#4ade80' },
  replied: { label: 'Replied', color: '#a78bfa' },
  forwarded: { label: 'Forwarded', color: '#fbbf24' },
  starred: { label: 'Starred', color: '#ffb547' },
  labeled: { label: 'Labeled', color: '#ec4899' },
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
                <div className="timeline-event-header flex items-center gap-1.5">
                  <TimelineEventIcon type={event.type} />
                  <IdentityAvatar
                    name={event.participant.name || event.participant.email}
                    size="sm"
                  />
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
