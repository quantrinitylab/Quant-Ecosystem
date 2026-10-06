'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { CalendarEventLike, EntryType } from '../app/calendar/types';
import { MONTH_NAMES, FULL_WEEKDAYS } from '../app/calendar/types';
import { dayKey, startOf, endOf, hhmm } from '../app/calendar/lib/calendar-geometry';
import type { Holiday } from '../lib/holidays';
import { showToast } from './InboxToast';
import {
  CalendarWeekView,
  type WeekViewSheetOpts,
} from '../app/calendar/components/CalendarWeekView';

// ============================================================================
// SVG Vector Icons — strictly ZERO raw Unicode emojis
// ============================================================================

function SvgCalendar({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SvgClock({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SvgGlobe({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function SvgCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function SvgCircle({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function SvgCheckSquare({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SvgSquare({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function SvgPlus({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SvgChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SvgChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SvgPulse({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SvgHeart({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function SvgDroplet({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function SvgMoon({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SvgSun({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function SvgShieldEye({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

function SvgBell({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SvgSnooze({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 8 14" />
      <path d="M16 8h4l-4 4h4" />
    </svg>
  );
}

function SvgTrash({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function SvgFlag({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// ============================================================================
// SUB-VIEW 1: Feed (CalendarFeedSubView)
// Chronological date feed of upcoming meetings, tasks, and tracker milestones
// ============================================================================

export interface CalendarFeedSubViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  searchFilter?: string;
  className?: string;
}

export function CalendarFeedSubView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  searchFilter = '',
  className = '',
}: CalendarFeedSubViewProps) {
  const [filterType, setFilterType] = useState<'all' | 'meetings' | 'tasks' | 'trackers' | 'holidays'>('all');

  // Group events by dayKey
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEventLike[]> = {};
    for (const ev of events) {
      const d = startOf(ev);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      map[k] = [...(map[k] ?? []), ev];
    }
    return map;
  }, [events]);

  // Build continuous feed days: past 3 days to future 30 days
  const feedDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Array<{
      date: Date;
      key: string;
      isToday: boolean;
      isTomorrow: boolean;
      dayLabel: string;
      dateLabel: string;
      events: CalendarEventLike[];
      holidays: Holiday[];
      milestones: Array<{ id: string; title: string; type: string; subtitle: string; tone: string }>;
    }> = [];

    for (let offset = -2; offset <= 30; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      const k = dayKey(d);
      const isToday = offset === 0;
      const isTomorrow = offset === 1;

      let dayLabel = FULL_WEEKDAYS[d.getDay()];
      if (isToday) dayLabel = 'Today';
      else if (isTomorrow) dayLabel = 'Tomorrow';

      const dateLabel = `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
      const dayEvs = (eventsByDay[k] || []).filter((ev) => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return ev.title.toLowerCase().includes(q) || (ev.location || '').toLowerCase().includes(q);
      });

      const dayHols = holidaysByDay[k] || [];

      // Synthetic tracker milestones for cycle predictions & health checkpoints
      const milestones: Array<{ id: string; title: string; type: string; subtitle: string; tone: string }> = [];
      if (offset === 0) {
        milestones.push({
          id: `ms-${k}-1`,
          title: 'Daily Wellness & Steps Milestone',
          type: 'health',
          subtitle: 'Target: 10,000 steps · Hydration: 2.5L',
          tone: 'emerald',
        });
      } else if (offset === 5) {
        milestones.push({
          id: `ms-${k}-2`,
          title: 'Predicted Cycle Phase: Luteal',
          type: 'period',
          subtitle: 'Estimated cycle day 21 · High progesterone window',
          tone: 'rose',
        });
      } else if (offset === 12) {
        milestones.push({
          id: `ms-${k}-3`,
          title: 'Quarterly Passport / Visa Audit',
          type: 'life',
          subtitle: 'Life Tracker Countdown: 12 days remaining',
          tone: 'sky',
        });
      }

      // Filter check
      const hasMeetings = dayEvs.some((e) => !e.type || e.type === 'event');
      const hasTasks = dayEvs.some((e) => e.type === 'task');
      const hasTrackerEvents = dayEvs.some((e) => e.type === 'period' || e.type === 'birthday') || milestones.length > 0;
      const hasHolidays = dayHols.length > 0;

      let include = false;
      if (filterType === 'all') include = true;
      else if (filterType === 'meetings' && hasMeetings) include = true;
      else if (filterType === 'tasks' && hasTasks) include = true;
      else if (filterType === 'trackers' && hasTrackerEvents) include = true;
      else if (filterType === 'holidays' && hasHolidays) include = true;

      if (include && (dayEvs.length > 0 || dayHols.length > 0 || milestones.length > 0 || isToday)) {
        days.push({
          date: d,
          key: k,
          isToday,
          isTomorrow,
          dayLabel,
          dateLabel,
          events: dayEvs,
          holidays: dayHols,
          milestones,
        });
      }
    }
    return days;
  }, [eventsByDay, holidaysByDay, searchFilter, filterType]);

  return (
    <div className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}>
      {/* Feed Filters Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232938] pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
            Chronological Feed
          </span>
          <span className="text-xs text-[#A1A4AC]">·</span>
          <span className="text-xs text-[#A1A4AC]">
            {feedDays.length} active date groups
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['all', 'meetings', 'tasks', 'trackers', 'holidays'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterType(mode)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filterType === mode
                  ? 'bg-[#F59E0B] text-black font-semibold shadow-sm'
                  : 'bg-[#12151E] text-[#A1A4AC] hover:text-white border border-[#232938]'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Feed List */}
      <div className="space-y-6">
        {feedDays.map((day) => {
          const isSelected = dayKey(selectedDate) === day.key;

          return (
            <div
              key={day.key}
              onClick={() => onSelectDate(day.date)}
              className={`rounded-2xl border transition-all p-4 sm:p-5 ${
                isSelected
                  ? 'border-[#F59E0B]/50 bg-[#12151E] shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                  : 'border-[#232938] bg-[#12151E]/60 hover:bg-[#12151E]'
              }`}
            >
              {/* Day Header Row */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#232938]/60">
                <div className="flex items-center gap-3">
                  <div
                    className={`size-9 rounded-xl grid place-items-center text-sm font-bold ${
                      day.isToday
                        ? 'bg-[#F59E0B] text-black shadow-sm'
                        : 'bg-[#181C26] text-[#F5F5F5] border border-[#232938]'
                    }`}
                  >
                    {day.date.getDate()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F5F5F5] flex items-center gap-2">
                      <span>{day.dayLabel}</span>
                      <span className="text-xs font-normal text-[#A1A4AC]">{day.dateLabel}</span>
                    </h3>
                    <p className="text-[11px] text-[#A1A4AC]">
                      {day.events.length} entries · {day.holidays.length} holidays · {day.milestones.length} milestones
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDedicatedSheet('event', day.date);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#F59E0B] bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 border border-[#F59E0B]/30 flex items-center gap-1 transition-colors"
                >
                  <SvgPlus className="size-3 text-[#F59E0B]" />
                  <span>Add</span>
                </button>
              </div>

              {/* Day Entries List */}
              <div className="space-y-2.5">
                {/* Holidays */}
                {day.holidays.map((h, hIdx) => (
                  <div
                    key={`${h.name}-${hIdx}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] text-xs font-medium"
                  >
                    <SvgFlag className="size-3.5 text-[#F59E0B] shrink-0" />
                    <span className="font-semibold">{h.name}</span>
                    <span className="text-[10px] text-[#A1A4AC]">National Holiday</span>
                  </div>
                ))}

                {/* Tracker Milestones */}
                {day.milestones.map((ms) => (
                  <div
                    key={ms.id}
                    className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-xs ${
                      ms.tone === 'rose'
                        ? 'bg-rose-950/20 border-rose-800/40 text-rose-200'
                        : ms.tone === 'emerald'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                        : 'bg-sky-950/20 border-sky-800/40 text-sky-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <SvgPulse className="size-4 shrink-0" />
                      <div>
                        <span className="font-semibold">{ms.title}</span>
                        <p className="text-[11px] opacity-80">{ms.subtitle}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-black/40 border border-white/10">
                      Milestone
                    </span>
                  </div>
                ))}

                {/* Regular Calendar Events & Tasks */}
                {day.events.map((ev) => {
                  const isTask = ev.type === 'task';
                  const isPeriod = ev.type === 'period';
                  const isBirthday = ev.type === 'birthday';
                  const sD = startOf(ev);
                  const eD = endOf(ev);
                  const timeStr = ev.allDay ? 'All Day' : `${hhmm(sD)} – ${hhmm(eD)}`;

                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      className="group flex items-start justify-between gap-3 p-3 rounded-xl bg-[#0B0D13] hover:bg-[#151922] border border-[#232938] hover:border-[#384156] transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Event Category Icon Badge */}
                        <div
                          className="size-7 rounded-lg grid place-items-center mt-0.5 shrink-0"
                          style={{
                            backgroundColor: `${ev.color || '#F59E0B'}20`,
                            color: ev.color || '#F59E0B',
                          }}
                        >
                          {isTask ? (
                            <SvgCheckCircle className="size-3.5" />
                          ) : isPeriod ? (
                            <SvgDroplet className="size-3.5 text-rose-400" />
                          ) : isBirthday ? (
                            <SvgHeart className="size-3.5 text-emerald-400" />
                          ) : (
                            <SvgCalendar className="size-3.5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-[#F5F5F5] group-hover:text-[#F59E0B] transition-colors truncate">
                            {ev.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-[#A1A4AC] mt-0.5">
                            <span className="font-mono">{timeStr}</span>
                            {ev.location && (
                              <>
                                <span>·</span>
                                <span className="truncate">{ev.location}</span>
                              </>
                            )}
                            {ev.priority && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                                  ev.priority === 'urgent'
                                    ? 'bg-rose-900/40 text-rose-300'
                                    : 'bg-amber-900/40 text-amber-300'
                                }`}
                              >
                                {ev.priority}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Attendee Badges / Action */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {Array.isArray(ev.attendees) && ev.attendees.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#181C26] text-[#A1A4AC] border border-[#232938]">
                            {ev.attendees.length} invited
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {day.events.length === 0 && day.holidays.length === 0 && day.milestones.length === 0 && (
                  <div className="py-4 text-center text-xs text-[#A1A4AC]/60 bg-[#0B0D13]/40 rounded-xl border border-dashed border-[#232938]/60">
                    No scheduled items · Free day
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// SUB-VIEW 2: Month (CalendarMonthSubView)
// Continuous scroll calendar with week-by-week sliding navigation & active day highlight
// ============================================================================

export interface CalendarMonthSubViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  className?: string;
}

const MON_SUN_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarMonthSubView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  className = '',
}: CalendarMonthSubViewProps) {
  const [viewDate, setViewDate] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handlePrevWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() - 7);
    onSelectDate(next);
    setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const handleNextWeek = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 7);
    onSelectDate(next);
    setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    onSelectDate(now);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Group events by day key
  const eventsByDayKey = useMemo(() => {
    const map: Record<string, CalendarEventLike[]> = {};
    for (const ev of events) {
      const d = startOf(ev);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      map[k] = [...(map[k] ?? []), ev];
    }
    return map;
  }, [events]);

  // Build Monday-first month grid (Mon = 0, Sun = 6)
  const monthWeeks = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    const firstDayIndex = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const weeks: Array<
      Array<{
        date: Date;
        dayNum: number;
        key: string;
        isCurrentMonth: boolean;
        isToday: boolean;
        isSelected: boolean;
        events: CalendarEventLike[];
        holidays: Holiday[];
      }>
    > = [];

    let currentWeek: Array<{
      date: Date;
      dayNum: number;
      key: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEventLike[];
      holidays: Holiday[];
    }> = [];

    const now = new Date();
    const todayKey = dayKey(now);
    const selectedKey = dayKey(selectedDate);

    // Leading days from previous month
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = 0; i < firstDayIndex; i++) {
      const dayNum = prevMonthLastDay - firstDayIndex + 1 + i;
      const d = new Date(viewYear, viewMonth - 1, dayNum);
      const k = dayKey(d);
      currentWeek.push({
        date: d,
        dayNum,
        key: k,
        isCurrentMonth: false,
        isToday: k === todayKey,
        isSelected: k === selectedKey,
        events: eventsByDayKey[k] || [],
        holidays: holidaysByDay[k] || [],
      });
    }

    // Days of current month
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const d = new Date(viewYear, viewMonth, dayNum);
      const k = dayKey(d);
      currentWeek.push({
        date: d,
        dayNum,
        key: k,
        isCurrentMonth: true,
        isToday: k === todayKey,
        isSelected: k === selectedKey,
        events: eventsByDayKey[k] || [],
        holidays: holidaysByDay[k] || [],
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Trailing days from next month
    if (currentWeek.length > 0) {
      let nextDayNum = 1;
      while (currentWeek.length < 7) {
        const d = new Date(viewYear, viewMonth + 1, nextDayNum);
        const k = dayKey(d);
        currentWeek.push({
          date: d,
          dayNum: nextDayNum,
          key: k,
          isCurrentMonth: false,
          isToday: k === todayKey,
          isSelected: k === selectedKey,
          events: eventsByDayKey[k] || [],
          holidays: holidaysByDay[k] || [],
        });
        nextDayNum++;
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [viewYear, viewMonth, selectedDate, eventsByDayKey, holidaysByDay]);

  const selectedDayEvents = eventsByDayKey[dayKey(selectedDate)] || [];
  const selectedDayHolidays = holidaysByDay[dayKey(selectedDate)] || [];

  return (
    <div className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}>
      {/* Month Toolbar & Steppers */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151E] border border-[#232938] rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-xl border border-[#232938] text-[#A1A4AC] hover:text-white hover:bg-[#181C26] transition-colors"
            >
              <SvgChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-xl border border-[#232938] text-[#A1A4AC] hover:text-white hover:bg-[#181C26] transition-colors"
            >
              <SvgChevronRight className="size-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-[#F5F5F5] tracking-tight">
            <span>{MONTH_NAMES[viewMonth]}</span>{' '}
            <span className="text-[#A1A4AC] font-normal">{viewYear}</span>
          </h2>

          <button
            type="button"
            onClick={handleGoToday}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[#232938] bg-[#181C26] hover:bg-[#202534] text-[#F5F5F5] transition-colors"
          >
            Today
          </button>
        </div>

        {/* Week-by-Week Sliding Stepper */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#A1A4AC] font-medium hidden sm:inline">Week Sliding:</span>
          <div className="inline-flex rounded-xl border border-[#232938] bg-[#0B0D13] p-0.5">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#A1A4AC] hover:text-white hover:bg-[#181C26] transition-colors"
            >
              ‹ Prev Week
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#A1A4AC] hover:text-white hover:bg-[#181C26] transition-colors"
            >
              Next Week ›
            </button>
          </div>
        </div>
      </div>

      {/* Month Calendar Grid (Mon-Sun) */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-4 sm:p-5 shadow-sm space-y-2">
        {/* Weekday Columns Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-[#A1A4AC] py-2 border-b border-[#232938]">
          {MON_SUN_WEEKDAYS.map((wd) => (
            <div key={wd}>{wd}</div>
          ))}
        </div>

        {/* Weeks Matrix */}
        <div className="space-y-1">
          {monthWeeks.map((week, wIdx) => (
            <div key={`w-${wIdx}`} className="grid grid-cols-7 gap-1.5">
              {week.map((day) => {
                const totalItems = day.events.length + day.holidays.length;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => onSelectDate(day.date)}
                    className={`min-h-16 sm:min-h-20 p-1.5 rounded-xl border flex flex-col justify-between text-left transition-all ${
                      day.isSelected
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10 ring-2 ring-[#F59E0B]/30'
                        : day.isToday
                        ? 'border-[#384156] bg-[#181C26]'
                        : day.isCurrentMonth
                        ? 'border-[#232938]/60 bg-[#0B0D13]/70 hover:bg-[#181C26]'
                        : 'border-transparent bg-transparent opacity-35 hover:opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`size-6 rounded-lg text-xs font-bold grid place-items-center ${
                          day.isToday
                            ? 'bg-[#F59E0B] text-black shadow-sm'
                            : day.isSelected
                            ? 'text-[#F59E0B]'
                            : day.isCurrentMonth
                            ? 'text-[#F5F5F5]'
                            : 'text-[#A1A4AC]'
                        }`}
                      >
                        {day.dayNum}
                      </span>

                      {totalItems > 0 && (
                        <span className="size-2 rounded-full bg-[#F59E0B] animate-pulse" />
                      )}
                    </div>

                    {/* Compact Badges in Day Cell */}
                    <div className="space-y-1 w-full mt-1">
                      {day.holidays.slice(0, 1).map((h) => (
                        <div
                          key={h.name}
                          className="truncate text-[10px] px-1 py-0.2 rounded bg-[#F59E0B]/20 text-[#F59E0B] font-medium"
                          title={h.name}
                        >
                          {h.name}
                        </div>
                      ))}
                      {day.events.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className="truncate text-[10px] px-1 py-0.2 rounded font-medium"
                          style={{
                            backgroundColor: `${ev.color || '#F59E0B'}25`,
                            color: ev.color || '#F59E0B',
                          }}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {totalItems > 3 && (
                        <span className="text-[9px] text-[#A1A4AC] block text-right font-mono">
                          +{totalItems - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Inspector */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
              Selected Date Inspector
            </span>
            <span className="text-xs text-[#A1A4AC]">·</span>
            <span className="text-xs font-medium text-[#F5F5F5]">
              {FULL_WEEKDAYS[selectedDate.getDay()]}, {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => openDedicatedSheet('event', selectedDate)}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-black bg-[#F59E0B] hover:bg-[#D97706] shadow-sm flex items-center gap-1 transition-all"
          >
            <SvgPlus className="size-3 text-black" />
            <span>Add Event</span>
          </button>
        </div>

        {selectedDayEvents.length === 0 && selectedDayHolidays.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#A1A4AC]/60 bg-[#0B0D13] rounded-xl border border-dashed border-[#232938]">
            No entries scheduled for this day
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayHolidays.map((h) => (
              <div
                key={h.name}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B] text-xs font-medium"
              >
                <SvgFlag className="size-3.5" />
                <span>{h.name} (Public Holiday)</span>
              </div>
            ))}
            {selectedDayEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => onSelectEvent(ev)}
                className="flex items-center justify-between p-3 rounded-xl bg-[#0B0D13] border border-[#232938] hover:border-[#384156] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-2 rounded-full" style={{ backgroundColor: ev.color || '#F59E0B' }} />
                  <div>
                    <h4 className="text-xs font-semibold text-[#F5F5F5]">{ev.title}</h4>
                    <p className="text-[11px] text-[#A1A4AC]">
                      {ev.allDay ? 'All Day' : `${hhmm(startOf(ev))} – ${hhmm(endOf(ev))}`}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#F59E0B]">View ›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SUB-VIEW 2b: Week grid (CalendarWeekSubView)
// Google Calendar-style 7-day time grid with drag-to-create, current-time
// indicator and all-day row. Wraps CalendarWeekView with the shared
// scroll/padding shell used by the other sub-views.
// ============================================================================

export interface CalendarWeekSubViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date, opts?: WeekViewSheetOpts) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  className?: string;
}

export function CalendarWeekSubView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  className = '',
}: CalendarWeekSubViewProps) {
  return (
    <div
      className={`flex-1 min-h-0 flex flex-col overflow-hidden pb-24 md:pb-20 ${className}`}
      role="tabpanel"
      id="subview-week"
      aria-labelledby="tab-week"
    >
      <CalendarWeekView
        events={events}
        holidaysByDay={holidaysByDay}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        openDedicatedSheet={openDedicatedSheet}
        onSelectEvent={onSelectEvent}
      />
    </div>
  );
}

// ============================================================================
// SUB-VIEW 3: Events & Trackers Hub (CalendarTrackersSubView)
// Period Tracker card, Health Tracker card, Custom Life Event Tracker card
// ============================================================================

export interface CustomLifeTracker {
  id: string;
  title: string;
  category: 'Countdown' | 'Recurring Cycle' | 'Medical / Health' | 'Legal / Documents';
  targetDate: string;
  recurringDays?: number;
  notes: string;
  tone: 'rose' | 'emerald' | 'amber' | 'sky';
}

export interface CalendarTrackersSubViewProps {
  events?: CalendarEventLike[];
  openDedicatedSheet?: (type: EntryType, date?: Date) => void;
  className?: string;
}

export function CalendarTrackersSubView({
  openDedicatedSheet,
  className = '',
}: CalendarTrackersSubViewProps) {
  // Discreet mode toggle for Period Tracker
  const [isDiscreetMode, setIsDiscreetMode] = useState(false);

  // Health tracker interactive counters
  const [waterMl, setWaterMl] = useState(1750);
  const waterTarget = 2500;

  // Custom life trackers state
  const [lifeTrackers, setLifeTrackers] = useState<CustomLifeTracker[]>([
    {
      id: 'lt-1',
      title: 'Annual Full Body Health Checkup',
      category: 'Recurring Cycle',
      targetDate: '2026-11-15',
      recurringDays: 365,
      notes: 'Blood work, lipid profile & ECG at Apollo Diagnostics',
      tone: 'emerald',
    },
    {
      id: 'lt-2',
      title: 'Passport & Visa Expiry Renewal',
      category: 'Countdown',
      targetDate: '2027-02-18',
      notes: 'Requires 6 months validity for sovereign summit travel',
      tone: 'sky',
    },
    {
      id: 'lt-3',
      title: 'Apartment Lease Agreement Renewal',
      category: 'Countdown',
      targetDate: '2026-12-27',
      notes: 'Send 60-day notice to landlord regarding renewal terms',
      tone: 'amber',
    },
  ]);

  // Modal / Creator for Custom Tracker
  const [isAddTrackerOpen, setIsAddTrackerOpen] = useState(false);
  const [newTrackerTitle, setNewTrackerTitle] = useState('');
  const [newTrackerCategory, setNewTrackerCategory] = useState<CustomLifeTracker['category']>('Countdown');
  const [newTrackerDate, setNewTrackerDate] = useState('2026-12-31');
  const [newTrackerNotes, setNewTrackerNotes] = useState('');

  const handleAddWater = () => {
    setWaterMl((prev) => {
      const next = prev + 250;
      showToast({ text: `Logged +250ml water (${next}ml / ${waterTarget}ml)`, type: 'success' });
      return next;
    });
  };

  const handleCreateTracker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrackerTitle.trim()) return;

    const item: CustomLifeTracker = {
      id: `lt-${Date.now()}`,
      title: newTrackerTitle.trim(),
      category: newTrackerCategory,
      targetDate: newTrackerDate || '2026-12-31',
      notes: newTrackerNotes.trim(),
      tone: newTrackerCategory === 'Recurring Cycle' ? 'emerald' : newTrackerCategory === 'Medical / Health' ? 'rose' : 'sky',
    };

    setLifeTrackers((prev) => [item, ...prev]);
    setIsAddTrackerOpen(false);
    setNewTrackerTitle('');
    setNewTrackerNotes('');
    showToast({ text: `Tracker added: "${item.title}"`, type: 'success' });
  };

  const handleDeleteTracker = (id: string) => {
    setLifeTrackers((prev) => prev.filter((t) => t.id !== id));
    showToast({ text: 'Tracker deleted', type: 'info' });
  };

  return (
    <div className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}>
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232938] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
              Trackers & Events Hub
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
              Sovereign Biometrics & Milestones
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5] mt-1">
            Personal Health & Life Cycle Trackers
          </h2>
          <p className="text-xs text-[#A1A4AC] mt-0.5">
            Private, on-device cycle prediction, wellness metrics, and recurring countdown milestones.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddTrackerOpen(true)}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-black bg-[#F59E0B] hover:bg-[#D97706] shadow-sm flex items-center gap-1.5 transition-all"
        >
          <SvgPlus className="size-3.5 text-black" />
          <span>+ Add Tracker</span>
        </button>
      </div>

      {/* Grid: 3 Main Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ==================================================================
            CARD 1: Period Tracker Card
            ================================================================== */}
        <div className="rounded-2xl border border-rose-900/40 bg-[#12151E] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-rose-950/60 border border-rose-800/60 grid place-items-center text-rose-400">
                <SvgDroplet className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F5F5F5]">Period & Cycle Tracker</h3>
                <p className="text-[11px] text-[#A1A4AC]">Predictive hormone & fertility lens</p>
              </div>
            </div>

            {/* Discrete Mode Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !isDiscreetMode;
                setIsDiscreetMode(next);
                showToast({
                  text: next ? 'Discreet Mode Activated' : 'Standard View Restored',
                  type: 'info',
                });
              }}
              title="Toggle Discrete Mode (Private mask)"
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                isDiscreetMode
                  ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                  : 'bg-[#181C26] border-[#232938] text-[#A1A4AC] hover:text-white'
              }`}
            >
              <SvgShieldEye className="size-3.5" />
              <span className="text-[10px] font-medium">{isDiscreetMode ? 'Discreet On' : 'Discreet'}</span>
            </button>
          </div>

          {/* Card Body */}
          {isDiscreetMode ? (
            <div className="p-4 rounded-xl bg-[#0B0D13] border border-rose-900/30 text-center space-y-2">
              <span className="text-xs font-bold text-rose-300 block">Cycle Protocol Alpha · Active</span>
              <p className="text-[11px] text-[#A1A4AC]">
                Phase: Optimal energy window · Next milestone in 6 days
              </p>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] bg-rose-950/40 text-rose-300 border border-rose-800/40">
                Biometric Mask Active
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Prediction Banner */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 to-[#12151E] border border-rose-900/40 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A1A4AC]">Cycle Day</span>
                  <span className="font-bold text-rose-300">Day 14 of 28</span>
                </div>
                <div className="h-1.5 rounded-full bg-rose-950 overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '50%' }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#A1A4AC] pt-1">
                  <span>Next Period: <strong className="text-white">in 14 days</strong></span>
                  <span className="text-rose-400 font-semibold">Ovulation Window</span>
                </div>
              </div>

              {/* Status Chips */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#0B0D13] border border-[#232938]">
                  <span className="text-[10px] text-[#A1A4AC] block">Fertile Window</span>
                  <span className="font-semibold text-rose-200">Oct 10 – Oct 15</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0B0D13] border border-[#232938]">
                  <span className="text-[10px] text-[#A1A4AC] block">Symptom Log</span>
                  <span className="font-semibold text-[#F5F5F5]">Pain Free · Energetic</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openDedicatedSheet?.('period')}
                className="w-full py-2 rounded-xl bg-rose-900/30 hover:bg-rose-900/50 border border-rose-800/50 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <SvgPlus className="size-3.5 text-rose-300" />
                <span>Log Cycle Symptoms & Mood</span>
              </button>
            </div>
          )}
        </div>

        {/* ==================================================================
            CARD 2: Health Tracker Card
            ================================================================== */}
        <div className="rounded-2xl border border-emerald-900/40 bg-[#12151E] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-emerald-950/60 border border-emerald-800/60 grid place-items-center text-emerald-400">
                <SvgPulse className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F5F5F5]">Health & Vitals Tracker</h3>
                <p className="text-[11px] text-[#A1A4AC]">Hydration, sleep, workouts & vitals</p>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              Synced
            </span>
          </div>

          <div className="space-y-3">
            {/* Water Hydration Log */}
            <div className="p-3 rounded-xl bg-[#0B0D13] border border-[#232938] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-sky-400">
                  <SvgDroplet className="size-3.5" />
                  <span className="font-semibold">Water Intake</span>
                </div>
                <span className="font-mono text-[#F5F5F5]">
                  {waterMl} / {waterTarget} ml ({Math.round((waterMl / waterTarget) * 100)}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#181C26] overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (waterMl / waterTarget) * 100)}%` }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddWater}
                className="w-full py-1 rounded-lg text-xs font-medium text-sky-300 bg-sky-950/40 hover:bg-sky-950/70 border border-sky-800/40 flex items-center justify-center gap-1 transition-colors"
              >
                <SvgPlus className="size-3 text-sky-300" />
                <span>Quick Log +250ml Water</span>
              </button>
            </div>

            {/* Sleep & Workout Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-[#0B0D13] border border-[#232938]">
                <div className="flex items-center gap-1.5 text-indigo-400 mb-1">
                  <SvgMoon className="size-3.5" />
                  <span className="font-semibold">Sleep</span>
                </div>
                <span className="font-bold text-sm text-[#F5F5F5]">7h 45m</span>
                <span className="text-[10px] text-emerald-400 block">92% Restful</span>
              </div>

              <div className="p-3 rounded-xl bg-[#0B0D13] border border-[#232938]">
                <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                  <SvgHeart className="size-3.5" />
                  <span className="font-semibold">Resting HR</span>
                </div>
                <span className="font-bold text-sm text-[#F5F5F5]">64 bpm</span>
                <span className="text-[10px] text-[#A1A4AC] block">BP: 118/76 mmHg</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================
            CARD 3: Custom Life Event Trackers Hub
            ================================================================== */}
        <div className="rounded-2xl border border-sky-900/40 bg-[#12151E] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-sky-950/60 border border-sky-800/60 grid place-items-center text-sky-400">
                <SvgCalendar className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F5F5F5]">Life Event Trackers</h3>
                <p className="text-[11px] text-[#A1A4AC]">Custom recurring cycles & countdowns</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAddTrackerOpen(true)}
              className="size-7 rounded-lg bg-sky-950/60 border border-sky-800/60 grid place-items-center text-sky-400 hover:text-white transition-colors"
              title="Add Custom Life Tracker"
            >
              <SvgPlus className="size-3.5" />
            </button>
          </div>

          {/* List of Custom Trackers */}
          <div className="space-y-2.5">
            {lifeTrackers.map((tracker) => {
              const diffDays = Math.ceil(
                (new Date(tracker.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
              );

              return (
                <div
                  key={tracker.id}
                  className="p-3 rounded-xl bg-[#0B0D13] border border-[#232938] hover:border-sky-800/50 transition-all space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-[#F5F5F5]">{tracker.title}</h4>
                      <span className="text-[10px] text-[#A1A4AC]">{tracker.category}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-950/60 text-sky-300 border border-sky-800/40">
                        {diffDays > 0 ? `${diffDays}d left` : 'Due today'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTracker(tracker.id)}
                        className="text-[#A1A4AC] hover:text-rose-400 transition-colors p-0.5"
                        title="Delete Tracker"
                      >
                        <SvgTrash className="size-3" />
                      </button>
                    </div>
                  </div>

                  {tracker.notes && (
                    <p className="text-[11px] text-[#A1A4AC]/80 truncate">{tracker.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Custom Tracker Inline Modal */}
      {isAddTrackerOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-md bg-[#12151E] border border-[#232938] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#232938] pb-3">
              <h3 className="text-sm font-bold text-[#F5F5F5] flex items-center gap-2">
                <SvgPlus className="size-4 text-[#F59E0B]" />
                <span>Add Custom Life Cycle Tracker</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddTrackerOpen(false)}
                className="text-xs text-[#A1A4AC] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTracker} className="space-y-3.5">
              <div>
                <label className="text-xs text-[#A1A4AC] block mb-1">Tracker Title</label>
                <input
                  type="text"
                  required
                  value={newTrackerTitle}
                  onChange={(e) => setNewTrackerTitle(e.target.value)}
                  placeholder="e.g. Car Insurance Renewal, Dentist Appointment…"
                  className="w-full bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#A1A4AC] block mb-1">Category</label>
                  <select
                    value={newTrackerCategory}
                    onChange={(e) => setNewTrackerCategory(e.target.value as any)}
                    className="w-full bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
                  >
                    <option value="Countdown">Countdown</option>
                    <option value="Recurring Cycle">Recurring Cycle</option>
                    <option value="Medical / Health">Medical / Health</option>
                    <option value="Legal / Documents">Legal / Documents</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-[#A1A4AC] block mb-1">Target Date</label>
                  <input
                    type="date"
                    required
                    value={newTrackerDate}
                    onChange={(e) => setNewTrackerDate(e.target.value)}
                    className="w-full bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
                  >
                  </input>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#A1A4AC] block mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  value={newTrackerNotes}
                  onChange={(e) => setNewTrackerNotes(e.target.value)}
                  placeholder="Optional details, contact or policy number"
                  className="w-full bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232938]">
                <button
                  type="button"
                  onClick={() => setIsAddTrackerOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#A1A4AC] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-black bg-[#F59E0B] hover:bg-[#D97706] shadow-sm transition-all"
                >
                  Save Tracker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-VIEW 4: Schedule (CalendarScheduleSubView)
// Segmented sub-tabs: Clock (time blocking & live world clock) & Reminders (alerts with snooze/complete)
// ============================================================================

export interface ScheduledReminder {
  id: string;
  title: string;
  dueTime: string;
  priority: 'urgent' | 'medium' | 'low';
  completed: boolean;
}

export interface CalendarScheduleSubViewProps {
  events?: CalendarEventLike[];
  selectedDate?: Date;
  openDedicatedSheet?: (type: EntryType, date?: Date) => void;
  onSelectEvent?: (event: CalendarEventLike) => void;
  className?: string;
}

export function CalendarScheduleSubView({
  events = [],
  selectedDate = new Date(),
  openDedicatedSheet,
  onSelectEvent,
  className = '',
}: CalendarScheduleSubViewProps) {
  // Segmented sub-tabs: 'clock' vs 'reminders'
  const [subTab, setSubTab] = useState<'clock' | 'reminders'>('clock');

  // Live World Clocks Tick
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTz = useCallback(
    (tz: string) => {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(now);
      } catch {
        return '--:--:--';
      }
    },
    [now],
  );

  // Reminders State
  const [reminders, setReminders] = useState<ScheduledReminder[]>([
    {
      id: 'rem-1',
      title: 'Review Wave 39 Sovereign Parity Subagents PR',
      dueTime: 'Today, 5:00 PM',
      priority: 'urgent',
      completed: false,
    },
    {
      id: 'rem-2',
      title: 'Verify RFC 5545 CalDAV sync on Android staging APK',
      dueTime: 'Tomorrow, 10:00 AM',
      priority: 'medium',
      completed: false,
    },
    {
      id: 'rem-3',
      title: 'Deploy QuantMeet 4K Video Stage to production cluster',
      dueTime: 'Friday, 2:30 PM',
      priority: 'medium',
      completed: false,
    },
    {
      id: 'rem-4',
      title: 'Update QuantCalendar Booking Links availability slots',
      dueTime: 'Monday, 9:00 AM',
      priority: 'low',
      completed: true,
    },
  ]);

  const [reminderFilter, setReminderFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newDueTime, setNewDueTime] = useState('Today, 6:00 PM');
  const [newPriority, setNewPriority] = useState<'urgent' | 'medium' | 'low'>('medium');

  const toggleReminder = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const next = !r.completed;
          showToast({
            text: next ? `Completed: "${r.title}"` : `Marked pending: "${r.title}"`,
            type: 'info',
          });
          return { ...r, completed: next };
        }
        return r;
      }),
    );
  };

  const handleSnooze = (id: string, mins: number) => {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          showToast({ text: `Snoozed for ${mins} minutes`, type: 'info' });
          return { ...r, dueTime: `Snoozed +${mins}m` };
        }
        return r;
      }),
    );
  };

  const handleAddReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const item: ScheduledReminder = {
      id: `rem-${Date.now()}`,
      title: newTitle.trim(),
      dueTime: newDueTime || 'Today, 6:00 PM',
      priority: newPriority,
      completed: false,
    };

    setReminders((prev) => [item, ...prev]);
    setNewTitle('');
    showToast({ text: `Reminder created: "${item.title}"`, type: 'success' });
  };

  const handleDeleteReminder = (id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    showToast({ text: 'Reminder removed', type: 'info' });
  };

  const filteredReminders = reminders.filter((r) => {
    if (reminderFilter === 'pending') return !r.completed;
    if (reminderFilter === 'completed') return r.completed;
    return true;
  });

  // Time Blocking Grid for selectedDate (8:00 AM to 8:00 PM)
  const timeSlots = useMemo(() => {
    const slots: Array<{
      hour: number;
      timeLabel: string;
      event?: CalendarEventLike;
    }> = [];

    const selectedDayKey = dayKey(selectedDate);
    const dayEvents = events.filter((ev) => {
      const d = startOf(ev);
      return !Number.isNaN(d.getTime()) && dayKey(d) === selectedDayKey;
    });

    for (let h = 8; h <= 20; h++) {
      const timeLabel = `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
      const ev = dayEvents.find((e) => {
        const s = startOf(e);
        return s.getHours() === h;
      });
      slots.push({ hour: h, timeLabel, event: ev });
    }
    return slots;
  }, [events, selectedDate]);

  return (
    <div className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}>
      {/* Top Header & Segmented Sub-Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232938] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
              Schedule & Reminders
            </span>
            <span className="text-xs text-[#A1A4AC]">·</span>
            <span className="text-xs text-[#A1A4AC]">Dual Engine Workspace</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5] mt-1">
            {subTab === 'clock' ? 'Time Blocking & Live World Clock' : 'Scheduled Alerts & Action Reminders'}
          </h2>
        </div>

        {/* 2 Segmented Sub-Tabs */}
        <div className="inline-flex rounded-xl border border-[#232938] bg-[#12151E] p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setSubTab('clock')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              subTab === 'clock'
                ? 'bg-[#F59E0B] text-black shadow-sm'
                : 'text-[#A1A4AC] hover:text-white'
            }`}
          >
            <SvgClock className="size-3.5" />
            <span>Clock & Time Blocking</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('reminders')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              subTab === 'reminders'
                ? 'bg-[#F59E0B] text-black shadow-sm'
                : 'text-[#A1A4AC] hover:text-white'
            }`}
          >
            <SvgBell className="size-3.5" />
            <span>Reminders ({reminders.filter((r) => !r.completed).length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: CLOCK & TIME BLOCKING */}
      {subTab === 'clock' && (
        <div className="space-y-6">
          {/* Live World Clocks Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {[
              { code: 'IST', city: 'New Delhi / Mumbai', tz: 'Asia/Kolkata', offset: 'UTC+5:30' },
              { code: 'PST', city: 'San Francisco', tz: 'America/Los_Angeles', offset: 'UTC-7' },
              { code: 'EST', city: 'New York', tz: 'America/New_York', offset: 'UTC-4' },
              { code: 'GMT', city: 'London / UTC', tz: 'Europe/London', offset: 'UTC+1' },
            ].map((clock) => (
              <div
                key={clock.code}
                className="p-3.5 rounded-2xl bg-[#12151E] border border-[#232938] space-y-1 shadow-sm"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#F59E0B] flex items-center gap-1.5">
                    <SvgGlobe className="size-3" />
                    {clock.code}
                  </span>
                  <span className="font-mono text-[10px] text-[#A1A4AC]">{clock.offset}</span>
                </div>
                <div className="text-base sm:text-lg font-bold font-mono tracking-tight text-[#F5F5F5]">
                  {formatTz(clock.tz)}
                </div>
                <span className="text-[10px] text-[#A1A4AC] block truncate">{clock.city}</span>
              </div>
            ))}
          </div>

          {/* Time Blocking Schedule Matrix */}
          <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F5F5F5]">
                  Hourly Time Blocking Schedule
                </h3>
                <p className="text-xs text-[#A1A4AC]">
                  Visual time blocks for {FULL_WEEKDAYS[selectedDate.getDay()]}, {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openDedicatedSheet?.('event', selectedDate)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black bg-[#F59E0B] hover:bg-[#D97706] shadow-sm flex items-center gap-1.5 transition-all"
              >
                <SvgPlus className="size-3.5 text-black" />
                <span>+ Block Slot</span>
              </button>
            </div>

            {/* Hourly Slot Rows */}
            <div className="divide-y divide-[#232938]/60 border border-[#232938] rounded-xl overflow-hidden bg-[#0B0D13]">
              {timeSlots.map((slot) => (
                <div
                  key={slot.hour}
                  className="flex items-center justify-between p-2.5 sm:p-3 hover:bg-[#181C26]/40 transition-colors"
                >
                  <div className="w-24 text-xs font-mono font-medium text-[#A1A4AC]">
                    {slot.timeLabel}
                  </div>

                  <div className="flex-1 px-3 min-w-0">
                    {slot.event ? (
                      <div
                        onClick={() => onSelectEvent?.(slot.event!)}
                        className="p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex items-center justify-between"
                        style={{
                          backgroundColor: `${slot.event.color || '#F59E0B'}20`,
                          borderColor: `${slot.event.color || '#F59E0B'}50`,
                          color: '#F5F5F5',
                        }}
                      >
                        <span className="truncate">{slot.event.title}</span>
                        <span className="text-[10px] text-[#A1A4AC] font-mono ml-2">Occupied</span>
                      </div>
                    ) : (
                      <div className="text-xs text-[#A1A4AC]/40 italic">Open focus window</div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openDedicatedSheet?.('event', selectedDate)}
                    className="text-[11px] font-medium text-[#F59E0B] hover:underline px-2"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: REMINDERS */}
      {subTab === 'reminders' && (
        <div className="space-y-6">
          {/* Quick Add Card */}
          <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
              Add New Scheduled Reminder
            </h3>

            <form onSubmit={handleAddReminder} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What needs to get done?"
                className="flex-1 bg-[#0B0D13] border border-[#232938] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5] placeholder-[#A1A4AC]/60 focus:outline-none focus:border-[#F59E0B]"
              />

              <input
                type="text"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                placeholder="Due time (e.g. Today, 6:00 PM)"
                className="w-full sm:w-48 bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
              />

              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="bg-[#0B0D13] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
              >
                <option value="urgent">Urgent</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-black bg-[#F59E0B] hover:bg-[#D97706] shadow-sm flex items-center justify-center gap-1 transition-all"
              >
                <SvgPlus className="size-3.5 text-black" />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            {(['all', 'pending', 'completed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setReminderFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  reminderFilter === f
                    ? 'bg-[#F59E0B] text-black font-semibold'
                    : 'bg-[#12151E] text-[#A1A4AC] hover:text-white border border-[#232938]'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Reminders List */}
          <div className="space-y-2.5">
            {filteredReminders.map((r) => (
              <div
                key={r.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                  r.completed
                    ? 'bg-[#12151E]/40 border-[#232938]/60 opacity-60'
                    : 'bg-[#12151E] border-[#232938] hover:border-[#384156]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleReminder(r.id)}
                    className="text-[#A1A4AC] hover:text-[#F59E0B] transition-colors"
                  >
                    {r.completed ? (
                      <SvgCheckSquare className="size-4 text-emerald-400" />
                    ) : (
                      <SvgSquare className="size-4" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <h4
                      className={`text-xs font-semibold ${
                        r.completed ? 'line-through text-[#A1A4AC]' : 'text-[#F5F5F5]'
                      }`}
                    >
                      {r.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-[#A1A4AC] mt-0.5">
                      <span className="font-mono">{r.dueTime}</span>
                      <span>·</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                          r.priority === 'urgent'
                            ? 'bg-rose-900/40 text-rose-300'
                            : r.priority === 'medium'
                            ? 'bg-amber-900/40 text-amber-300'
                            : 'bg-emerald-900/40 text-emerald-300'
                        }`}
                      >
                        {r.priority}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!r.completed && (
                    <button
                      type="button"
                      onClick={() => handleSnooze(r.id, 15)}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium text-[#A1A4AC] hover:text-white bg-[#0B0D13] border border-[#232938] flex items-center gap-1"
                      title="Snooze 15 minutes"
                    >
                      <SvgSnooze className="size-3" />
                      <span>Snooze</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteReminder(r.id)}
                    className="p-1 rounded-lg text-[#A1A4AC] hover:text-rose-400 transition-colors"
                    title="Delete Reminder"
                  >
                    <SvgTrash className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredReminders.length === 0 && (
              <div className="py-8 text-center text-xs text-[#A1A4AC]/60 bg-[#12151E] rounded-xl border border-dashed border-[#232938]">
                No reminders in this category
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
