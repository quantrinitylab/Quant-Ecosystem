'use client';

import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import type { EntryType } from '../types';
import { IconCalendar, IconTarget, IconCake } from '../../../components/icons';

export interface CalendarHeaderProps {
  activeMonthName: string;
  activeYear: number;
  goMonth: (delta: number) => void;
  goToday: () => void;
  openDedicatedSheet: (type: EntryType) => void;
  activeTimezone?: string;
  onChangeTimezone?: (tz: string) => void;
  onOpenBookingLinks?: () => void;
}

function HeaderGlobeIcon({ className }: { className?: string }) {
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

function HeaderLinkIcon({ className }: { className?: string }) {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function HeaderPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/*
 * The rows the removed floating FAB carried (Event / Task / Birthday). Period
 * Tracker keeps its "+ Add Tracker" entry in the trackers sub-view, so it is
 * not duplicated here.
 */
const ENTRY_MENU_ITEMS: Array<{ id: EntryType; label: string; icon: React.ReactNode }> = [
  {
    id: 'event',
    label: 'Event',
    icon: <IconCalendar className="size-4 text-[var(--quant-primary)]" />,
  },
  {
    id: 'task',
    label: 'Task',
    icon: <IconTarget className="size-4 text-[var(--quant-primary)]" />,
  },
  {
    id: 'birthday',
    label: 'Birthday',
    icon: <IconCake className="size-4 text-emerald-400" />,
  },
];

/*
 * Split-button: the primary half opens the most frequent sheet (Event) in one
 * tap; the chevron half opens the FAB's old dial rows so Task and Birthday
 * creation keep an entry point after the floating button's removal (P2-10).
 * One instance is used on desktop and one on mobile.
 */
function NewEntrySplitButton({
  openDedicatedSheet,
  mainLabel,
  compact,
}: {
  openDedicatedSheet: (type: EntryType) => void;
  mainLabel: string;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Outside-press + Escape dismiss, mirroring the removed dial's behaviour.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const baseActionClass =
    'bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] active:bg-[var(--brand-primary-pressed)] text-[#111111] shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]';

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex items-stretch ${compact ? 'shrink-0' : ''}`}
    >
      <button
        type="button"
        onClick={() => openDedicatedSheet('event')}
        className={`inline-flex items-center gap-1.5 rounded-l-lg rounded-r-none font-semibold text-xs ${baseActionClass} ${
          compact ? 'px-3 py-1.5 gap-1' : 'px-3.5 py-1.5'
        }`}
      >
        <HeaderPlusIcon className="size-3.5 text-[#111111]" />
        <span>{mainLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label="Choose entry type"
        className={`inline-flex items-center justify-center rounded-l-none rounded-r-lg border-l border-[#111111]/25 ${baseActionClass} ${
          compact ? 'px-1.5' : 'px-2'
        }`}
      >
        <ChevronDownIcon className={compact ? 'size-3 text-[#111111]' : 'size-3.5 text-[#111111]'} />
      </button>
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="New entry type"
          className="absolute right-0 top-full z-50 mt-1.5 min-w-44 overflow-hidden rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] p-1 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
        >
          {ENTRY_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-entry-type={item.id}
              onClick={() => {
                setIsOpen(false);
                openDedicatedSheet(item.id);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-[#F5F5F5] hover:bg-[var(--quant-surface-elevated)]/60 focus-visible:bg-[var(--quant-surface-elevated)]/60 focus-visible:outline-none"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CalendarHeader({
  activeMonthName,
  activeYear,
  goMonth,
  goToday,
  openDedicatedSheet,
  activeTimezone: _activeTimezone,
  onChangeTimezone: _onChangeTimezone,
  onOpenBookingLinks,
}: CalendarHeaderProps) {
  // Live Dual-Timezone Clock (IST: Asia/Kolkata, PST: America/Los_Angeles)
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const istTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now);
    } catch {
      return '--:--';
    }
  }, [now]);

  const pstTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(now);
    } catch {
      return '--:--';
    }
  }, [now]);

  // Pacific abbreviation is PDT in summer / PST in winter — never hardcode it.
  const pacificCode = useMemo(() => {
    try {
      return (
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          timeZoneName: 'short',
        })
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value ?? 'PT'
      );
    } catch {
      return 'PT';
    }
  }, [now]);

  return (
    <header className="border-b border-[var(--quant-surface-elevated)]/80 bg-[#0c0c0f]">
      {/* ======================================================================
          Desktop Header Toolbar (Clean 1-row layout)
          ====================================================================== */}
      <div className="hidden md:flex items-center justify-between px-6 py-3">
        {/* Left: Navigation Stepper & Month Name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-xl border border-[var(--quant-surface-elevated)] text-[#A1A4AC] hover:text-white hover:bg-[var(--quant-surface-elevated)]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-xl border border-[var(--quant-surface-elevated)] text-[#A1A4AC] hover:text-white hover:bg-[var(--quant-surface-elevated)]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-[#F5F5F5] flex items-center gap-2">
            <span>{activeMonthName}</span>
            <span className="text-[#A1A4AC] font-normal">{activeYear}</span>
          </h2>

          <button
            type="button"
            onClick={goToday}
            className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-surface-elevated)] text-[#F5F5F5] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            Today
          </button>
        </div>

        {/* Right: Consolidated IST/PST Pill + Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Single Clean IST / PST Pill (Removes duplicate dropdowns & banners) */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] text-xs font-mono text-[var(--quant-warning)] shadow-inner select-none"
            title="Live Dual World Clocks: India Standard Time (IST) & Pacific Time"
          >
            <HeaderGlobeIcon className="size-3 text-[var(--quant-warning)]" />
            <span className="font-semibold text-white">IST</span>
            <span className="text-[#F5F5F5]">{istTime}</span>
            <span className="text-[#3A404D]" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-[#A1A4AC]">{pacificCode}</span>
            <span className="text-[#A1A4AC]">{pstTime}</span>
          </div>

          {onOpenBookingLinks && (
            <button
              type="button"
              onClick={onOpenBookingLinks}
              aria-label="Booking Links"
              className="px-3 py-1.5 rounded-lg font-medium text-xs text-[#F5F5F5] bg-[var(--quant-surface-elevated)] hover:bg-[#20232B] border border-[var(--quant-surface-elevated)] flex items-center gap-1.5 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              title="Share Booking Links"
            >
              <HeaderLinkIcon className="size-3.5 text-[var(--quant-primary)]" />
              <span>Booking Links</span>
            </button>
          )}

          {/* Split primary action: New Event in one tap; chevron opens the
              Event / Task / Birthday rows the floating FAB used to carry. */}
          <NewEntrySplitButton openDedicatedSheet={openDedicatedSheet} mainLabel="New Event" />
        </div>
      </div>

      {/* ======================================================================
          Mobile Clean 2-Row Layout (Collapsing 7-layer stacked header)
          ====================================================================== */}
      <div className="md:hidden px-3.5 py-2 space-y-2">
        {/* Row 1: Month Title & Navigation + Sleek Single + New Event Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="flex min-w-0 items-baseline gap-1.5 truncate text-base font-bold tracking-tight text-[#F5F5F5]">
              <span className="truncate">{activeMonthName}</span>
              <span className="font-normal text-xs text-[#A1A4AC]">{activeYear}</span>
            </h2>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                aria-label="Previous month"
                className="size-8 grid place-items-center rounded-lg border border-[var(--quant-surface-elevated)] text-[#A1A4AC] transition-colors hover:bg-[var(--quant-surface-elevated)]/80 hover:text-white"
              >
                <ChevronLeftIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="Next month"
                className="size-8 grid place-items-center rounded-lg border border-[var(--quant-surface-elevated)] text-[#A1A4AC] transition-colors hover:bg-[var(--quant-surface-elevated)]/80 hover:text-white"
              >
                <ChevronRightIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-8 rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-2.5 text-[11px] font-medium text-[#F5F5F5] transition-colors hover:bg-[var(--quant-surface-elevated)]"
              >
                Today
              </button>
            </div>
          </div>

          {/* Mobile primary action: Event in one tap; chevron carries the
              Task / Birthday rows the floating FAB used to carry. */}
          <NewEntrySplitButton openDedicatedSheet={openDedicatedSheet} mainLabel="Event" compact />
        </div>

        {/* Row 2: Single Clean IST/PST Pill + Booking Links */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--quant-surface)] border border-[var(--quant-surface-elevated)] text-[11px] font-mono text-[var(--quant-warning)] shadow-inner select-none"
            title="Live Dual World Clocks (IST & Pacific)"
          >
            <HeaderGlobeIcon className="size-3 text-[var(--quant-warning)]" />
            <span className="font-semibold text-white">IST</span>
            <span className="text-[#F5F5F5]">{istTime}</span>
            <span className="text-[#3A404D]">/</span>
            <span className="font-semibold text-[#A1A4AC]">{pacificCode}</span>
            <span className="text-[#A1A4AC]">{pstTime}</span>
          </div>

          {onOpenBookingLinks && (
            <button
              type="button"
              onClick={onOpenBookingLinks}
              aria-label="Booking Links"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-[11px] text-[#A1A4AC] hover:text-[#F5F5F5] bg-[var(--quant-surface-elevated)] hover:bg-[#20232B] border border-[var(--quant-surface-elevated)] transition-all"
              title="Share Booking Links"
            >
              <HeaderLinkIcon className="size-3 text-[var(--quant-primary)]" />
              <span>Booking</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
