'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { IconCalendar, IconClock } from './icons';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
}

interface CalendarMiniWidgetProps {
  events: CalendarEvent[];
  onOpenCalendar: () => void;
  onJoinMeeting?: (eventId: string) => void;
}

/**
 * Calendar Mini Widget — shows today's upcoming events in the sidebar/inbox.
 * Google Calendar requires switching apps. We surface today's schedule
 * directly in the mail workspace so you never miss a meeting.
 */
export function CalendarMiniWidget({
  events,
  onOpenCalendar,
  onJoinMeeting,
}: CalendarMiniWidgetProps) {
  const todayEvents = useMemo(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return events
      .filter((e) => {
        const start = new Date(e.startTime);
        return start >= now && start <= endOfDay;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 4);
  }, [events]);

  const nextEvent = todayEvents[0];
  const timeUntilNext = nextEvent
    ? Math.round((new Date(nextEvent.startTime).getTime() - Date.now()) / (1000 * 60))
    : null;

  if (todayEvents.length === 0) return null;

  return (
    <motion.div
      className="cal-mini-widget"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <header className="cal-mini-header" onClick={onOpenCalendar}>
        <span className="cal-mini-icon inline-flex">
          <IconCalendar size={13} />
        </span>
        <strong>Today</strong>
        <span className="cal-mini-count">
          {todayEvents.length} event{todayEvents.length > 1 ? 's' : ''}
        </span>
      </header>

      {timeUntilNext !== null && timeUntilNext <= 30 && timeUntilNext > 0 && (
        <div className="cal-mini-alert">
          <IconClock size={12} />
          Next meeting in {timeUntilNext} min
        </div>
      )}

      <div className="cal-mini-events">
        {todayEvents.map((event) => (
          <div key={event.id} className="cal-mini-event">
            <div className="cal-mini-time-bar" />
            <div className="cal-mini-event-info">
              <span className="cal-mini-event-time">
                {new Date(event.startTime).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="cal-mini-event-title">{event.title}</span>
            </div>
            {onJoinMeeting && (
              <button
                type="button"
                className="cal-mini-join"
                onClick={() => onJoinMeeting(event.id)}
              >
                Join
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
