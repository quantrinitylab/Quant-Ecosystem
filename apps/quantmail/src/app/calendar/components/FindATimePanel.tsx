'use client';

// ============================================================================
// FindATimePanel — "Find a time" affordance for the event form's guest section.
//
// Queries the EXISTING GET /events/free-busy endpoint for the organizer's own
// busy blocks, scans the next 7 days for open slots that fit the event's
// duration, and lets the organizer drop a slot into the form with one tap.
//
// Honesty contract (no fake data, ever):
//   * Suggestions are checked against the ORGANIZER's calendar only.
//   * Guest free/busy is not shared by the backend, so per guest we say
//     "availability not shared" — we never invent or scrape it.
//   * Loading / error / empty states are plain text, never placeholders
//     that look like results.
// ============================================================================

import React, { useState } from 'react';
import { IconClock, IconX } from '../../../components/icons';
import { apiClient } from '../../../services/api-client';
import { toDateInput, toTimeInput } from '../lib/calendar-geometry';
import { suggestOpenSlots, formDurationMs, type TimeSlot } from '../lib/find-a-time';

export interface FindATimeSlot {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export interface FindATimePanelProps {
  attendees: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  onApplySlot: (slot: FindATimeSlot) => void;
}

type PanelState = 'idle' | 'loading' | 'error' | 'done';

const SEARCH_DAYS = 7;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

function formatSlot(slot: TimeSlot): string {
  const day = slot.start.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time(slot.start)} – ${time(slot.end)}`;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function FindATimePanel({
  attendees,
  startDate,
  endDate,
  startTime,
  endTime,
  allDay,
  onApplySlot,
}: FindATimePanelProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState>('idle');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [durationUsedMs, setDurationUsedMs] = useState<number>(0);

  const findTime = async () => {
    setOpen(true);
    setState('loading');
    setError(null);
    setSlots([]);

    const durationMs = allDay ? 30 * 60 * 1000 : formDurationMs(startDate, startTime, endDate, endTime);
    setDurationUsedMs(durationMs);

    // Search from the event's own date when it's in the future, else today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let windowStart = new Date(today);
    const eventDay = Date.parse(startDate);
    if (!Number.isNaN(eventDay)) {
      const d = new Date(eventDay);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() > today.getTime()) windowStart = d;
    }
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + SEARCH_DAYS);

    try {
      const response = await apiClient.getFreeBusy({
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load your calendar');
      }
      const busy = response.data?.busy ?? [];
      const found = suggestOpenSlots(busy, windowStart, windowEnd, {
        durationMs,
        dayStartHour: WORK_START_HOUR,
        dayEndHour: WORK_END_HOUR,
        granularityMinutes: 30,
        maxSuggestions: 6,
      });
      setSlots(found);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your calendar');
      setState('error');
    }
  };

  const applySlot = (slot: TimeSlot) => {
    onApplySlot({
      startDate: toDateInput(slot.start),
      endDate: toDateInput(slot.end),
      startTime: toTimeInput(slot.start),
      endTime: toTimeInput(slot.end),
    });
    setOpen(false);
    setState('idle');
  };

  return (
    <div className="pl-7 pt-1">
      {!open ? (
        <button
          type="button"
          onClick={findTime}
          aria-expanded={open}
          className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          <IconClock className="size-3.5" />
          Find a time
        </button>
      ) : (
        <div className="rounded-lg bg-[var(--quant-surface-elevated)]/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--quant-foreground)]">
              Suggested times
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setState('idle');
              }}
              aria-label="Close find a time"
              className="inline-flex items-center justify-center size-7 rounded text-[var(--quant-muted-foreground)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              <IconX size={13} />
            </button>
          </div>

          <div aria-live="polite">
            {state === 'loading' && (
              <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                Checking your calendar…
              </p>
            )}

            {state === 'error' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-rose-400">
                  Couldn&apos;t check your calendar{error ? `: ${error}` : '.'}
                </p>
                <button
                  type="button"
                  onClick={findTime}
                  className="text-[11px] font-semibold text-[var(--app-accent)] underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}

            {state === 'done' && slots.length === 0 && (
              <p className="text-[11px] text-[var(--quant-muted-foreground)]">
                No open {formatDuration(durationUsedMs)} slots in the next {SEARCH_DAYS} days
                ({WORK_START_HOUR}:00–{WORK_END_HOUR}:00). Your calendar looks full.
              </p>
            )}

            {state === 'done' && slots.length > 0 && (
              <ul className="space-y-1">
                {slots.map((slot) => (
                  <li key={slot.start.toISOString()}>
                    <button
                      type="button"
                      onClick={() => applySlot(slot)}
                      className="w-full min-h-[40px] flex items-center justify-between rounded-md bg-black/30 px-2.5 py-1.5 text-left text-[11px] text-[var(--quant-foreground)] hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                    >
                      <span>{formatSlot(slot)}</span>
                      <span className="font-semibold text-[var(--app-accent)]">Set</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1 pt-1">
            <p className="text-[10px] text-[var(--quant-text-muted)]">
              Checked against your calendar only.
            </p>
            {attendees.map((email) => (
              <p key={email} className="text-[10px] text-[var(--quant-text-muted)]">
                {email} — availability not shared
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
