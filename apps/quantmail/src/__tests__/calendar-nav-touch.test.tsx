// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-023 — Calendar: single navigation source + >=44px touch targets.
//
// (a) Duplicate navigation: the page-level CalendarHeader owns month
//     prev/next + "Today"; CalendarMonthSubView must never render its own
//     month steppers or a second "Today" (its toolbar is a secondary WEEK
//     navigator only). The duplicate was removed upstream by 2efb5fd4a; the
//     dedupe tests below are preservation pins — they pass on the original
//     code too and exist so the duplicate can never silently return. The
//     dead month-nav handlers were also deleted from the sub-view so the
//     single source is structural, not just visual.
//
// (b) Touch targets: on the original code the month steppers were size-8
//     (32px), "Today" was h-8 (32px), the split-button chevron was ~24px
//     wide, the Day Inspector "Add Event" was ~28px tall, and the week
//     steppers were size-8. The touch-target tests below FAIL on the
//     original code and PASS on the fix (week view's min-h-[44px] /
//     min-w-[44px] pattern, size-11 = 44px).
//
// These tests render the REAL components and drive the REAL buttons,
// asserting only observable behaviour: which controls exist, which
// handlers fire, and the sizing classes on the rendered buttons.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarHeader } from '../app/calendar/components/CalendarHeader';
import { CalendarMonthSubView } from '../components/CalendarSubViews';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
});

function buttonsByLabel(container: ParentNode, label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => b.getAttribute('aria-label') === label,
  ) as HTMLButtonElement[];
}

function buttonsByText(container: ParentNode, text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement[];
}

// The header renders a desktop bar (`hidden md:flex`) and a mobile bar
// (`md:hidden`). Locate each variant's container by its responsive class.
function variantContainer(header: HTMLElement, marker: string): HTMLElement {
  const el = Array.from(header.querySelectorAll('div')).find((d) =>
    d.className.split(/\s+/).includes(marker),
  );
  if (!el) throw new Error(`header variant container ${marker} not found`);
  return el as HTMLElement;
}

const headerProps = () => ({
  activeMonthName: 'October',
  activeYear: 2026,
  goMonth: vi.fn(),
  goToday: vi.fn(),
  openDedicatedSheet: vi.fn(),
  onOpenBookingLinks: vi.fn(),
});

const SELECTED = new Date(2026, 9, 15); // Thu 15 Oct 2026

function renderMonthScreen() {
  const props = headerProps();
  const onSelectDate = vi.fn();
  const onPrevMonth = vi.fn();
  const onNextMonth = vi.fn();
  const onGoToday = vi.fn();
  const container = render(
    <>
      <CalendarHeader {...props} />
      <CalendarMonthSubView
        events={[]}
        selectedDate={SELECTED}
        onSelectDate={onSelectDate}
        openDedicatedSheet={vi.fn()}
        onSelectEvent={vi.fn()}
        viewDate={new Date(2026, 9, 1)}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onGoToday={onGoToday}
      />
    </>,
  );
  return { container, props, onSelectDate, onPrevMonth, onNextMonth, onGoToday };
}

// ============================================================================
// (a) Single navigation source — preservation pins
// ============================================================================
describe('QM-UIUX-023 (a) single navigation source', () => {
  it('month screen has exactly one Today source: the header (desktop + mobile variants), none in the sub-view', () => {
    const { container } = renderMonthScreen();
    const header = container.querySelector('header')!;
    const todays = buttonsByText(container, 'Today');
    // One per responsive header variant — and every one lives in the header.
    expect(todays).toHaveLength(2);
    for (const btn of todays) expect(header.contains(btn)).toBe(true);
  });

  it('month steppers exist only in the header; the sub-view keeps only its week steppers', () => {
    const { container } = renderMonthScreen();
    const header = container.querySelector('header')!;
    for (const label of ['Previous month', 'Next month']) {
      const all = buttonsByLabel(container, label);
      expect(all).toHaveLength(2); // desktop + mobile header variants
      for (const btn of all) expect(header.contains(btn)).toBe(true);
    }
    // Sub-view's own secondary navigation is week-based and survives.
    expect(buttonsByLabel(container, 'Previous week')).toHaveLength(1);
    expect(buttonsByLabel(container, 'Next week')).toHaveLength(1);
  });

  it('header steppers still navigate: goMonth/goToday fire identically from both variants', () => {
    const props = headerProps();
    const container = render(<CalendarHeader {...props} />);
    const header = container.querySelector('header')!;
    const desktop = variantContainer(header, 'md:flex');
    const mobile = variantContainer(header, 'md:hidden');

    click(buttonsByLabel(mobile, 'Next month')[0]);
    expect(props.goMonth).toHaveBeenCalledWith(1);
    click(buttonsByLabel(mobile, 'Previous month')[0]);
    expect(props.goMonth).toHaveBeenCalledWith(-1);
    click(buttonsByText(mobile, 'Today')[0]);
    expect(props.goToday).toHaveBeenCalledTimes(1);

    click(buttonsByLabel(desktop, 'Next month')[0]);
    expect(props.goMonth).toHaveBeenCalledWith(1);
    click(buttonsByText(desktop, 'Today')[0]);
    expect(props.goToday).toHaveBeenCalledTimes(2);
  });

  it('sub-view week steppers still navigate the selection by ±7 days', () => {
    const { container, onSelectDate } = renderMonthScreen();
    click(buttonsByLabel(container, 'Next week')[0]);
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    const next = onSelectDate.mock.calls[0][0] as Date;
    expect(next.getTime() - SELECTED.getTime()).toBe(7 * 24 * 3600 * 1000);

    click(buttonsByLabel(container, 'Previous week')[0]);
    expect(onSelectDate).toHaveBeenCalledTimes(2);
    const prev = onSelectDate.mock.calls[1][0] as Date;
    expect(SELECTED.getTime() - prev.getTime()).toBe(7 * 24 * 3600 * 1000);
  });
});

