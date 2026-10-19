import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetchRaw } from '@quant/api-client';
import { IconCalendar } from './icons';
import { showToast } from './InboxToast';
import {
  fetchAvailability,
  buildAvailabilityInsertText,
  formatAvailabilityDay,
  dayOffsetDate,
  toDateInputValue,
  parseDateInputValue,
  type FreeSlot,
} from '../lib/availability';
import { formatSlotLabel } from '../app/calendar/lib/free-busy-slots';

/**
 * Share-availability toolbar entry (Superhuman "Share Availability" parity).
 *
 * Renders a toolbar button plus a portaled dropup panel: pick a day and a
 * duration, find the user's real open slots via GET
 * /api/calendar/events/free-busy, and insert them into the draft as plain
 * text. The host composer supplies `onInsert`; everything else (anchor,
 * portal positioning, fetch, error/empty states) is self-contained so both
 * EmailComposer and DockedComposer can drop it into their toolbars.
 *
 * No fake data: slots come from the user's real calendar busy blocks, and
 * the panel says plainly that guests' calendars are not visible to
 * QuantMail. Failures surface as honest error text, never invented slots.
 */
export interface AvailabilityInserterProps {
  /** Insert the built text block into the draft (host appends it). */
  onInsert: (text: string) => void;
  /** 'icon' = icon-only button (EmailComposer); 'labeled' = pill button. */
  variant?: 'icon' | 'labeled';
  /** Test seam for the free-busy fetch. */
  fetchImpl?: typeof apiFetchRaw;
}

type FindState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; day: Date; slots: FreeSlot[] }
  | { status: 'error'; message: string };

const DURATION_OPTIONS = [15, 30, 45, 60];

