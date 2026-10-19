// @vitest-environment jsdom
// ============================================================================
// Share-availability insertion in compose (P2 competitor-gap finding).
//
// Superhuman's Share Availability and Gmail's Calendar insertion let the
// user drop open calendar slots into a draft; neither QuantMail composer had
// any availability hook (grep -ci "availab" on both composers = 0).
//
// Layers, following this repo's established test conventions:
//  1. Pure-function: availability.ts — day window, free-busy fetch contract
//     (honest errors, no invented data), slot suggestion skipping real busy
//     blocks, and the inserted text format.
//  2. Behavioural: the real AvailabilityInserter mounted under jsdom, driven
//     through its real UI (button -> day chip -> Find open slots -> Insert)
//     with a fake free-busy fetch — slots appear, Insert hands the text
//     block to onInsert, errors and empty days surface honestly.
//  3. Wiring pins: readFileSync source assertions on EmailComposer.tsx and
//     DockedComposer.tsx — these fail on the pre-fix code, which had no
//     AvailabilityInserter import, no toolbar entry, and no insertion
//     handler.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The package index re-exports proxy.ts (imports next/server), which cannot
// resolve under vitest from the package dir. Every test below injects its
// own fetchImpl, so the boundary is mocked; the real contract is pinned by
// the source-wiring tests and CalendarEventForm's identical usage.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));
import {
  fetchAvailability,
  fetchBusyIntervals,
  buildAvailabilityInsertText,
  availabilityDayWindow,
  parseDateInputValue,
  toDateInputValue,
  dayOffsetDate,
  AVAILABILITY_ENDPOINT,
  type FreeSlot,
} from '../lib/availability';
import { AvailabilityInserter } from '../components/AvailabilityInserter';

const emailComposerSource = readFileSync(
  join(import.meta.dirname, '../components/EmailComposer.tsx'),
  'utf8',
);
const dockedComposerSource = readFileSync(
  join(import.meta.dirname, '../components/DockedComposer.tsx'),
  'utf8',
);

/** Tomorrow at local HH:MM, ISO string — deterministic busy blocks. */
function tomorrowISO(hour: number, minute = 0): string {
  const d = dayOffsetDate(1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

type FakeFetch = (path: string, init: unknown) => Promise<unknown>;

function fakeOkFetch(
  busy: Array<{ start: string; end: string }>,
  onPath?: (path: string) => void,
): FakeFetch {
  return async (path: string) => {
    onPath?.(path);
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { busy } }),
    };
  };
}

// ---------------------------------------------------------------------------
// 1. Pure-function layer
// ---------------------------------------------------------------------------

