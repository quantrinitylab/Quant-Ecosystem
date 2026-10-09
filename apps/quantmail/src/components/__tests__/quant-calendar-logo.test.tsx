// ============================================================================
// QuantCalendarLogo — the dynamic 3D calendar mark.
// Verifies: it renders a canvas (not the old static SVG), the accessible name
// carries the real current date, and it honours the configured calendar
// timezone (not just the device clock).
//
// Uses renderToStaticMarkup like the sibling shell tests — @testing-library
// is not installed in this app.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantCalendarLogo } from '../QuantCalendarLogo';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('QuantCalendarLogo', () => {
  it('renders a live canvas mark, not the old static SVG', () => {
    const html = renderToStaticMarkup(<QuantCalendarLogo size={32} />);
    expect(html).toContain('<canvas');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('qcal-bg');
  });

  it('exposes the real date in its accessible name', () => {
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    const html = renderToStaticMarkup(<QuantCalendarLogo size={32} />);
    expect(html).toMatch(/aria-label="QuantCalendar — [^"]*\d{4}/);
  });

  it('uses the configured calendar timezone for the painted date', () => {
    // 2026-10-09T00:30:00Z — Oct 9 in Kolkata, still Oct 8 in New York.
    vi.setSystemTime(new Date('2026-10-09T00:30:00Z'));
    // jsdom localStorage may not exist under renderToStaticMarkup; stub it.
    const store = new Map([['quant_calendar_timezone', 'America/New_York']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    const html = renderToStaticMarkup(<QuantCalendarLogo size={32} />);
    expect(html).toContain('QuantCalendar — Thu, Oct 8, 2026');
  });

  it('falls back to Asia/Kolkata when no timezone is configured', () => {
    vi.setSystemTime(new Date('2026-10-09T00:30:00Z'));
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });
    const html = renderToStaticMarkup(<QuantCalendarLogo size={32} />);
    expect(html).toContain('QuantCalendar — Fri, Oct 9, 2026');
  });
});
