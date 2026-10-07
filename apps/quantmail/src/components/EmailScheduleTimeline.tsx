'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { IconArrowRight, IconClock } from './icons';

interface ScheduledEmail {
  id: string;
  to: string;
  subject: string;
  scheduledAt: string;
}

interface EmailScheduleTimelineProps {
  scheduledEmails: ScheduledEmail[];
  onCancel: (id: string) => void;
  onEdit: (id: string) => void;
}

/**
 * Visual timeline of scheduled emails — shows upcoming sends in a timeline format.
 * Gmail buries scheduled emails in a hidden "Scheduled" folder.
 * We show them front-and-center in a beautiful visual timeline.
 */
export function EmailScheduleTimeline({
  scheduledEmails,
  onCancel,
  onEdit,
}: EmailScheduleTimelineProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, ScheduledEmail[]> = {};
    for (const email of scheduledEmails) {
      const date = new Date(email.scheduledAt);
      const key = date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(email);
    }
    return Object.entries(groups).sort(
      (a, b) => new Date(a[1][0].scheduledAt).getTime() - new Date(b[1][0].scheduledAt).getTime(),
    );
  }, [scheduledEmails]);

  if (scheduledEmails.length === 0) return null;

  return (
    <div className="schedule-timeline">
      <header className="schedule-timeline-header">
        <span className="schedule-timeline-icon">
          <IconClock size={13} />
        </span>
        <strong>Scheduled</strong>
        <span className="schedule-timeline-count">{scheduledEmails.length}</span>
      </header>
      <div className="schedule-timeline-body">
        {grouped.map(([date, emails]) => (
          <div key={date} className="schedule-timeline-group">
            <div className="schedule-timeline-date">{date}</div>
            {emails.map((email, idx) => (
              <motion.div
                key={email.id}
                className="schedule-timeline-item"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <div className="schedule-timeline-dot" />
                <div className="schedule-timeline-content">
                  <div className="schedule-timeline-meta">
                    <span className="schedule-timeline-time">
                      {new Date(email.scheduledAt).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="schedule-timeline-to">
                      <IconArrowRight size={11} />
                      {email.to}
                    </span>
                  </div>
                  <p className="schedule-timeline-subject">{email.subject}</p>
                  <div className="schedule-timeline-actions">
                    <button type="button" onClick={() => onEdit(email.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => onCancel(email.id)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
