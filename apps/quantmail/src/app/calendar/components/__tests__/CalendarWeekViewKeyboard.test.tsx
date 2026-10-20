// @vitest-environment jsdom
// ============================================================================
// fix/qm-calendar-keyboard-triage — week-view day-column keyboard triage + the
// header's shortcuts-sheet affordance.
//
// The finding's week-view clause: day columns bound only Enter. This pins the
// fixed behavior through real DOM events (jsdom + createRoot + act, no
// @testing-library/react — the apps/quantmail package does not depend on it,
// and CI installs with --frozen-lockfile):
//
//   1. Enter still opens the sheet for the focused day (existing, pinned).
//   2. `c` opens the sheet for the focused day and swallows the event, so the
//      document-level `c` (new event on the selected date) does not double-fire.
//   3. ArrowLeft/ArrowRight move focus between day columns (roving focus);
//      the edges stay put.
//   4. The header renders a keyboard-shortcuts button that opens the `?` sheet
//      on click — the sheet was key-only, nothing in the UI said it existed.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarWeekView } from '../CalendarWeekView';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { mockOpenHelp } = vi.hoisted(() => ({ mockOpenHelp: vi.fn() }));

// The surfaces context is provider-optional (inert no-ops outside it). Mock it
// so the click test can observe the button's wiring without mounting the whole
// KeyboardProvider (useRouter, outbox replay, …).
vi.mock('../../../../components/KeyboardProvider', () => ({
  useKeyboardSurfaces: () => ({
    isPaletteOpen: false,
    openPalette: () => {},
    closePalette: () => {},
    isHelpOpen: false,
    openHelp: mockOpenHelp,
    closeHelp: () => {},
  }),
}));

import { CalendarHeader } from '../CalendarHeader';

const noop = () => {};

function press(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

function renderWeek(openDedicatedSheet: (...args: never[]) => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <CalendarWeekView
        events={[]}
        selectedDate={new Date(2026, 9, 20, 12, 0, 0)}
        onSelectDate={noop}
        openDedicatedSheet={openDedicatedSheet}
        onSelectEvent={noop}
      />,
    );
  });
  const cols = Array.from(
    container.querySelectorAll('[data-week-day-index]'),
  ) as HTMLElement[];
  return {
    cols,
    cleanup() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

describe('CalendarWeekView day-column keyboard', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  it('renders seven focusable day columns', () => {
    const { cols, cleanup } = renderWeek(vi.fn());
    cleanups.push(cleanup);
    expect(cols.length).toBe(7);
    for (const col of cols) expect(col.tabIndex).toBe(0);
  });

  it('opens the sheet for the focused day on Enter (existing behavior, pinned)', () => {
    const spy = vi.fn();
    const { cols, cleanup } = renderWeek(spy);
    cleanups.push(cleanup);
    press(cols[2], 'Enter');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('event');
    expect(spy.mock.calls[0][1]).toBeInstanceOf(Date);
  });

  it('opens the sheet on `c` for the focused day and swallows the document-level `c`', () => {
    const spy = vi.fn();
    const { cols, cleanup } = renderWeek(spy);
    cleanups.push(cleanup);
    const docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
    try {
      press(cols[4], 'c');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe('event');
      expect(spy.mock.calls[0][1]).toBeInstanceOf(Date);
      // The calendar scope also binds `c` (new event) at the document level —
      // the column must stop it so the sheet opens once, on THIS day, instead
      // of firing again on the selected date.
      expect(docSpy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', docSpy);
    }
  });

  it('moves focus between day columns on ArrowLeft/ArrowRight and stays at the edges', () => {
    const { cols, cleanup } = renderWeek(vi.fn());
    cleanups.push(cleanup);
    cols[0].focus();
    press(cols[0], 'ArrowRight');
    expect(document.activeElement).toBe(cols[1]);
    press(cols[1], 'ArrowLeft');
    expect(document.activeElement).toBe(cols[0]);
    // Left edge: stays.
    press(cols[0], 'ArrowLeft');
    expect(document.activeElement).toBe(cols[0]);
    // Right edge: stays.
    cols[6].focus();
    press(cols[6], 'ArrowRight');
    expect(document.activeElement).toBe(cols[6]);
  });

  it('advertises the keys in the column aria-label', () => {
    const { cols, cleanup } = renderWeek(vi.fn());
    cleanups.push(cleanup);
    expect(cols[0].getAttribute('aria-label')).toContain('left and right arrows');
    expect(cols[0].getAttribute('aria-label')).toContain('Enter or C');
  });
});

describe('CalendarHeader shortcuts affordance', () => {
  const base = {
    activeMonthName: 'October',
    activeYear: 2026,
    goMonth: noop,
    goToday: noop,
    openDedicatedSheet: noop,
  };

  it('renders a keyboard-shortcuts button that names the `?` key', () => {
    const html = renderToStaticMarkup(<CalendarHeader {...base} />);
    expect(html).toContain('aria-label="Keyboard shortcuts"');
    expect(html).toContain('Keyboard shortcuts (?)');
  });

  it('opens the `?` shortcuts sheet when the button is clicked', () => {
    mockOpenHelp.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root | null = null;
    act(() => {
      root = createRoot(container);
      root.render(<CalendarHeader {...base} />);
    });
    try {
      const button = container.querySelector(
        'button[aria-label="Keyboard shortcuts"]',
      );
      expect(button).not.toBeNull();
      act(() => {
        button!.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
      });
      expect(mockOpenHelp).toHaveBeenCalledTimes(1);
    } finally {
      act(() => {
        root?.unmount();
      });
      container.remove();
    }
  });
});
