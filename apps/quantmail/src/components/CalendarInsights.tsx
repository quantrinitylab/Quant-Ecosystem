'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { IconCalendar, IconChart, IconClock, IconHeart, IconSparkle } from './icons';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface CalendarInsightsProps {
  events: CalendarEvent[] | undefined;
  selectedDay: number;
  month: number;
  year: number;
}

/**
 * AI Calendar Insights — shows "free time" analysis and meeting density.
 * Google Calendar doesn't have this — you have to visually scan for gaps.
 * We tell you at a glance: "Your busiest day is Tuesday. Wednesday afternoon is free."
 */
export function CalendarInsights({ events, selectedDay, month, year }: CalendarInsightsProps) {
  const insights = useMemo(() => {
    if (!events || events.length === 0) return null;

    // Count events per day of week
    const dayOfWeekCounts: Record<string, number> = {
      Sun: 0,
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
    };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const event of events) {
      const dow = new Date(event.startTime).getDay();
      dayOfWeekCounts[dayNames[dow]] += 1;
    }

    const busiestDay = Object.entries(dayOfWeekCounts).sort((a, b) => b[1] - a[1])[0];
    const freestDay = Object.entries(dayOfWeekCounts).sort((a, b) => a[1] - b[1])[0];

    // Check selected day events
    const selectedDayEvents = events.filter((e) => new Date(e.startTime).getDate() === selectedDay);

    // Hours occupied on selected day
    let hoursOccupied = 0;
    for (const e of selectedDayEvents) {
      const start = new Date(e.startTime).getTime();
      const end = new Date(e.endTime).getTime();
      hoursOccupied += (end - start) / (1000 * 60 * 60);
    }
    const hoursAvailable = Math.max(0, 8 - hoursOccupied); // Assume 8hr workday

    return {
      totalEvents: events.length,
      busiestDay: busiestDay[1] > 0 ? busiestDay[0] : null,
      freestDay: freestDay[0],
      selectedDayEventCount: selectedDayEvents.length,
      hoursAvailable: Math.round(hoursAvailable * 10) / 10,
    };
  }, [events, selectedDay]);

  if (!insights || insights.totalEvents < 2) return null;

  return (
    <motion.div
      className="calendar-insights"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
    >
      <div className="calendar-insights-header">
        <span className="calendar-insights-icon inline-flex" aria-hidden="true">
          <IconSparkle size={12} />
        </span>
        <strong>Calendar Intelligence</strong>
      </div>
      <div className="calendar-insights-chips">
        {insights.busiestDay && (
          <span className="cal-chip cal-chip--busy inline-flex items-center gap-1">
            <IconChart size={11} />
            Busiest: {insights.busiestDay}
          </span>
        )}
        <span className="cal-chip cal-chip--free inline-flex items-center gap-1">
          <IconHeart size={11} />
          Freest: {insights.freestDay}
        </span>
        <span className="cal-chip cal-chip--hours inline-flex items-center gap-1">
          <IconClock size={11} />
          {insights.hoursAvailable}h free today
        </span>
        <span className="cal-chip cal-chip--count inline-flex items-center gap-1">
          <IconCalendar size={11} />
          {insights.totalEvents} events this month
        </span>
      </div>
    </motion.div>
  );
}
