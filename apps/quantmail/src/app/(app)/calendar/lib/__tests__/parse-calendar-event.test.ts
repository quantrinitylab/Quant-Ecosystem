import { describe, it, expect } from 'vitest';

import { parseCalendarEvent } from '../calendar-geometry';

/**
 * fix/qm-calendar-sheet-meta-roundtrip: the backend DTO (toEventDto) now
 * carries the sheet-type fields parsed + validated out of the
 * __QUANT_META__ description header. parseCalendarEvent must prefer those
 * validated DTO fields and only fall back to re-parsing the header for rows
 * that did not come through the DTO (imports) — previously it trusted the
 * header JSON unconditionally, so a garbage `type` in the header reached the
 * edit sheet and the day-view colors as a sheet type the UI cannot render.
 */

const TASK_ROW = {
  id: 'e1',
  title: 'Ship the launch',
  // The DTO: validated fields top-level, header still present in description.
  type: 'task',
  priority: 'urgent',
  subtasks: [
    { text: 'book venue', done: false },
    { text: 'send invites', done: true },
  ],
  description:
    '__QUANT_META__:{"type":"task","priority":"urgent","subtasks":[{"text":"book venue","done":false},{"text":"send invites","done":true}]}:__END_QUANT_META__\nShip the launch',
  startTime: '2026-09-11T09:00:00.000Z',
  endTime: '2026-09-11T10:00:00.000Z',
};

describe('parseCalendarEvent — sheet-type round-trip', () => {
  it('prefers the validated DTO fields for a task row', () => {
    const ev = parseCalendarEvent(TASK_ROW);
    expect(ev.type).toBe('task');
    expect(ev.priority).toBe('urgent');
    expect(ev.subtasks).toEqual([
      { text: 'book venue', done: false },
      { text: 'send invites', done: true },
    ]);
    // The header is stripped from the human-readable description.
    expect(ev.description).toBe('Ship the launch');
  });

  it('drops a garbage header type when the DTO carries a valid one', () => {
    const ev = parseCalendarEvent({
      ...TASK_ROW,
      description:
        '__QUANT_META__:{"type":"rootkit","priority":"mega"}:__END_QUANT_META__\nShip the launch',
    });
    // The validated DTO wins; the header garbage never reaches the sheet.
    expect(ev.type).toBe('task');
    expect(ev.priority).toBe('urgent');
  });

  it('falls back to the header for rows without DTO fields (imports)', () => {
    const ev = parseCalendarEvent({
      id: 'import-1',
      title: 'Maya',
      description: '__QUANT_META__:{"type":"birthday","birthYear":"1994"}:__END_QUANT_META__\nMaya',
      startTime: '2026-09-11T09:00:00.000Z',
      endTime: '2026-09-11T10:00:00.000Z',
    });
    expect(ev.type).toBe('birthday');
    expect(ev.birthYear).toBe('1994');
  });

  it('treats a row with no type anywhere as a plain event', () => {
    const ev = parseCalendarEvent({
      id: 'e2',
      title: 'Design review',
      description: 'agenda lives in the doc',
      startTime: '2026-09-11T09:00:00.000Z',
      endTime: '2026-09-11T10:00:00.000Z',
    });
    expect(ev.type).toBe('event');
    expect(ev.priority).toBeUndefined();
  });

  it('recovers period-log cycle fields from the DTO', () => {
    const ev = parseCalendarEvent({
      id: 'e3',
      title: 'Period Log',
      type: 'period',
      flowIntensity: 'heavy',
      spottingColor: 'brown',
      cycleDay: 12,
      description:
        '__QUANT_META__:{"type":"period","flowIntensity":"heavy","spottingColor":"brown","cycleDay":12}:__END_QUANT_META__',
      startTime: '2026-09-11T09:00:00.000Z',
      endTime: '2026-09-11T10:00:00.000Z',
    });
    expect(ev.type).toBe('period');
    expect(ev.flowIntensity).toBe('heavy');
    expect(ev.spottingColor).toBe('brown');
    expect(ev.cycleDay).toBe(12);
  });
});
