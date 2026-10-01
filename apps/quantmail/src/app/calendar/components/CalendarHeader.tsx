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
      <div className="hidden md:flex items-center justify-between border-b border-[#282C35]/80 px-6 py-3 bg-[var(--quant-background)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-xl border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[#282C35]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-xl border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[#282C35]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ›
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-[var(--quant-foreground)] flex items-center gap-2">
            <span>{activeMonthName}</span>
            <span className="text-[var(--quant-muted-foreground)] font-normal">{activeYear}</span>
          </h2>

          <button
            type="button"
            onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-border)] text-[var(--quant-foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
                className="appearance-none rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] pl-7 pr-6 py-1 text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:border-[var(--quant-border-strong)] focus:outline-none focus:border-[var(--brand-primary)] cursor-pointer transition-colors"
                title="Select Calendar Timezone"
              >
                {TIMEZONES.map((tz) => (
                  <option
                    key={tz.value}
                    value={tz.value}
                    className="bg-[var(--quant-surface-elevated)] text-[var(--quant-foreground)]"
                  >
                    {tz.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--quant-muted-foreground)]">
                🌐
              </span>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--quant-muted-foreground)]">
                ▼
              </span>
            </div>
          )}

          <div className="flex items-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-0.5">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => selectView(v.key)}
                aria-pressed={activeView === v.key}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                  activeView === v.key
                    ? 'bg-[var(--brand-primary)] text-[#111111] font-semibold shadow-sm'
                    : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
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
              className="px-3 py-1.5 rounded-lg font-medium text-xs text-[var(--quant-foreground)] bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] flex items-center gap-1.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              title="Share Booking Links"
            >
              <span className="text-[var(--brand-primary)]">🔗</span>
              <span>Booking Links</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openDedicatedSheet('event')}
            className="px-3.5 py-1.5 rounded-lg font-semibold text-xs text-[#111111] bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] active:bg-[var(--brand-primary-pressed)] shadow-sm transition-all"
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
      <div className="md:hidden border-b border-[#282C35]/80 bg-[var(--quant-background)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-baseline gap-1.5 truncate text-base font-bold tracking-tight text-[var(--quant-foreground)]">
            <span className="truncate">{activeMonthName}</span>
            <span className="font-normal text-[var(--quant-muted-foreground)]">{activeYear}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="grid size-11 place-items-center rounded-xl border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[#282C35]/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="grid size-11 place-items-center rounded-xl border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[#282C35]/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              ›
            </button>
            <button
              type="button"
              onClick={goToday}
              className="min-h-11 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 text-xs font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              Today
            </button>
            {onOpenBookingLinks && (
              <button
                type="button"
                onClick={onOpenBookingLinks}
                aria-label="Booking Links"
                className="min-h-11 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--quant-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
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
              className="w-full appearance-none rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] pl-7 pr-6 py-1.5 text-xs text-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--brand-primary)] cursor-pointer"
              title="Select Calendar Timezone"
            >
              {TIMEZONES.map((tz) => (
                <option
                  key={tz.value}
                  value={tz.value}
                  className="bg-[var(--quant-surface-elevated)] text-[var(--quant-foreground)]"
                >
                  {tz.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--quant-muted-foreground)]">
              🌐
            </span>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-[var(--quant-muted-foreground)]">
              ▼
            </span>
          </div>
        )}

        <div
          className="mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-0.5"
          role="group"
          aria-label="Calendar view"
        >
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => selectView(v.key)}
              aria-pressed={activeView === v.key}
              className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                activeView === v.key
                  ? 'bg-[var(--brand-primary)] font-semibold text-[#111111] shadow-sm'
                  : 'text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
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