export function AvailabilityInserter({
  onInsert,
  variant = 'icon',
  fetchImpl,
}: AvailabilityInserterProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const [selectedDay, setSelectedDay] = useState<Date>(() => dayOffsetDate(1));
  const [durationMin, setDurationMin] = useState(30);
  const [findState, setFindState] = useState<FindState>({ status: 'idle' });
  const anchorRef = useRef<HTMLDivElement>(null);

  const quickDays = useMemo(
    () => [
      { offset: 0, label: 'Today', date: dayOffsetDate(0) },
      { offset: 1, label: 'Tomorrow', date: dayOffsetDate(1) },
      {
        offset: 2,
        label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
          dayOffsetDate(2),
        ),
        date: dayOffsetDate(2),
      },
    ],
    [],
  );

  // A new day resets stale results — slots are date-specific.
  const selectDay = (date: Date) => {
    setSelectedDay(date);
    setFindState({ status: 'idle' });
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // Escape closes the panel (the fixed overlay also closes it on click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  const toggleOpen = () => {
    if (!open && anchorRef.current) {
      // Capture the anchor rect BEFORE opening, so the portaled panel can
      // position itself above the button even though the toolbar scrolls
      // horizontally on mobile.
      const rect = anchorRef.current.getBoundingClientRect();
      setMenuPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 316)),
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
      });
    }
    setOpen((prev) => !prev);
  };

  const handleFind = async () => {
    setFindState({ status: 'loading' });
    try {
      const { slots } = await fetchAvailability(selectedDay, durationMin, {
        fetchImpl,
      });
      setFindState({ status: 'ready', day: selectedDay, slots });
    } catch (error) {
      setFindState({
        status: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Availability check failed',
      });
    }
  };

  const insertSlots = (day: Date, slots: FreeSlot[], closeAfter: boolean) => {
    const text = buildAvailabilityInsertText(day, slots);
    onInsert(text);
    showToast({ text: 'Availability inserted into draft', type: 'success' });
    if (closeAfter) setOpen(false);
  };

  const buttonClass =
    variant === 'labeled'
      ? "relative flex items-center gap-1.5 px-3 py-2 rounded-xl after:absolute after:-inset-[6px] after:content-[''] border border-[var(--quant-primary)]/40 bg-[var(--quant-primary)]/10 text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/20 hover:border-[var(--quant-primary)] transition-all text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
      : 'inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]';

  return (
    <>
      <div className="relative inline-flex" ref={anchorRef}>
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label="Share availability"
          data-testid="availability-inserter-button"
          title="Share availability — insert open calendar slots into the draft"
          className={buttonClass}
        >
          <IconCalendar className="size-4" />
          {variant === 'labeled' && <span>Availability</span>}
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              className="fixed z-50 w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] shadow-2xl p-4 text-sm"
              style={
                menuPos
                  ? { left: menuPos.left, bottom: menuPos.bottom }
                  : { left: 12, bottom: 76 }
              }
              role="dialog"
              aria-label="Share availability"
              data-testid="availability-panel"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[var(--quant-foreground)] font-semibold">
                  Share availability
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close availability panel"
                  className="p-1.5 rounded-lg text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-[var(--quant-muted-foreground)] mb-3">
                Checks only your own calendar — guests&apos; availability
                isn&apos;t visible to QuantMail.
              </p>

              {/* Day picker */}
              <div className="flex gap-1.5 mb-2">
                {quickDays.map((q) => (
                  <button
                    key={q.offset}
                    type="button"
                    onClick={() => selectDay(q.date)}
                    data-testid={`availability-day-${q.offset}`}
                    aria-pressed={isSameDay(selectedDay, q.date)}
                    className={`flex-1 min-h-[44px] px-2 rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] ${
                      isSameDay(selectedDay, q.date)
                        ? 'bg-[var(--quant-primary)]/20 text-[var(--brand-accent)] border border-[var(--quant-primary)]/40'
                        : 'text-[var(--quant-muted-foreground)] border border-transparent hover:text-[var(--quant-foreground)] hover:bg-white/5'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="date"
                  aria-label="Pick a day"
                  data-testid="availability-date-input"
                  value={toDateInputValue(selectedDay)}
                  min={toDateInputValue(dayOffsetDate(0))}
                  onChange={(e) => {
                    const parsed = parseDateInputValue(e.target.value);
                    if (parsed) selectDay(parsed);
                  }}
                  className="flex-1 min-h-[44px] px-2 rounded-xl text-xs bg-black/40 border border-[var(--quant-surface-elevated)] text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] [color-scheme:dark]"
                />
                <select
                  aria-label="Meeting duration"
                  data-testid="availability-duration-select"
                  value={durationMin}
                  onChange={(e) => {
                    setDurationMin(Number(e.target.value));
                    setFindState({ status: 'idle' });
                  }}
                  className="min-h-[44px] px-2 rounded-xl text-xs bg-black/40 border border-[var(--quant-surface-elevated)] text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => void handleFind()}
                disabled={findState.status === 'loading'}
                data-testid="availability-find-button"
                className="w-full min-h-[44px] rounded-xl bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] text-[#111111] text-xs font-semibold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              >
                {findState.status === 'loading'
                  ? 'Finding open slots…'
                  : 'Find open slots'}
              </button>

              {/* Results */}
              {findState.status === 'ready' && (
                <div className="mt-3">
                  {findState.slots.length === 0 ? (
                    <p
                      data-testid="availability-empty"
                      className="text-xs text-[var(--quant-muted-foreground)]"
                    >
                      No open {durationMin}-minute slots on{' '}
                      {formatAvailabilityDay(findState.day)} — try another day
                      or a shorter duration.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          {findState.slots.length} open on{' '}
                          {formatAvailabilityDay(findState.day)}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            insertSlots(findState.day, findState.slots, true)
                          }
                          data-testid="availability-insert-all"
                          className="text-xs font-semibold text-[var(--quant-primary)] hover:text-[var(--brand-accent)] min-h-[44px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] rounded-lg"
                        >
                          Insert all
                        </button>
                      </div>
                      <ul className="space-y-1.5">
                        {findState.slots.map((slot, i) => (
                          <li
                            key={`${slot.start.getTime()}-${i}`}
                            data-testid="availability-slot-row"
                            className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-1.5"
                          >
                            <span className="text-xs text-[var(--quant-foreground)]">
                              {formatSlotLabel(slot)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                insertSlots(findState.day, [slot], false)
                              }
                              data-testid="availability-slot-insert"
                              className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-[var(--quant-primary)] hover:text-[var(--brand-accent)] hover:bg-[var(--quant-primary)]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                            >
                              Insert
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {findState.status === 'error' && (
                <p
                  data-testid="availability-error"
                  role="alert"
                  className="mt-3 text-xs text-rose-400"
                >
                  {findState.message}
                </p>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export default AvailabilityInserter;
