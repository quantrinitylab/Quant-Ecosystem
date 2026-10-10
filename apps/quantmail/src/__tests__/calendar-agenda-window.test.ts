import { describe, it, expect } from 'vitest';
import {
  defaultEventWindow,
  agendaEventWindow,
  MAX_AGENDA_EVENT_WINDOW_DAYS,
} from '../app/calendar/lib/calendar-geometry';

const DAY_MS = 86_400_000;
// Fixed "today" so band boundaries are deterministic: Oct 11, 2026.
const TODAY = new Date(2026, 9, 11);

describe('agendaEventWindow', () => {
  it('equals the default 11-month band for the initial agenda range (no refetch churn on first load)', () => {
    const band = defaultEventWindow(TODAY);
    const w = agendaEventWindow(TODAY, { past: 14, future: 60 });
    expect(w.start).toBe(band.start);
    expect(w.end).toBe(band.end);
    expect(w.cappedPast).toBe(false);
    expect(w.cappedFuture).toBe(false);
  });

  it('grows the end when the agenda scrolls past the band edge (future)', () => {
    const band = defaultEventWindow(TODAY);
    // Initial future range (60d) sits well inside the ~172d band; 180d pushes
    // ~9d past the band edge but stays inside the 364-day cap's slack (~29d).
    const w = agendaEventWindow(TODAY, { past: 14, future: 180 });
    expect(new Date(w.end).getTime()).toBeGreaterThan(new Date(band.end).getTime());
    expect(w.start).toBe(band.start);
    expect(w.cappedFuture).toBe(false);
    expect(w.cappedPast).toBe(false);
  });

  it('grows the start when the agenda scrolls past the band edge (past)', () => {
    const band = defaultEventWindow(TODAY);
    // 180d past pushes ~17d past the band edge, still inside the cap's slack.
    const w = agendaEventWindow(TODAY, { past: 180, future: 60 });
    expect(new Date(w.start).getTime()).toBeLessThan(new Date(band.start).getTime());
    expect(w.end).toBe(band.end);
    expect(w.cappedPast).toBe(false);
    expect(w.cappedFuture).toBe(false);
  });

  it('clamps a huge two-sided extension to 364 days and reports both sides capped', () => {
    const w = agendaEventWindow(TODAY, { past: 500, future: 500 });
    const spanMs = new Date(w.end).getTime() - new Date(w.start).getTime();
    expect(spanMs).toBeLessThanOrEqual(MAX_AGENDA_EVENT_WINDOW_DAYS * DAY_MS);
    expect(spanMs).toBeGreaterThan((MAX_AGENDA_EVENT_WINDOW_DAYS - 1) * DAY_MS);
    expect(w.cappedPast).toBe(true);
    expect(w.cappedFuture).toBe(true);
    // The window must still contain `today` after clamping.
    expect(new Date(w.start).getTime()).toBeLessThanOrEqual(TODAY.getTime());
    expect(new Date(w.end).getTime()).toBeGreaterThanOrEqual(TODAY.getTime());
  });

  it('trims only the side being extended (one-sided scroll)', () => {
    const w = agendaEventWindow(TODAY, { past: 14, future: 500 });
    const spanMs = new Date(w.end).getTime() - new Date(w.start).getTime();
    expect(spanMs).toBeLessThanOrEqual(MAX_AGENDA_EVENT_WINDOW_DAYS * DAY_MS);
    expect(w.cappedFuture).toBe(true);
    expect(w.cappedPast).toBe(false);
    // The untouched side keeps the full default band.
    expect(w.start).toBe(defaultEventWindow(TODAY).start);
  });

  it('never exceeds 364 days and always contains today (property sweep)', () => {
    for (const past of [0, 14, 60, 150, 200, 365, 1000]) {
      for (const future of [0, 60, 120, 200, 300, 365, 1000]) {
        const w = agendaEventWindow(TODAY, { past, future });
        const startMs = new Date(w.start).getTime();
        const endMs = new Date(w.end).getTime();
        expect(endMs - startMs).toBeLessThanOrEqual(
          MAX_AGENDA_EVENT_WINDOW_DAYS * DAY_MS + 1, // 1ms: ISO-string rounding
        );
        expect(startMs).toBeLessThanOrEqual(TODAY.getTime());
        expect(endMs).toBeGreaterThanOrEqual(TODAY.getTime());
      }
    }
  });

  it('stays inside the backend 365-day WINDOW_TOO_LARGE contract', () => {
    const w = agendaEventWindow(TODAY, { past: 1000, future: 1000 });
    const spanDays = (new Date(w.end).getTime() - new Date(w.start).getTime()) / DAY_MS;
    expect(spanDays).toBeLessThanOrEqual(365);
  });
});
