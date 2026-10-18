// @vitest-environment jsdom
// ============================================================================
// QC-F-477 — Memories search date bounds are LOCAL calendar days.
//
// Defect (pre-fix): MemorySearch.apply() converted the picked dates with
// `new Date(value).toISOString()`. A date-only string parses as UTC
// midnight, so `to` bounded the search at the START of the picked day —
// the whole To-day vanished (in every timezone), a From=To single-day
// search was practically always empty, and `from` shifted by the local
// UTC offset. The backend contract is inclusive instants (gte/lte) and
// was never wrong; the client sent the wrong instants.
//
// These tests render the REAL MemorySearch and read the exact filter
// object it emits. They are timezone-sensitive by design: the suite is
// run under TZ=Asia/Kolkata, TZ=UTC and TZ=America/New_York, and the
// oracle below pins the exact ISO instant for each of those zones
// (independently computed UTC offsets: IST +05:30, UTC, EDT −04:00 —
// 2026-10-15 is after the US spring-forward and before fall-back).
// The America/New_York run is the anti-`setHours` trap: patching the
// parsed UTC-midnight date with setHours(23,59,…) lands on Oct 14
// there, so only component construction from the date parts passes.
//
// Negative control: on the pre-fix component every exact-bound pin
// fails (to = start-of-UTC-day), the remount display shows the UTC
// day via slice(0, 10), and an unparseable stored value throws.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  MemorySearch,
  toLocalDateValue,
  localDayStartIso,
  localDayEndIso,
} from '../app/memories/components/MemorySearch';
import type { MemoryFilters } from '../hooks/useMemories';

const DAY = '2026-10-15';

interface ZoneOracle {
  start: string;
  end: string;
  /** 12:00 local on the picked day, as an ISO instant. */
  midday: string;
  /** 12:00 local on the day before / after the picked day. */
  prevMidday: string;
  nextMidday: string;
}

const ORACLES: Record<string, ZoneOracle> = {
  'Asia/Kolkata': {
    start: '2026-10-14T18:30:00.000Z',
    end: '2026-10-15T18:29:59.999Z',
    midday: '2026-10-15T06:30:00.000Z',
    prevMidday: '2026-10-14T06:30:00.000Z',
    nextMidday: '2026-10-16T06:30:00.000Z',
  },
  UTC: {
    start: '2026-10-15T00:00:00.000Z',
    end: '2026-10-15T23:59:59.999Z',
    midday: '2026-10-15T12:00:00.000Z',
    prevMidday: '2026-10-14T12:00:00.000Z',
    nextMidday: '2026-10-16T12:00:00.000Z',
  },
  'America/New_York': {
    start: '2026-10-15T04:00:00.000Z',
    end: '2026-10-16T03:59:59.999Z',
    midday: '2026-10-15T16:00:00.000Z',
    prevMidday: '2026-10-14T16:00:00.000Z',
    nextMidday: '2026-10-16T16:00:00.000Z',
  },
};

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const oracle: ZoneOracle = ORACLES[zone] ?? {
  // Fallback for any other zone: derive from the local constructor —
  // still pins component behaviour + the full-day range properties.
  start: new Date(2026, 9, 15, 0, 0, 0, 0).toISOString(),
  end: new Date(2026, 9, 15, 23, 59, 59, 999).toISOString(),
  midday: new Date(2026, 9, 15, 12, 0, 0, 0).toISOString(),
  prevMidday: new Date(2026, 9, 14, 12, 0, 0, 0).toISOString(),
  nextMidday: new Date(2026, 9, 16, 12, 0, 0, 0).toISOString(),
};

// ─── Render harness (createRoot + act, the repo's component pattern) ──────

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderSearch(initial: MemoryFilters) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<MemorySearch filters={initial} onChange={onChange} onClear={onClear} />);
  });
  return { onChange, onClear };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  container = null;
});

function dateInputs(): HTMLInputElement[] {
  return Array.from(container!.querySelectorAll<HTMLInputElement>('input[type="date"]'));
}

function setDateInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickSearch() {
  const button = Array.from(container!.querySelectorAll('button')).find(
    (b) => b.textContent === 'Search',
  )!;
  act(() => {
    button.click();
  });
}

function emitted(onChange: ReturnType<typeof vi.fn>): MemoryFilters {
  expect(onChange).toHaveBeenCalledTimes(1);
  return onChange.mock.calls[0][0] as MemoryFilters;
}

// ─── Bounds emitted by apply() ─────────────────────────────────────────────

