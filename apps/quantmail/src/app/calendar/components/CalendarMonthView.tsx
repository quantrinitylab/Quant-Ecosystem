'use client';

import React, { useMemo, useState } from 'react';
import type { CalendarEventLike, EntryType } from '../types';
import { MONTH_NAMES, FULL_WEEKDAYS } from '../types';
import { dayKey, startOf, endOf, hhmm } from '../lib/calendar-geometry';
import type { Holiday } from '../../../lib/holidays';

export interface CalendarMonthViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  className?: string;
}

// Strictly Mon-Sun columns as required by requirement 1.b
const MON_SUN_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
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

export function CalendarMonthView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  className = '',
}: CalendarMonthViewProps) {
  const [viewMonthDate, setViewMonthDate] = useState<Date>(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const viewYear = viewMonthDate.getFullYear();
  const viewMonth = viewMonthDate.getMonth();

  const handlePrevMonth = () => {
    setViewMonthDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewMonthDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setViewMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    onSelectDate(now);
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
  const monthGridWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

    // In JS, getDay(): Sunday=0, Monday=1, ..., Saturday=6
    // In Mon-Sun grid: Monday=0, Tuesday=1, ..., Sunday=6
    const firstDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
    const totalDays = lastDayOfMonth.getDate();

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

    const todayKey = dayKey(new Date());
    const selectedKey = dayKey(selectedDate);

    // Previous month filler days
    const prevMonthLastDate = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, prevMonthLastDate - i);
      const k = dayKey(d);
      currentWeek.push({
        date: d,
        dayNum: d.getDate(),
        key: k,
        isCurrentMonth: false,
        isToday: k === todayKey,
        isSelected: k === selectedKey,
        events: eventsByDayKey[k] ?? [],
        holidays: holidaysByDay[k] ?? [],
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(viewYear, viewMonth, day);
      const k = dayKey(d);

      currentWeek.push({
        date: d,
        dayNum: day,
        key: k,
        isCurrentMonth: true,
        isToday: k === todayKey,
        isSelected: k === selectedKey,
        events: eventsByDayKey[k] ?? [],
        holidays: holidaysByDay[k] ?? [],
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Next month filler days to complete last week
    if (currentWeek.length > 0) {
      let nextMonthDay = 1;
      while (currentWeek.length < 7) {
        const d = new Date(viewYear, viewMonth + 1, nextMonthDay++);
        const k = dayKey(d);
        currentWeek.push({
          date: d,
          dayNum: d.getDate(),
          key: k,
          isCurrentMonth: false,
          isToday: k === todayKey,
          isSelected: k === selectedKey,
          events: eventsByDayKey[k] ?? [],
          holidays: holidaysByDay[k] ?? [],
        });
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [viewYear, viewMonth, selectedDate, eventsByDayKey, holidaysByDay]);

  // Events for the currently selected day
  const selectedDayKey = dayKey(selectedDate);
  const selectedDayEvents = eventsByDayKey[selectedDayKey] ?? [];
  const selectedDayHolidays = holidaysByDay[selectedDayKey] ?? [];

  return (
    <div
      id="subview-month"
      role="tabpanel"
      aria-labelledby="tab-month"
      className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Month Toolbar & Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151E] border border-[#232938] rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-lg border border-[#232938] bg-[#090A0E] text-[#A1A4AC] hover:text-white hover:border-[#F59E0B]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-lg border border-[#232938] bg-[#090A0E] text-[#A1A4AC] hover:text-white hover:border-[#F59E0B]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-[#F5F5F5] flex items-center gap-2">
            <span>{MONTH_NAMES[viewMonth]}</span>
            <span className="text-[#A1A4AC] font-normal">{viewYear}</span>
          </h2>

          <button
            type="button"
            onClick={handleGoToday}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[#232938] bg-[#090A0E] text-[#F5F5F5] hover:text-[#F59E0B] hover:border-[#F59E0B]/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#A1A4AC] hidden sm:inline">
            30-Day Sovereign Grid · Monday-first
          </span>
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

      {/* 30-Day Interactive Calendar Grid with Mon-Sun Columns */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl overflow-hidden shadow-sm">
        {/* Mon-Sun Column Headers */}
        <div className="grid grid-cols-7 border-b border-[#232938] bg-[#0c0c10] text-center py-2.5">
          {MON_SUN_WEEKDAYS.map((dayName) => (
            <div
              key={dayName}
              className="text-xs font-bold uppercase tracking-wider text-[#A1A4AC]"
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="divide-y divide-[#232938]/60">
          {monthGridWeeks.map((week, weekIdx) => (
            <div key={`month-grid-week-${weekIdx}`} className="grid grid-cols-7 divide-x divide-[#232938]/40">
              {week.map((cell) => {
                const hasEvents = cell.events.length > 0;
                const hasHolidays = cell.holidays.length > 0;

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      onSelectDate(cell.date);
                      if (cell.date.getMonth() !== viewMonth) {
                        setViewMonthDate(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                      }
                    }}
                    className={`min-h-[72px] sm:min-h-[88px] p-2 flex flex-col justify-between items-start text-left transition-all relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] focus-visible:z-10 ${
                      cell.isSelected
                        ? 'bg-[#F59E0B]/10 border-2 border-[#F59E0B] shadow-[inset_0_0_12px_rgba(245,158,11,0.12)]'
                        : cell.isCurrentMonth
                        ? 'bg-[#12151E] hover:bg-[#161822]'
                        : 'bg-[#090A0E]/50 text-[#A1A4AC]/40 hover:bg-[#12151E]/40'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span
                        className={`size-6 rounded-full flex items-center justify-center text-xs ${
                          cell.isSelected
                            ? 'bg-[#F59E0B] text-black font-bold'
                            : cell.isToday
                            ? 'border border-[#F59E0B] text-[#F59E0B] font-bold'
                            : cell.isCurrentMonth
                            ? 'text-[#F5F5F5] font-medium'
                            : 'text-[#A1A4AC]/40'
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      {hasHolidays && (
                        <span
                          className="size-1.5 rounded-full bg-rose-400"
                          title={cell.holidays.map((h) => h.name).join(', ')}
                        />
                      )}
                    </div>

                    {/* Day Event Dots */}
                    <div className="w-full flex items-center gap-1 mt-1 flex-wrap">
                      {hasEvents &&
                        cell.events.slice(0, 3).map((ev, i) => (
                          <span
                            key={ev.id || i}
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: ev.color || '#F59E0B' }}
                            title={ev.title}
                          />
                        ))}
                      {cell.events.length > 3 && (
                        <span className="text-[9px] text-[#A1A4AC] font-mono">
                          +{cell.events.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Small text preview on larger screens */}
                    {hasEvents && (
                      <div className="w-full hidden md:block mt-1 truncate text-[10px] text-[#A1A4AC] group-hover:text-[#F5F5F5]">
                        {cell.events[0].title}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Day Events Preview Panel */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232938] pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#F5F5F5] flex items-center gap-2">
              <span>Day Events Preview:</span>
              <span className="text-[#F59E0B]">
                {FULL_WEEKDAYS[selectedDate.getDay()]}, {MONTH_NAMES[selectedDate.getMonth()]}{' '}
                {selectedDate.getDate()}, {selectedDate.getFullYear()}
              </span>
            </h3>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              {selectedDayEvents.length} event{selectedDayEvents.length === 1 ? '' : 's'} scheduled
              {selectedDayHolidays.length > 0 &&
                ` · Holiday: ${selectedDayHolidays.map((h) => h.name).join(', ')}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => openDedicatedSheet('event', selectedDate)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161822] hover:bg-[#1f2230] border border-[#232938] text-xs font-semibold text-[#F59E0B] transition-all focus-visible:outline-none"
          >
            <PlusIcon className="size-3.5 text-[#F59E0B]" />
            <span>Add to this day</span>
          </button>
        </div>

        {selectedDayEvents.length > 0 ? (
          <div className="space-y-2.5">
            {selectedDayEvents.map((ev) => {
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
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#090A0E] border border-[#232938] hover:border-[#F59E0B]/50 cursor-pointer transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-1.5 h-8 rounded-full"
                      style={{ backgroundColor: accentColor }}
                      aria-hidden="true"
                    />
                    <div>
                      <h4 className="text-sm font-semibold text-[#F5F5F5]">{ev.title}</h4>
                      <p className="text-xs text-[#A1A4AC] flex items-center gap-1.5 mt-0.5">
                        <ClockIcon className="size-3 text-[#F59E0B]" />
                        <span>{timeStr}</span>
                        {ev.location && <span>· {ev.location}</span>}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs px-2 py-1 rounded bg-[#12151E] border border-[#232938] text-[#A1A4AC]">
                    Edit
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center rounded-xl bg-[#090A0E]/50 border border-dashed border-[#232938]">
            <p className="text-xs text-[#A1A4AC]">
              No events scheduled for this day · Your schedule is open
            </p>
            <button
              type="button"
              onClick={() => openDedicatedSheet('event', selectedDate)}
              className="mt-2 text-xs text-[#F59E0B] hover:underline focus-visible:outline-none"
            >
              + Create an event on this date
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