// ============================================================================
// (b) Touch targets >= 44px — fail on the original size-8 / h-8 code
// ============================================================================
describe('QM-UIUX-023 (b) touch targets >= 44px', () => {
  it('mobile header steppers are 44px and mobile Today is 44px tall', () => {
    const props = headerProps();
    const container = render(<CalendarHeader {...props} />);
    const mobile = variantContainer(container.querySelector('header')!, 'md:hidden');

    for (const label of ['Previous month', 'Next month']) {
      const btn = buttonsByLabel(mobile, label)[0];
      expect(btn.className).toContain('size-11'); // 44px, was size-8 (32px)
      expect(btn.className).not.toContain('size-8');
    }
    const today = buttonsByText(mobile, 'Today')[0];
    expect(today.className).toContain('h-11'); // 44px, was h-8 (32px)
    expect(today.className).not.toContain('h-8');
  });

  it('desktop header steppers and Today are also 44px', () => {
    const props = headerProps();
    const container = render(<CalendarHeader {...props} />);
    const desktop = variantContainer(container.querySelector('header')!, 'md:flex');

    for (const label of ['Previous month', 'Next month']) {
      expect(buttonsByLabel(desktop, label)[0].className).toContain('size-11');
    }
    expect(buttonsByText(desktop, 'Today')[0].className).toContain('min-h-[44px]');
  });

  it('split-button main + chevron hit areas are >= 44px in both variants, menu items too', () => {
    const props = headerProps();
    const container = render(<CalendarHeader {...props} />);

    for (const chevron of buttonsByLabel(container, 'Choose entry type')) {
      expect(chevron.className).toContain('min-h-[44px]');
      expect(chevron.className).toContain('min-w-[44px]'); // was px-1.5 (~24px)
    }
    for (const main of [
      ...buttonsByText(container, 'New Event'),
      ...buttonsByText(container, 'Event'),
    ]) {
      expect(main.className).toContain('min-h-[44px]');
    }

    // Open the mobile menu and check its items.
    const mobile = variantContainer(container.querySelector('header')!, 'md:hidden');
    click(buttonsByLabel(mobile, 'Choose entry type')[0]);
    const items = Array.from(mobile.querySelectorAll('[role="menuitem"]'));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect((item as HTMLElement).className).toContain('min-h-[44px]');
    }
  });

  it('Booking Links buttons are >= 44px tall in both variants', () => {
    const props = headerProps();
    const container = render(<CalendarHeader {...props} />);
    const all = buttonsByLabel(container, 'Booking Links');
    expect(all).toHaveLength(2);
    for (const btn of all) expect(btn.className).toContain('min-h-[44px]');
  });

  it('sub-view week steppers follow the week-view min-h/min-w 44px pattern', () => {
    const { container } = renderMonthScreen();
    for (const label of ['Previous week', 'Next week']) {
      const btn = buttonsByLabel(container, label)[0];
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
      expect(btn.className).not.toContain('size-8'); // was size-8 (32px)
    }
  });

  it('Day Inspector "Add Event" button is >= 44px tall', () => {
    const { container } = renderMonthScreen();
    const add = buttonsByText(container, 'Add Event');
    expect(add).toHaveLength(1);
    expect(add[0].className).toContain('min-h-[44px]'); // was px-3 py-1 (~28px)
  });
});
