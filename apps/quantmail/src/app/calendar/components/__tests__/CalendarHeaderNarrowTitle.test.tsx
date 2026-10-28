// @vitest-environment jsdom
// ============================================================================
// F2 — calendar month title destroyed at narrow widths (live-proven:
// 320px rendered "C 2026", 360px "Oct… 2026").
//
// Root cause: the mobile row-1 title group carried min-w-0, so at 320px it
// shrank to ~40px and `truncate` cut "October" to a single letter. The fix
// lets the title group keep its natural width and the row wraps instead —
// the New-event split button drops to its own line below ~360px, and the
// full month + year keep the whole row. No control shrinks below the 44px
// floor and no month gets renamed to buy the room.
//
// Pins, via the rendered DOM (jsdom + createRoot + act, no
// @testing-library/react — the apps/quantmail package does not depend on it,
// and CI installs with --frozen-lockfile):
//
//   1. The longest month name renders in full next to the year.
//   2. Row 1 wraps (flex-wrap) instead of squeezing the title.
//   3. The title group carries no min-w-0 (the defect's mechanism).
//   4. Every row-1 control keeps its 44px touch target.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('../../../components/KeyboardProvider', () => ({
  useKeyboardSurfaces: () => ({
    isPaletteOpen: false,
    openPalette: () => {},
    closePalette: () => {},
    isHelpOpen: false,
    openHelp: () => {},
    closeHelp: () => {},
  }),
}));

import { CalendarHeader } from '../CalendarHeader';

const noop = () => {};

function renderHeader(monthName: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      <CalendarHeader
        activeMonthName={monthName}
        activeYear={2026}
        goMonth={noop}
        goToday={noop}
        openDedicatedSheet={noop}
      />,
    );
  });
  // The mobile tree is the `md:hidden` header child (the desktop tree is
  // `hidden md:flex`); row 1 is its first child row.
  const mobile = container.querySelector(
    'header > div[class*="md:hidden"]',
  ) as HTMLElement;
  const row1 = mobile.children[0] as HTMLElement;
  const titleGroup = row1.children[0] as HTMLElement;
  return {
    mobile,
    row1,
    titleGroup,
    cleanup() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

describe('CalendarHeader narrow-width month title (F2)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  it('renders the longest month name in full next to the year', () => {
    const { mobile, cleanup } = renderHeader('September');
    cleanups.push(cleanup);
    const h2 = mobile.querySelector('h2') as HTMLElement;
    expect(h2.textContent).toContain('September');
    expect(h2.textContent).toContain('2026');
  });

  it('row 1 wraps instead of squeezing the title group', () => {
    const { row1, cleanup } = renderHeader('October');
    cleanups.push(cleanup);
    expect(row1.className).toContain('flex-wrap');
  });

  it('the title group carries no min-w-0 (the F2 shrink mechanism)', () => {
    const { titleGroup, cleanup } = renderHeader('October');
    cleanups.push(cleanup);
    expect(titleGroup.className).not.toContain('min-w-0');
  });

  it('keeps every row-1 control at the 44px touch floor', () => {
    const { row1, cleanup } = renderHeader('October');
    cleanups.push(cleanup);
    const prev = row1.querySelector(
      'button[aria-label="Previous month"]',
    ) as HTMLElement;
    const next = row1.querySelector(
      'button[aria-label="Next month"]',
    ) as HTMLElement;
    expect(prev.className).toContain('size-11');
    expect(next.className).toContain('size-11');
    const today = Array.from(row1.querySelectorAll('button')).find(
      (b) => b.textContent === 'Today',
    ) as HTMLElement;
    expect(today.className).toContain('h-11');
    const newEvent = row1.querySelector(
      'button[aria-label="New event"]',
    ) as HTMLElement;
    expect(newEvent.className).toContain('min-h-[44px]');
    expect(newEvent.className).toContain('min-w-[44px]');
  });
});
