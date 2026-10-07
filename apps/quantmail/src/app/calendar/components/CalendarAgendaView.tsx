'use client';

import React, { useMemo, useState, useEffect } from 'react';
import type { CalendarEventLike, EntryType } from '../types';
import { FULL_WEEKDAYS, MONTHS_SHORT } from '../types';
import { dayKey, startOf, endOf, hhmm } from '../lib/calendar-geometry';
import type { Holiday } from '../../../lib/holidays';

export interface CalendarAgendaViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  searchFilter?: string;
  className?: string;
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CaldavSyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CalendarAgendaView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  searchFilter = '',
  className = '',
}: CalendarAgendaViewProps) {
  // Dual Timezone Clocks (IST: Asia/Kolkata, PST: America/Los_Angeles)
  const [timeNow, setTimeNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTimeNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const formatTzTime = (tz: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(timeNow);
    } catch {
      return '12:00 PM';
    }
  };

  const istTime = useMemo(() => formatTzTime('Asia/Kolkata'), [timeNow]);
  const pstTime = useMemo(() => formatTzTime('America/Los_Angeles'), [timeNow]);

  // Index events by dayKey
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

  // 7-day schedule timeline starting from selectedDate (or beginning of current view)
  const sevenDays = useMemo(() => {
    const list: Array<{
      date: Date;
      key: string;
      weekdayName: string;
      dayNum: number;
      monthShort: string;
      isToday: boolean;
      isSelected: boolean;
      events: CalendarEventLike[];
      holidays: Holiday[];
    }> = [];

    const today = new Date();
    const todayKey = dayKey(today);
    const selectedKey = dayKey(selectedDate);
    const needle = searchFilter.trim().toLowerCase();

    // Start 7 days from selectedDate
    const base = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const k = dayKey(d);
      let dayEvents = eventsByDayKey[k] ?? [];
      const dayHolidays = holidaysByDay[k] ?? [];

      if (needle) {
        dayEvents = dayEvents.filter((e) => e.title.toLowerCase().includes(needle));
      }

      list.push({
        date: d,
        key: k,
        weekdayName: FULL_WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        monthShort: MONTHS_SHORT[d.getMonth()],
        isToday: k === todayKey,
        isSelected: k === selectedKey,
        events: dayEvents,
        holidays: dayHolidays,
      });
    }

    return list;
  }, [selectedDate, eventsByDayKey, holidaysByDay, searchFilter]);

  return (
    <div
      id="subview-agenda"
      role="tabpanel"
      aria-labelledby="tab-agenda"
      className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Top Banner: Dual Timezone Pill (IST / PST) & CalDAV Sync Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151E] border border-[#232938] rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 grid place-items-center text-[#F59E0B]">
            <GlobeIcon className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#F5F5F5] tracking-tight">
              7-Day Schedule Timeline
            </h2>
            <p className="text-xs text-[#A1A4AC]">
              Continuous multi-tenant agenda with RFC 5545 CalDAV sync
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dual Timezone Pill (IST / PST) */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#090A0E] border border-[#232938] text-xs font-mono text-[#F59E0B] shadow-inner"
            title="Dual Timezone Tracker (Asia/Kolkata and America/Los_Angeles)"
          >
            <GlobeIcon className="size-3 text-[#F59E0B]" />
            <span className="font-semibold text-white">IST</span>
            <span>{istTime}</span>
            <span className="text-[#232938]" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-white">PST</span>
            <span className="text-[#A1A4AC]">{pstTime}</span>
          </div>

          {/* CalDAV Sync Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-800/50 text-xs font-medium text-emerald-300 shadow-sm"
            title="CalDAV Protocol RFC 5545 Connected"
          >
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <CaldavSyncIcon className="size-3 text-emerald-400" />
            <span>CalDAV Synced</span>
          </div>

          {/* Quick Create Event Button */}
          <button
            type="button"
            onClick={() => openDedicatedSheet('event', selectedDate)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            <PlusIcon className="size-3.5 text-black" />
            <span>New Event</span>
          </button>
        </div>
      </div>

      {/* 7-Day Timeline List */}
      <div className="space-y-4">
        {sevenDays.map((day) => {
          const hasEvents = day.events.length > 0;
          const hasHolidays = day.holidays.length > 0;

          return (
            <div
              key={day.key}
              className={`rounded-2xl border transition-all ${
                day.isSelected
                  ? 'border-[#F59E0B]/50 bg-[#12151E] shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                  : 'border-[#232938] bg-[#12151E]/70 hover:bg-[#12151E]'
              }`}
            >
              {/* Day Header Row */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#232938]/60">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectDate(day.date)}
                    className="flex items-baseline gap-2 text-left focus-visible:outline-none"
                  >
                    <span className="text-base font-bold text-[#F5F5F5]">{day.weekdayName}</span>
                    <span className="text-sm font-normal text-[#A1A4AC]">
                      {day.monthShort} {day.dayNum}
                    </span>
                  </button>

                  {day.isToday && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                      Today
                    </span>
                  )}

                  {hasHolidays && (
                    <span className="text-xs text-rose-300 font-medium px-2 py-0.5 rounded-md bg-rose-950/40 border border-rose-800/40">
                      {day.holidays.map((h) => h.name).join(', ')}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openDedicatedSheet('event', day.date)}
                  aria-label={`Add entry on ${day.weekdayName} ${day.monthShort} ${day.dayNum}`}
                  className="flex items-center gap-1 text-xs text-[#A1A4AC] hover:text-[#F59E0B] transition-colors focus-visible:outline-none"
                >
                  <PlusIcon className="size-3 text-current" />
                  <span>Add slot</span>
                </button>
              </div>

              {/* Day Events Container */}
              <div className="p-3 sm:p-4 space-y-2.5">
                {hasEvents ? (
                  day.events.map((ev) => {
                    const startD = startOf(ev);
                    const endD = endOf(ev);
                    const timeStr = ev.allDay
                      ? 'All day'
                      : `${hhmm(startD)} - ${hhmm(endD)}`;
                    const accentColor = ev.color || '#F59E0B';

                    return (
                      <div
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectEvent(ev)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectEvent(ev);
                          }
                        }}
                        className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#090A0E] border border-[#232938] hover:border-[#F59E0B]/50 hover:bg-[#161822] cursor-pointer transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
                      >
                        {/* Left Color Indicator Bar */}
                        <div
                          className="absolute left-0 inset-y-0 w-1 rounded-l-xl transition-all group-hover:w-1.5"
                          style={{ backgroundColor: accentColor }}
                          aria-hidden="true"
                        />

                        {/* Event Details */}
                        <div className="flex-1 pl-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#F5F5F5] group-hover:text-[#F59E0B] transition-colors">
                              {ev.title || 'Untitled Event'}
                            </span>
                            {ev.priority && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                  ev.priority === 'urgent'
                                    ? 'bg-rose-950/70 text-rose-300 border border-rose-800/60'
                                    : 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                                }`}
                              >
                                {ev.priority}
                              </span>
                            )}
                            {ev.type && ev.type !== 'event' && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#232938] text-[#A1A4AC] capitalize">
                                {ev.type}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 mt-1.5 text-xs text-[#A1A4AC] flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[#F59E0B]">
                              <ClockIcon className="size-3 text-[#F59E0B]" />
                              <span>{timeStr}</span>
                            </span>

                            {ev.location && (
                              <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                                <MapPinIcon className="size-3 text-current" />
                                <span className="truncate">{ev.location}</span>
                              </span>
                            )}

                            {Array.isArray(ev.attendees) && ev.attendees.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <UsersIcon className="size-3 text-current" />
                                <span>{ev.attendees.length} attendees</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Interactive Pill on hover */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs px-2.5 py-1 rounded-md bg-[#12151E] border border-[#232938] text-[#A1A4AC] group-hover:border-[#F59E0B]/40 group-hover:text-[#F59E0B] transition-all">
                            View details
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-4 text-center rounded-xl bg-[#090A0E]/50 border border-dashed border-[#232938]">
                    <p className="text-xs text-[#A1A4AC]">No scheduled events for this day</p>
                    <button
                      type="button"
                      onClick={() => openDedicatedSheet('event', day.date)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[#F59E0B] hover:underline focus-visible:outline-none"
                    >
                      <PlusIcon className="size-3 text-current" />
                      <span>Create an event</span>
                    </button>
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
