// @vitest-environment jsdom
// ============================================================================
// FindATimePanel.test.tsx — "Find a time" affordance in the event form.
//
// Renders the REAL panel with the network boundary mocked at the apiClient
// method level:
//
//   * Clicking "Find a time" calls GET /events/free-busy (apiClient.getFreeBusy)
//     with a 7-day window; busy blocks from the response become excluded slots.
//   * Picking a slot calls onApplySlot with wall-clock date/time strings the
//     form's own save path consumes (toDateInput/toTimeInput).
//   * Backend failure shows an honest error, never invented slots.
//   * Guests get the honest "availability not shared" line — the panel never
//     claims to know a guest's calendar.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FindATimePanel } from '../FindATimePanel';
import { apiClient } from '../../../../services/api-client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const iso = (day: number, hour: number, minute = 0): string =>
  new Date(2026, 9, day, hour, minute, 0, 0).toISOString();

function renderPanel(overrides: Partial<React.ComponentProps<typeof FindATimePanel>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onApplySlot = vi.fn();
  const props: React.ComponentProps<typeof FindATimePanel> = {
    attendees: ['guest@example.com', 'friend@quantmail.in'],
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    startTime: '10:00',
    endTime: '10:30',
    allDay: false,
    onApplySlot,
    ...overrides,
  };
  act(() => {
    root.render(<FindATimePanel {...props} />);
  });
  return { container, root, onApplySlot };
}

async function clickFindATime(container: HTMLElement) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Find a time'),
  );
  expect(btn).toBeTruthy();
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('FindATimePanel', () => {
  let root: Root | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      root?.unmount();
    });
    document.body.innerHTML = '';
    root = null;
  });

  it('queries free-busy and renders suggested slots that avoid busy blocks', async () => {
    vi.spyOn(apiClient, 'getFreeBusy').mockResolvedValue({
      success: true,
      data: {
        timeRange: { start: iso(13, 0), end: iso(20, 0) },
        // Guest is not modelled here — the endpoint returns the ORGANIZER's blocks.
        busy: [{ start: iso(13, 10), end: iso(13, 12) }],
        conflictsCount: 1,
        busyBlocksCount: 1,
      },
    });

    const rendered = renderPanel();
    root = rendered.root;
    await clickFindATime(rendered.container);

    const spy = apiClient.getFreeBusy as ReturnType<typeof vi.spyOn>;
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0]![0] as { start: string; end: string };
    expect(new Date(args.start).getTime()).toBeLessThanOrEqual(new Date('2026-10-13T00:00:00').getTime());
    expect(new Date(args.end).getTime() - new Date(args.start).getTime()).toBe(7 * 86400000);

    const items = rendered.container.querySelectorAll('li');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(6);
    // 10:00–12:00 on the 13th is busy: the first suggestion must be 09:00.
    expect(items[0]!.textContent).toContain('09:00');
    // No suggested slot may START inside the busy block (10:00–12:00).
    const starts = Array.from(items).map((li) => {
      const m = /· (\d{2}:\d{2}) –/.exec(li.textContent ?? '');
      return m?.[1];
    });
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('11:00');
    expect(starts).not.toContain('11:30');
  });

  it('applying a slot sets the form date/time and closes the panel', async () => {
    vi.spyOn(apiClient, 'getFreeBusy').mockResolvedValue({
      success: true,
      data: {
        timeRange: { start: iso(13, 0), end: iso(20, 0) },
        busy: [],
        conflictsCount: 0,
        busyBlocksCount: 0,
      },
    });

    const rendered = renderPanel();
    root = rendered.root;
    await clickFindATime(rendered.container);

    const setButtons = Array.from(rendered.container.querySelectorAll('button')).filter((b) =>
      b.textContent === 'Set' || b.textContent?.includes('Set'),
    );
    expect(setButtons.length).toBeGreaterThan(0);
    await act(async () => {
      setButtons[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(rendered.onApplySlot).toHaveBeenCalledTimes(1);
    const slot = rendered.onApplySlot.mock.calls[0]![0];
    expect(slot.startDate).toBe('2026-10-13');
    expect(slot.endDate).toBe('2026-10-13');
    expect(slot.startTime).toBe('09:00');
    expect(slot.endTime).toBe('09:30');
    // Panel collapses back to the "Find a time" button after applying.
    expect(
      Array.from(rendered.container.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Find a time'),
      ),
    ).toBe(true);
  });

  it('shows an honest error and never invented slots when the backend fails', async () => {
    vi.spyOn(apiClient, 'getFreeBusy').mockResolvedValue({
      success: false,
      error: { code: 'BACKEND_DOWN', message: 'calendar backend unreachable', statusCode: 503 },
    });

    const rendered = renderPanel();
    root = rendered.root;
    await clickFindATime(rendered.container);

    const text = rendered.container.textContent ?? '';
    expect(text).toContain("Couldn't check your calendar");
    expect(text).toContain('calendar backend unreachable');
    expect(rendered.container.querySelectorAll('li').length).toBe(0);
    expect(text).toContain('Try again');
  });

  it('labels every guest availability honestly — never invents it', async () => {
    vi.spyOn(apiClient, 'getFreeBusy').mockResolvedValue({
      success: true,
      data: {
        timeRange: { start: iso(13, 0), end: iso(20, 0) },
        busy: [],
        conflictsCount: 0,
        busyBlocksCount: 0,
      },
    });

    const rendered = renderPanel();
    root = rendered.root;
    await clickFindATime(rendered.container);

    const text = rendered.container.textContent ?? '';
    expect(text).toContain('Checked against your calendar only.');
    expect(text).toContain('guest@example.com — availability not shared');
    expect(text).toContain('friend@quantmail.in — availability not shared');
  });
});