describe('availability lib (pure)', () => {
  it('builds the 08:00–20:00 local window for the given day', () => {
    const day = new Date(2026, 9, 21, 15, 30); // Oct 21 2026 local
    const { dayStart, dayEnd } = availabilityDayWindow(day);
    expect(dayStart.getHours()).toBe(8);
    expect(dayStart.getMinutes()).toBe(0);
    expect(dayEnd.getHours()).toBe(20);
    expect(dayStart.getDate()).toBe(21);
    expect(dayEnd.getDate()).toBe(21);
  });

  it('formats the inserted text as a day header plus bullet slot lines', () => {
    const day = new Date(2026, 9, 21, 12, 0);
    const slots: FreeSlot[] = [
      { start: new Date(2026, 9, 21, 10, 30), end: new Date(2026, 9, 21, 11, 0) },
      { start: new Date(2026, 9, 21, 14, 0), end: new Date(2026, 9, 21, 14, 30) },
    ];
    const text = buildAvailabilityInsertText(day, slots);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^I'm available on .+ \([^)]*\):$/);
    expect(lines[0].endsWith(':')).toBe(true);
    expect(lines[1]).toMatch(/^• \d{1,2}:\d{2}.*–.*\d{1,2}:\d{2}/);
    expect(lines[2]).toMatch(/^• /);
    expect(lines).toHaveLength(3);
  });

  it('hits the real free-busy endpoint with the day window params', async () => {
    const seen: string[] = [];
    const fetchImpl = fakeOkFetch([], (p) => seen.push(p)) as never;
    await fetchBusyIntervals('2026-10-21T02:30:00.000Z', '2026-10-21T14:30:00.000Z', fetchImpl);
    expect(seen).toEqual([AVAILABILITY_ENDPOINT]);
  });

  it('suggests slots that skip real busy blocks', async () => {
    const fetchImpl = fakeOkFetch([
      { start: tomorrowISO(10), end: tomorrowISO(11) },
    ]) as never;
    // "now" pinned to the window start so past-skipping never interferes.
    const { dayStart } = availabilityDayWindow(dayOffsetDate(1));
    const { slots } = await fetchAvailability(dayOffsetDate(1), 30, {
      fetchImpl,
      nowMs: dayStart.getTime(),
    });
    expect(slots.length).toBeGreaterThan(0);
    // First slot opens the day …
    expect(slots[0].start.getHours()).toBe(8);
    // … and nothing overlaps the 10:00–11:00 busy block.
    for (const s of slots) {
      const busy = { s: new Date(tomorrowISO(10)).getTime(), e: new Date(tomorrowISO(11)).getTime() };
      const overlaps = s.start.getTime() < busy.e && s.end.getTime() > busy.s;
      expect(overlaps).toBe(false);
    }
    // A slot starts exactly when the busy block ends.
    expect(
      slots.some((s) => s.start.getTime() === new Date(tomorrowISO(11)).getTime()),
    ).toBe(true);
  });

  it('returns an empty slot list — never invented slots — on an all-day busy day', async () => {
    const fetchImpl = fakeOkFetch([
      { start: tomorrowISO(7), end: tomorrowISO(21) },
    ]) as never;
    const { dayStart } = availabilityDayWindow(dayOffsetDate(1));
    const { slots } = await fetchAvailability(dayOffsetDate(1), 30, {
      fetchImpl,
      nowMs: dayStart.getTime(),
    });
    expect(slots).toEqual([]);
  });

  it('throws an honest error when the endpoint 500s', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as never;
    await expect(
      fetchAvailability(dayOffsetDate(1), 30, { fetchImpl }),
    ).rejects.toThrow('Availability check failed (500)');
  });

  it('lets transport failures propagate with their real message', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as never;
    await expect(
      fetchAvailability(dayOffsetDate(1), 30, { fetchImpl }),
    ).rejects.toThrow('network down');
  });

  it('drops malformed busy entries instead of inventing intervals', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          busy: [
            { start: tomorrowISO(10), end: tomorrowISO(11) },
            { start: null, end: tomorrowISO(12) },
            { start: tomorrowISO(12) },
            'garbage',
          ],
        },
      }),
    })) as never;
    const intervals = await fetchBusyIntervals('a', 'b', fetchImpl);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({
      start: tomorrowISO(10),
      end: tomorrowISO(11),
    });
  });

  it('parses native date-input values strictly', () => {
    const d = parseDateInputValue('2026-10-21');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(9);
    expect(d!.getDate()).toBe(21);
    expect(parseDateInputValue('2026-13-01')).toBeNull();
    expect(parseDateInputValue('2026-02-30')).toBeNull();
    expect(parseDateInputValue('not-a-date')).toBeNull();
    expect(parseDateInputValue('')).toBeNull();
  });

  it('round-trips a date through the date-input value format', () => {
    const d = new Date(2026, 9, 21, 12, 0);
    expect(toDateInputValue(d)).toBe('2026-10-21');
    const back = parseDateInputValue(toDateInputValue(d));
    expect(back!.getDate()).toBe(21);
  });
});

// ---------------------------------------------------------------------------
// 2. Behavioural layer — the real component under jsdom
// ---------------------------------------------------------------------------

