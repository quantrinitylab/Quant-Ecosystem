// @vitest-environment jsdom
// ============================================================================
// Calendar keyboard shortcuts (fix/qm-calendar-keyboard-shortcuts) — the
// Google-class shortcut set for the calendar surface (L767 competitor gap).
//
// Tests what the finding demands and nothing more:
//  1. The registry documents every binding the calendar owns (single source of
//     truth the `?` sheet also reads — ids, labels, keys, Calendar group).
//  2. Keys actually fire the wired actions through the REAL keyboard engine
//     (not a mock), via the real `useCalendarKeyboard` hook.
//  3. Single-key shortcuts stay inert while the caret is in a text field —
//     typing in the event editor or search must never trigger shortcuts.
//  4. The `?` help sheet lists the calendar's keys (dimmed as "elsewhere"
//     when the calendar is not mounted).
//  5. `z` undo rebuilds a faithful create payload — or declines honestly
//     (null) when the deleted DTO cannot be restored.
//  6. The header's go-to-date picker is opt-in (old renders keep working).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyboardEngine } from '../lib/keyboard/engine';
import {
  COMMAND_GROUPS,
  CALENDAR_COMMAND_REFERENCE,
  calendarCommand,
  type CalendarCommandId,
} from '../lib/keyboard/command-registry';
import { buildHelpGroups } from '../lib/keyboard/help-model';
import { useCalendarKeyboard } from '../hooks/useCalendarKeyboard';
import { buildUndoCreatePayload } from '../app/calendar/lib/calendar-undo';
import { CalendarHeader } from '../app/calendar/components/CalendarHeader';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALL_IDS: CalendarCommandId[] = [
  'calendar.goToday',
  'calendar.nextDay',
  'calendar.previousDay',
  'calendar.goToDate',
  'calendar.searchEvents',
  'calendar.viewDay',
  'calendar.viewWeek',
  'calendar.viewMonth',
  'calendar.viewAgenda',
  'calendar.toggleMonthGrid',
  'calendar.createEvent',
  'calendar.saveEvent',
  'calendar.openEventDetails',
  'calendar.deleteEvent',
  'calendar.undoDelete',
];