describe('QC-F-477 MemorySearch local-day bounds', () => {
  it('T1: To alone bounds at the END of the picked local day', () => {
    const { onChange } = renderSearch({});
    const [, to] = dateInputs();
    setDateInput(to, DAY);
    clickSearch();
    const out = emitted(onChange);
    expect(out.to).toBe(oracle.end);
    expect(out.from).toBeUndefined();
  });

  it('T2: From alone bounds at the START of the picked local day', () => {
    const { onChange } = renderSearch({});
    const [from] = dateInputs();
    setDateInput(from, DAY);
    clickSearch();
    const out = emitted(onChange);
    expect(out.from).toBe(oracle.start);
    expect(out.to).toBeUndefined();
  });

  it('T3: From=To (single-day search) covers the whole picked day and nothing else', () => {
    const { onChange } = renderSearch({});
    const [from, to] = dateInputs();
    setDateInput(from, DAY);
    setDateInput(to, DAY);
    clickSearch();
    const out = emitted(onChange);
    expect(out.from).toBe(oracle.start);
    expect(out.to).toBe(oracle.end);
    // Simulate the backend's inclusive gte/lte on createdAt.
    const inside = (iso: string) => iso >= out.from! && iso <= out.to!;
    expect(inside(oracle.midday)).toBe(true);
    expect(inside(oracle.start)).toBe(true);
    expect(inside(oracle.end)).toBe(true);
    expect(inside(oracle.prevMidday)).toBe(false);
    expect(inside(oracle.nextMidday)).toBe(false);
    // A real span, not the pre-fix single instant from == to.
    expect(Date.parse(out.to!) - Date.parse(out.from!)).toBeGreaterThan(23 * 3600 * 1000);
  });

  it('T4: a range keeps both picked days fully (From start … To end)', () => {
    const { onChange } = renderSearch({});
    const [from, to] = dateInputs();
    setDateInput(from, '2026-10-10');
    setDateInput(to, DAY);
    clickSearch();
    const out = emitted(onChange);
    expect(out.to).toBe(oracle.end);
    // From is the start of ITS local day: exactly 5 local days before.
    expect(Date.parse(out.from!)).toBe(Date.parse(oracle.start) - 5 * 24 * 3600 * 1000);
  });

  it('T5: no dates → no from/to filters; caption/location pass through trimmed', () => {
    const { onChange } = renderSearch({ q: '  beach day  ', location: ' Goa ' });
    clickSearch();
    const out = emitted(onChange);
    expect(out).toEqual({ q: 'beach day', location: 'Goa' });
  });
});

// ─── Display + idempotence (the slice(0, 10) round-trip trap) ──────────────

describe('QC-F-477 MemorySearch display + re-apply', () => {
  it('T6: remounted with emitted ISO bounds, inputs still show the picked day and Search is idempotent', () => {
    const { onChange } = renderSearch({ from: oracle.start, to: oracle.end });
    const [from, to] = dateInputs();
    // slice(0, 10) would show 2026-10-14 (Kolkata from) / 2026-10-16 (NY to).
    expect(from.value).toBe(DAY);
    expect(to.value).toBe(DAY);
    clickSearch();
    const out = emitted(onChange);
    expect(out.from).toBe(oracle.start);
    expect(out.to).toBe(oracle.end);
  });

  it('T7: unparseable stored value drops the filter instead of throwing', () => {
    const { onChange } = renderSearch({ from: 'not-a-date' });
    clickSearch();
    const out = emitted(onChange);
    expect(out.from).toBeUndefined();
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('QC-F-477 local-day helpers', () => {
  it('T8: bounds are built from date parts (exact instants for this zone)', () => {
    expect(localDayStartIso(DAY)).toBe(oracle.start);
    expect(localDayEndIso(DAY)).toBe(oracle.end);
  });

  it('T9: an ISO instant normalizes back to its LOCAL calendar day', () => {
    expect(toLocalDateValue(oracle.start)).toBe(DAY);
    expect(toLocalDateValue(oracle.end)).toBe(DAY);
    expect(toLocalDateValue(DAY)).toBe(DAY);
    expect(toLocalDateValue(undefined)).toBe('');
  });

  it('T10: invalid values are rejected, never rolled over or thrown', () => {
    expect(localDayStartIso('2026-13-40')).toBeNull();
    expect(localDayEndIso('not-a-date')).toBeNull();
    expect(localDayStartIso(undefined)).toBeNull();
    expect(toLocalDateValue('not-a-date')).toBe('');
  });
});