describe('AvailabilityInserter component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React 19's act(...) requires this flag in the test environment.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  async function mount(
    fetchImpl: FakeFetch,
    onInsert = vi.fn(),
  ): Promise<{
    onInsert: ReturnType<typeof vi.fn>;
    unmount: () => Promise<void>;
  }> {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AvailabilityInserter
          onInsert={onInsert}
          fetchImpl={fetchImpl as never}
        />,
      );
    });
    return {
      onInsert,
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  async function openPanelAndFind(
    fetchImpl: FakeFetch,
  ): Promise<ReturnType<typeof vi.fn>> {
    const { act } = await import('react');
    const onInsert = vi.fn();
    await mount(fetchImpl, onInsert);
    const button = document.querySelector(
      '[data-testid="availability-inserter-button"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const panel = document.querySelector('[data-testid="availability-panel"]');
    expect(panel).not.toBeNull();
    // Deterministic day: Tomorrow (default is already tomorrow, but click it
    // explicitly so the test pins the control, not the default).
    const tomorrowChip = document.querySelector(
      '[data-testid="availability-day-1"]',
    ) as HTMLButtonElement;
    await act(async () => {
      tomorrowChip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const findButton = document.querySelector(
      '[data-testid="availability-find-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      findButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return onInsert;
  }

  it('renders a toolbar button labelled Share availability', async () => {
    const { unmount } = await mount(fakeOkFetch([]));
    const button = document.querySelector(
      '[data-testid="availability-inserter-button"]',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Share availability');
    await unmount();
  });

  it('shows slot rows from real busy data and inserts one on click', async () => {
    const { act } = await import('react');
    const onInsert = await openPanelAndFind(
      fakeOkFetch([{ start: tomorrowISO(10), end: tomorrowISO(11) }]),
    );
    const rows = document.querySelectorAll('[data-testid="availability-slot-row"]');
    expect(rows.length).toBeGreaterThan(0);
    const firstInsert = document.querySelector(
      '[data-testid="availability-slot-insert"]',
    ) as HTMLButtonElement;
    await act(async () => {
      firstInsert.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onInsert).toHaveBeenCalledTimes(1);
    const text = onInsert.mock.calls[0][0] as string;
    expect(text).toMatch(/^I'm available on /);
    expect(text).toContain('•');
    // The inserted block never overlaps the 10:00–11:00 busy block.
    expect(text).not.toContain('10:00');
  });

  it('inserts every slot on Insert all', async () => {
    const { act } = await import('react');
    const onInsert = await openPanelAndFind(fakeOkFetch([]));
    const rows = document.querySelectorAll('[data-testid="availability-slot-row"]');
    expect(rows.length).toBe(6); // maxSlots
    const insertAll = document.querySelector(
      '[data-testid="availability-insert-all"]',
    ) as HTMLButtonElement;
    await act(async () => {
      insertAll.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onInsert).toHaveBeenCalledTimes(1);
    const text = onInsert.mock.calls[0][0] as string;
    const bullets = text.split('\n').filter((l) => l.startsWith('•'));
    expect(bullets).toHaveLength(6);
  });

  it('shows an honest error when the fetch fails', async () => {
    const onInsert = await openPanelAndFind(async () => {
      throw new Error('calendar service unreachable');
    });
    const error = document.querySelector('[data-testid="availability-error"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain('calendar service unreachable');
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('shows an honest empty state on an all-day busy day', async () => {
    await openPanelAndFind(
      fakeOkFetch([{ start: tomorrowISO(7), end: tomorrowISO(21) }]),
    );
    const empty = document.querySelector('[data-testid="availability-empty"]');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('No open');
  });

  it('says guests calendars are not visible — no invented availability', async () => {
    const { act } = await import('react');
    await mount(fakeOkFetch([]));
    const button = document.querySelector(
      '[data-testid="availability-inserter-button"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const panel = document.querySelector('[data-testid="availability-panel"]');
    expect(panel!.textContent).toContain("guests' availability isn't visible");
  });
});

// ---------------------------------------------------------------------------
// 3. Wiring pins — both composers must host the inserter
// ---------------------------------------------------------------------------

describe('composer wiring', () => {
  it('EmailComposer hosts the AvailabilityInserter in its toolbar', () => {
    expect(emailComposerSource).toContain(
      "import { AvailabilityInserter } from './AvailabilityInserter';",
    );
    expect(emailComposerSource).toContain(
      '<AvailabilityInserter onInsert={insertAvailabilityText} />',
    );
    expect(emailComposerSource).toContain('const insertAvailabilityText');
  });

  it('DockedComposer hosts the AvailabilityInserter in its toolbar', () => {
    expect(dockedComposerSource).toContain(
      "import { AvailabilityInserter } from './AvailabilityInserter';",
    );
    expect(dockedComposerSource).toContain('variant="labeled"');
    expect(dockedComposerSource).toContain('insertAvailabilityText');
  });

  it('both composers append (never clobber) the availability text', () => {
    for (const src of [emailComposerSource, dockedComposerSource]) {
      expect(src).toContain('${prev}\\n\\n${text}');
    }
  });
});