// ---------------------------------------------------------------------------
// 1. Registry invariants
// ---------------------------------------------------------------------------
describe('CALENDAR_COMMAND_REFERENCE (registry)', () => {
  it('documents every binding the calendar owns', () => {
    const ids = CALENDAR_COMMAND_REFERENCE.map((entry) => entry.id).sort();
    expect(ids).toEqual([...ALL_IDS].sort());
  });

  it('gives every entry a label, a Calendar group, and at least one key', () => {
    for (const entry of CALENDAR_COMMAND_REFERENCE) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.group).toBe('Calendar');
      const keys = Array.isArray(entry.keys) ? entry.keys : [entry.keys];
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) expect(key.length).toBeGreaterThan(0);
    }
  });

  it('registers the Calendar group the `?` sheet renders', () => {
    expect(COMMAND_GROUPS).toContain('Calendar');
  });

  it('has no two entries claiming the same key', () => {
    const seen = new Set<string>();
    for (const entry of CALENDAR_COMMAND_REFERENCE) {
      const keys = Array.isArray(entry.keys) ? entry.keys : [entry.keys];
      for (const key of keys) {
        expect(seen.has(key), `duplicate key "${key}"`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('never marks a single-key calendar binding allowInInput', () => {
    // Engine default keeps these inert in text fields; a regression here
    // would let typing in the event editor fire calendar shortcuts.
    for (const id of ALL_IDS) {
      const entry = calendarCommand(id) as { allowInInput?: boolean };
      expect(entry.allowInInput ?? false, id).toBe(false);
    }
  });

  it('calendarCommand resolves labels for the ? sheet', () => {
    expect(calendarCommand('calendar.goToday').label).toBe('Go to today');
    expect(calendarCommand('calendar.createEvent').label).toBe('New event');
    expect(calendarCommand('calendar.undoDelete').label).toBe('Undo delete');
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. Real-engine key handling: keys fire, inputs are safe
// ---------------------------------------------------------------------------
function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function Harness({
  handlers,
  guards,
}: {
  handlers: Record<string, () => void>;
  guards?: Partial<Record<'canSaveEvent' | 'canOpenEventDetails' | 'canDeleteSelectedEvent' | 'canUndoDelete', () => boolean>>;
}) {
  useCalendarKeyboard({
    onCreateEvent: handlers.createEvent,
    onGoToday: handlers.goToday,
    onStepDay: handlers.stepDay,
    onGoToDate: handlers.goToDate,
    onFocusSearch: handlers.focusSearch,
    onSelectView: handlers.selectView,
    onToggleMonthGrid: handlers.toggleMonthGrid,
    onSaveEvent: handlers.saveEvent,
    onOpenEventDetails: handlers.openEventDetails,
    onDeleteSelectedEvent: handlers.deleteEvent,
    onUndoDelete: handlers.undoDelete,
    canSaveEvent: guards?.canSaveEvent ?? (() => true),
    canOpenEventDetails: guards?.canOpenEventDetails ?? (() => true),
    canDeleteSelectedEvent: guards?.canDeleteSelectedEvent ?? (() => true),
    canUndoDelete: guards?.canUndoDelete ?? (() => true),
  });
  return null;
}

describe('useCalendarKeyboard (real engine)', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let detach: (() => void) | null = null;
  let calls: Record<string, unknown[]>;

  const handlers = () => ({
    createEvent: vi.fn((...args: unknown[]) => { calls.createEvent.push(args); }),
    goToday: vi.fn((...args: unknown[]) => { calls.goToday.push(args); }),
    stepDay: vi.fn((...args: unknown[]) => { calls.stepDay.push(args); }),
    goToDate: vi.fn((...args: unknown[]) => { calls.goToDate.push(args); }),
    focusSearch: vi.fn((...args: unknown[]) => { calls.focusSearch.push(args); }),
    selectView: vi.fn((...args: unknown[]) => { calls.selectView.push(args); }),
    toggleMonthGrid: vi.fn((...args: unknown[]) => { calls.toggleMonthGrid.push(args); }),
    saveEvent: vi.fn((...args: unknown[]) => { calls.saveEvent.push(args); }),
    openEventDetails: vi.fn((...args: unknown[]) => { calls.openEventDetails.push(args); }),
    deleteEvent: vi.fn((...args: unknown[]) => { calls.deleteEvent.push(args); }),
    undoDelete: vi.fn((...args: unknown[]) => { calls.undoDelete.push(args); }),
  });

  beforeEach(() => {
    calls = {
      createEvent: [], goToday: [], stepDay: [], goToDate: [], focusSearch: [],
      selectView: [], toggleMonthGrid: [], saveEvent: [], openEventDetails: [],
      deleteEvent: [], undoDelete: [],
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    detach = keyboardEngine.attach(document);
    act(() => {
      root = createRoot(container!);
      root.render(<Harness handlers={handlers()} />);
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    detach?.();
    container?.remove();
    root = null;
    container = null;
    detach = null;
  });

  it('fires today on `t`', () => {
    press('t');
    expect(calls.goToday.length).toBe(1);
  });

  it('steps days on `j` and `k`', () => {
    press('j');
    press('k');
    press('k');
    expect(calls.stepDay.length).toBe(3);
  });

  it('switches views on d/w/m/a and their numeric aliases', () => {
    press('d');
    press('w');
    press('m');
    press('a');
    press('1');
    expect(calls.selectView.length).toBe(5);
  });

  it('opens the event editor on `c` and focuses search on `/`', () => {
    press('c');
    press('/');
    expect(calls.createEvent.length).toBe(1);
    expect(calls.focusSearch.length).toBe(1);
  });

  it('focuses the go-to-date picker on shift+g', () => {
    press('G', { shiftKey: true });
    expect(calls.goToDate.length).toBe(1);
  });

  it('toggles the month grid on shift+m', () => {
    press('M', { shiftKey: true });
    expect(calls.toggleMonthGrid.length).toBe(1);
  });

  it('deletes the selected event on Delete/Backspace and undoes on `z`', () => {
    press('Delete');
    press('Backspace');
    press('z');
    expect(calls.deleteEvent.length).toBe(2);
    expect(calls.undoDelete.length).toBe(1);
  });

  it('stays inert while typing in a text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    try {
      // Every single-key calendar binding: none may fire from a text field.
      for (const key of ['t', 'j', 'k', 'd', 'w', 'm', 'a', 'c', '/', 'e', 's', 'z']) {
        press(key, {}, input);
      }
      press('Delete', {}, input);
      const fired = Object.entries(calls).filter(([, v]) => (v as unknown[]).length > 0);
      expect(fired, `shortcuts fired while typing: ${fired.map(([k]) => k).join(', ')}`).toEqual([]);
    } finally {
      input.remove();
    }
  });

  it('stays inert while typing in a textarea', () => {
    // NOTE: contenteditable safety relies on the browser's isContentEditable,
    // which this jsdom version does not implement (undefined) — the INPUT /
    // TEXTAREA path is what jsdom can verify; product code is unchanged.
    const area = document.createElement('textarea');
    document.body.appendChild(area);
    area.focus();
    try {
      press('t', {}, area);
      press('c', {}, area);
      const fired = Object.entries(calls).filter(([, v]) => (v as unknown[]).length > 0);
      expect(fired).toEqual([]);
    } finally {
      area.remove();
    }
  });

  it('does not reopen details when there is nothing to reopen', () => {
    act(() => {
      root!.render(
        <Harness
          handlers={handlers()}
          guards={{ canOpenEventDetails: () => false, canDeleteSelectedEvent: () => false, canUndoDelete: () => false }}
        />,
      );
    });
    press('e');
    press('Delete');
    press('z');
    expect(calls.openEventDetails.length).toBe(0);
    expect(calls.deleteEvent.length).toBe(0);
    expect(calls.undoDelete.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Help sheet: calendar keys are listed (dimmed when the calendar is absent)
// ---------------------------------------------------------------------------
describe('help model (? sheet)', () => {
  it('lists the calendar bindings as elsewhere when the calendar is not mounted', () => {
    const groups = buildHelpGroups([]);
    const calendar = groups.find((group) => group.group === 'Calendar');
    expect(calendar).toBeDefined();
    const ids = calendar!.items.map((entry) => entry.id);
    for (const id of ALL_IDS) expect(ids).toContain(id);
    for (const entry of calendar!.items) {
      expect(entry.available).toBe(false);
      expect(entry.elsewhere).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Undo payload: faithful rebuild or honest decline
// ---------------------------------------------------------------------------
const RAW_DTO = {
  id: 'evt-1',
  title: 'Team standup',
  description: 'Daily sync\n__QUANT_META__{}',
  startTime: '2026-10-16T04:30:00.000Z',
  endTime: '2026-10-16T05:00:00.000Z',
  allDay: false,
  location: 'Room 4',
  attendees: ['a@example.com', 'A@example.com', 'not-an-email', { email: 'b@example.com' }],
  reminders: ['15m'],
  recurrence: 'RRULE:FREQ=DAILY',
  timeZone: 'Asia/Kolkata',
  accountEmail: 'me@example.com',
  type: 'event',
};

describe('buildUndoCreatePayload (z undo)', () => {
  it('rebuilds a faithful create payload from the raw DTO', () => {
    const payload = buildUndoCreatePayload(RAW_DTO);
    expect(payload).not.toBeNull();
    expect(payload!.title).toBe('Team standup');
    expect(payload!.start).toBe('2026-10-16T04:30:00.000Z');
    expect(payload!.end).toBe('2026-10-16T05:00:00.000Z');
    expect(payload!.location).toBe('Room 4');
    expect(payload!.recurrence).toContain('RRULE');
    expect(payload!.timeZone).toBe('Asia/Kolkata');
    expect(payload!.type).toBe('event');
  });

  it('passes the description through verbatim and dedupes attendees', () => {
    const payload = buildUndoCreatePayload(RAW_DTO);
    expect(payload!.description).toBe('Daily sync\n__QUANT_META__{}');
    // Case-insensitive dedupe, malformed addresses dropped.
    expect(payload!.attendees).toEqual(['a@example.com', 'b@example.com']);
  });

  it('falls back to "Restored event" for a blank title', () => {
    const payload = buildUndoCreatePayload({ ...RAW_DTO, title: '  ' });
    expect(payload!.title).toBe('Restored event');
  });

  it('returns null for unparseable dates instead of a corrupted entry', () => {
    expect(buildUndoCreatePayload({ ...RAW_DTO, startTime: 'not-a-date' })).toBeNull();
    expect(buildUndoCreatePayload({ ...RAW_DTO, endTime: undefined })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(buildUndoCreatePayload(null)).toBeNull();
    expect(buildUndoCreatePayload('evt-1')).toBeNull();
  });

  it('drops sheet types the backend would not accept', () => {
    const payload = buildUndoCreatePayload({ ...RAW_DTO, type: 'mystery' });
    expect(payload!.type).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Header go-to-date picker: opt-in, old renders keep working
// ---------------------------------------------------------------------------
const HEADER_BASE = {
  activeMonthName: 'October',
  activeYear: 2026,
  goMonth: () => {},
  goToday: () => {},
  openDedicatedSheet: () => {},
};

describe('CalendarHeader go-to-date picker', () => {
  it('renders the picker when selectedDate + onJumpToDate are provided', () => {
    const html = renderToStaticMarkup(
      <CalendarHeader
        {...HEADER_BASE}
        selectedDate={new Date('2026-10-15T12:00:00')}
        onJumpToDate={() => {}}
      />,
    );
    expect(html).toContain('calendar-goto-date');
    expect(html).toContain('Go to a date');
    expect(html).toContain('value="2026-10-15"');
  });

  it('omits the picker when the jump handler is absent', () => {
    const html = renderToStaticMarkup(<CalendarHeader {...HEADER_BASE} />);
    expect(html).not.toContain('calendar-goto-date');
    expect(html).toContain('Today');
  });

  it('hints the shortcut on the Today and New Event buttons', () => {
    const html = renderToStaticMarkup(
      <CalendarHeader
        {...HEADER_BASE}
        selectedDate={new Date('2026-10-15T12:00:00')}
        onJumpToDate={() => {}}
      />,
    );
    expect(html).toContain('Go to today (T)');
    expect(html).toContain('New event (C)');
  });
});
