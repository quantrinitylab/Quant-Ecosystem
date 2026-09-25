'use client';

import React from 'react';
import type { CalendarView, EntryType } from '../types';
import { CALENDAR_VIEWS, TIMEZONES } from '../types';

export interface CalendarHeaderProps {
  activeMonthName: string;
  activeYear: number;
  goMonth: (delta: number) => void;
  goToday: () => void;
  activeView: CalendarView;
  selectView: (view: CalendarView) => void;
  openDedicatedSheet: (type: EntryType) => void;
  activeTimezone?: string;
  onChangeTimezone?: (tz: string) => void;
  onOpenBookingLinks?: () => void;
}

export function CalendarHeader({
  activeMonthName,
  activeYear,
  goMonth,
  goToday,
  activeView,
  selectView,
  openDedicatedSheet,
  activeTimezone,
  onChangeTimezone,
  onOpenBookingLinks,
}: CalendarHeaderProps) {
  return (
    <>
      {/* Desktop Header Toolbar */}
      <div className="hidden md:flex items-center justify-between border-b border-[#282C35]/80 px-6 py-3 bg-[#0c0c0f]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-xl border border-[#282C35] text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-xl border border-[#282C35] text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              ›
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F5] flex items-center gap-2">
            <span>{activeMonthName}</span>
            <span className="text-[#A1A4AC] font-normal">{activeYear}</span>
          </h2>

          <button
            type="button"
            onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[#282C35] bg-[#16181D] hover:bg-[#1C1F26] text-[#F5F5F5] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onChangeTimezone && (
            <div className="relative">
              <select
                value={activeTimezone || 'Asia/Kolkata'}
                onChange={(e) => onChangeTimezone(e.target.value)}
                className="appearance-none rounded-lg border border-[#282C35] bg-[#111318] pl-7 pr-6 py-1 text-xs text-[#A1A4AC] hover:text-[#F5F5F5] hover:border-[#3A404D] focus:outline-none focus:border-[#FF8C42] cursor-pointer transition-colors"
                title="Select Calendar Timezone"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value} className="bg-[#16181D] text-[#F5F5F5]">
                    {tz.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#A1A4AC]">
                🌐
              </span>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[#A1A4AC]">
                ▼
              </span>
            </div>
          )}

          <div className="flex items-center rounded-lg border border-[#282C35] bg-[#111318] p-0.5">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => selectView(v.key)}
                aria-pressed={activeView === v.key}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                  activeView === v.key
                    ? 'bg-[#FF8C42] text-[#111111] font-semibold shadow-sm'
                    : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {onOpenBookingLinks && (
            <button
              type="button"
              onClick={onOpenBookingLinks}
              aria-label="Booking Links"
              className="px-3 py-1.5 rounded-lg font-medium text-xs text-[#F5F5F5] bg-[#16181D] hover:bg-[#20232B] border border-[#282C35] flex items-center gap-1.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              title="Share Booking Links"
            >
              <span className="text-[#FF8C42]">🔗</span>
              <span>Booking Links</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openDedicatedSheet('event')}
            className="px-3.5 py-1.5 rounded-lg font-semibold text-xs text-[#111111] bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] shadow-sm transition-all"
          >
            + New Entry
          </button>
        </div>
      </div>

      {/*
       * Mobile toolbar.
       *
       * The toolbar above is `hidden md:flex`, and the picker only draws its own
       * `‹ ›` once the month grid is expanded — so a phone had no month
       * navigation, no "Today" and no view switcher at all. It could reach
       * another month only by dragging the handle open first, and could not
       * leave Agenda by any route. Two rows rather than one: 375px will not
       * hold a month name, a stepper and four view chips side by side.
       */}
      <div className="md:hidden border-b border-[#282C35]/80 bg-[#0c0c0f] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-baseline gap-1.5 truncate text-base font-bold tracking-tight text-[#F5F5F5]">
            <span className="truncate">{activeMonthName}</span>
            <span className="font-normal text-[#A1A4AC]">{activeYear}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="grid size-11 place-items-center rounded-xl border border-[#282C35] text-[#A1A4AC] transition-colors hover:bg-[#282C35]/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="grid size-11 place-items-center rounded-xl border border-[#282C35] text-[#A1A4AC] transition-colors hover:bg-[#282C35]/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              ›
            </button>
            <button
              type="button"
              onClick={goToday}
              className="min-h-11 rounded-xl border border-[#282C35] bg-[#16181D] px-3 text-xs font-medium text-[#F5F5F5] transition-colors hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              Today
            </button>
            {onOpenBookingLinks && (
              <button
                type="button"
                onClick={onOpenBookingLinks}
                aria-label="Booking Links"
                className="min-h-11 rounded-xl border border-[#282C35] bg-[#16181D] px-2.5 text-xs font-medium text-[#FF8C42] transition-colors hover:bg-[#1C1F26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                title="Share Booking Links"
              >
                🔗
              </button>
            )}
          </div>
        </div>

        {onChangeTimezone && (
          <div className="mt-2 relative">
            <select
              value={activeTimezone || 'Asia/Kolkata'}
              onChange={(e) => onChangeTimezone(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[#282C35] bg-[#111318] pl-7 pr-6 py-1.5 text-xs text-[#A1A4AC] focus:outline-none focus:border-[#FF8C42] cursor-pointer"
              title="Select Calendar Timezone"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} className="bg-[#16181D] text-[#F5F5F5]">
                  {tz.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#A1A4AC]">
              🌐
            </span>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[#A1A4AC]">
              ▼
            </span>
          </div>
        )}

        <div
          className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-[#282C35] bg-[#111318] p-0.5"
          role="group"
          aria-label="Calendar view"
        >
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => selectView(v.key)}
              aria-pressed={activeView === v.key}
              className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                activeView === v.key
                  ? 'bg-[#FF8C42] font-semibold text-[#111111] shadow-sm'
                  : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
