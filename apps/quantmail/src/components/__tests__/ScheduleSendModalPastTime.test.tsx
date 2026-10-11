// @vitest-environment jsdom
// ============================================================================
// Schedule-send honesty P1: ScheduleSendModal must never emit a past time.
//
// Before the fix, handleConfirm built the ISO straight from the clock with no
// past check — the "Today 6:00 PM" quick preset stayed tappable after 6 PM,
// and the backend delivered the send immediately while the UI claimed
// "scheduled".
//
// These tests pin the fix at two levels:
//   (a) pure logic: buildScheduledSendDate + isPastScheduleTime — past times
//       (including the current minute) are rejected, future times accepted;
//   (b) the real component (fake clock at 7 PM): the "Today 6:00 PM" preset
//       is disabled; picking today + the default 8:00 AM clock and confirming
//       shows an honest error and never calls onSchedule; picking the
//       "Tomorrow 8:00 AM" preset schedules honestly.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ScheduleSendModal,
  buildScheduledSendDate,
  isPastScheduleTime,
} from '../ScheduleSendModal';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  vi.useRealTimers();
});

function atLocal(y: number, mo: number, d: number, h: number, min: number): Date {
  return new Date(y, mo, d, h, min, 0, 0);
}

describe('buildScheduledSendDate / isPastScheduleTime', () => {
  it('builds the exact date from the 12h clock state', () => {
    const got = buildScheduledSendDate(atLocal(2026, 9, 12, 0, 0), 6, 30, 'PM');
    expect(got.getFullYear()).toBe(2026);
    expect(got.getMonth()).toBe(9);
    expect(got.getDate()).toBe(12);
    expect(got.getHours()).toBe(18);
    expect(got.getMinutes()).toBe(30);
    expect(got.getSeconds()).toBe(0);
  });

  it('maps 12 AM -> 0 and 12 PM -> 12', () => {
    expect(buildScheduledSendDate(atLocal(2026, 9, 12, 0, 0), 12, 0, 'AM').getHours()).toBe(0);
    expect(buildScheduledSendDate(atLocal(2026, 9, 12, 0, 0), 12, 0, 'PM').getHours()).toBe(12);
  });

  it('rejects past times on the same day', () => {
    const now = atLocal(2026, 9, 11, 19, 0);
    // "Today 6:00 PM" after 7 PM is past.
    expect(
      isPastScheduleTime(buildScheduledSendDate(atLocal(2026, 9, 11, 0, 0), 6, 0, 'PM'), now),
    ).toBe(true);
  });

  it('rejects the current minute (seconds are zeroed, so it is never future)', () => {
    const now = atLocal(2026, 9, 11, 19, 0);
    expect(
      isPastScheduleTime(buildScheduledSendDate(atLocal(2026, 9, 11, 0, 0), 7, 0, 'PM'), now),
    ).toBe(true);
  });

  it('accepts genuinely future times', () => {
    const now = atLocal(2026, 9, 11, 19, 0);
    expect(
      isPastScheduleTime(buildScheduledSendDate(atLocal(2026, 9, 11, 0, 0), 8, 0, 'PM'), now),
    ).toBe(false);
    expect(
      isPastScheduleTime(buildScheduledSendDate(atLocal(2026, 9, 12, 0, 0), 8, 0, 'AM'), now),
    ).toBe(false);
  });
});

describe('ScheduleSendModal past-time guard (fake clock 7 PM)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  function renderModal(onSchedule: (iso: string) => void) {
    vi.useFakeTimers();
    vi.setSystemTime(atLocal(2026, 9, 11, 19, 0));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <ScheduleSendModal isOpen onClose={() => {}} onSchedule={onSchedule} />,
      );
    });
    return container;
  }

  function cleanup() {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  }

  function findButton(scope: ParentNode, text: string): HTMLButtonElement {
    const btn = Array.from(scope.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text),
    );
    if (!btn) throw new Error(`button containing "${text}" not found`);
    return btn as HTMLButtonElement;
  }

  afterEach(() => {
    cleanup();
  });

  it('disables the "Today 6:00 PM" preset after 6 PM', () => {
    const c = renderModal(() => {});
    const preset = findButton(c, '6:00 PM');
    expect(preset.disabled).toBe(true);
  });

  it('keeps the "Tomorrow 8:00 AM" preset enabled', () => {
    const c = renderModal(() => {});
    const preset = findButton(c, '8:00 AM');
    expect(preset.disabled).toBe(false);
  });

  it('confirming a past time shows an honest error and never calls onSchedule', () => {
    const onSchedule = vi.fn();
    const c = renderModal(onSchedule);
    // Select today (the 11th) in the calendar grid; the clock still shows the
    // default 8:00 AM, which is in the past at the fake 7 PM.
    const dayButtons = Array.from(c.querySelectorAll('button')).filter(
      (b) => b.textContent === '11' && !(b as HTMLButtonElement).disabled,
    );
    expect(dayButtons.length).toBeGreaterThan(0);
    act(() => {
      dayButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      findButton(c, 'Schedule Send').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const alert = c.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toMatch(/already passed/i);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('the tomorrow preset schedules honestly', () => {
    const onSchedule = vi.fn();
    const c = renderModal(onSchedule);
    act(() => {
      findButton(c, '8:00 AM').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      findButton(c, 'Schedule Send').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSchedule).toHaveBeenCalledTimes(1);
    const iso = onSchedule.mock.calls[0][0] as string;
    const scheduled = new Date(iso);
    expect(scheduled.getFullYear()).toBe(2026);
    expect(scheduled.getMonth()).toBe(9);
    expect(scheduled.getDate()).toBe(12);
    expect(scheduled.getHours()).toBe(8);
    expect(scheduled.getTime()).toBeGreaterThan(Date.now());
  });
});
