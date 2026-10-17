import { describe, expect, it } from 'vitest';
import {
  suggestFreeSlots,
  formatSlotLabel,
  parseTimeToMinutes,
  type FreeSlot,
} from '../free-busy-slots';

const NOW = new Date('2026-10-12T00:00:00').getTime(); // fixed "now" for tests
const win = (start: string, end: string) => ({
  windowStart: new Date(start),
  windowEnd: new Date(end),
});

describe('suggestFreeSlots', () => {
  it('suggests stepped slots across an empty window', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T12:00:00'),
      busy: [],
      durationMin: 60,
      stepMin: 60,
      maxSlots: 3,
      nowMs: NOW,
    });
    expect(slots).toHaveLength(3);
    expect(slots[0]!.start).toEqual(new Date('2026-10-13T08:00:00'));
    expect(slots[2]!.start).toEqual(new Date('2026-10-13T10:00:00'));
    expect(slots[0]!.end).toEqual(new Date('2026-10-13T09:00:00'));
  });

  it('skips slots overlapping busy blocks', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T12:00:00'),
      busy: [{ start: '2026-10-13T09:00:00', end: '2026-10-13T10:30:00' }],
      durationMin: 60,
      stepMin: 60,
      maxSlots: 10,
      nowMs: NOW,
    });
    // 08:00 free, 09:00 and 10:00 collide with the busy block, 11:00 free
    expect(slots.map((s) => s.start.getHours())).toEqual([8, 11]);
  });

  it('treats touching boundaries as free (no overlap)', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T10:00:00'),
      busy: [{ start: '2026-10-13T08:00:00', end: '2026-10-13T09:00:00' }],
      durationMin: 60,
      stepMin: 60,
      maxSlots: 10,
      nowMs: NOW,
    });
    expect(slots.map((s) => s.start.getHours())).toEqual([9]);
  });

  it('clamps busy blocks to the window and drops invalid ones', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T10:00:00'),
      busy: [
        { start: '2026-10-13T06:00:00', end: '2026-10-13T08:30:00' }, // overlaps window start
        { start: 'not-a-date', end: '2026-10-13T09:00:00' }, // invalid → dropped
        { start: '2026-10-13T09:30:00', end: '2026-10-13T09:00:00' }, // reversed → dropped
      ],
      durationMin: 60,
      stepMin: 30,
      maxSlots: 10,
      nowMs: NOW,
    });
    // 08:00 collides with the clamped 06:00–08:30 block; 08:30 touches it
    // exactly (treated as free), 09:00 free
    expect(slots.map((s) => `${s.start.getHours()}:${s.start.getMinutes()}`)).toEqual([
      '8:30',
      '9:0',
    ]);
  });

  it('returns no slots when the window is fully busy', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T09:00:00'),
      busy: [{ start: '2026-10-13T08:00:00', end: '2026-10-13T09:00:00' }],
      durationMin: 60,
      stepMin: 30,
      maxSlots: 5,
      nowMs: NOW,
    });
    expect(slots).toEqual([]);
  });

  it('never suggests the past', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-11T08:00:00', '2026-10-11T12:00:00'),
      busy: [],
      durationMin: 60,
      stepMin: 60,
      maxSlots: 10,
      nowMs: NOW, // NOW is Oct 12; the whole window is in the past
    });
    expect(slots).toEqual([]);
  });

  it('rejects invalid windows', () => {
    expect(
      suggestFreeSlots({
        windowStart: new Date('2026-10-13T12:00:00'),
        windowEnd: new Date('2026-10-13T08:00:00'),
        busy: [],
        durationMin: 60,
        nowMs: NOW,
      }),
    ).toEqual([]);
    expect(
      suggestFreeSlots({
        windowStart: new Date('invalid'),
        windowEnd: new Date('2026-10-13T08:00:00'),
        busy: [],
        durationMin: 60,
        nowMs: NOW,
      }),
    ).toEqual([]);
  });

  it('requires the full duration to fit before window end', () => {
    const slots = suggestFreeSlots({
      ...win('2026-10-13T08:00:00', '2026-10-13T09:30:00'),
      busy: [],
      durationMin: 60,
      stepMin: 60,
      maxSlots: 10,
      nowMs: NOW,
    });
    // 09:00–10:00 would overflow the 09:30 window end → only 08:00
    expect(slots).toHaveLength(1);
    expect(slots[0]!.start.getHours()).toBe(8);
  });
});

describe('parseTimeToMinutes', () => {
  it('parses valid times', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('0:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });
  it('returns NaN for invalid times', () => {
    expect(parseTimeToMinutes('')).toBeNaN();
    expect(parseTimeToMinutes('abc')).toBeNaN();
    expect(parseTimeToMinutes('24:00')).toBeNaN();
    expect(parseTimeToMinutes('10:60')).toBeNaN();
  });
});

describe('formatSlotLabel', () => {
  it('formats start–end in locale time', () => {
    const slot: FreeSlot = {
      start: new Date('2026-10-13T10:30:00'),
      end: new Date('2026-10-13T11:00:00'),
    };
    const label = formatSlotLabel(slot);
    expect(label).toContain('–');
    expect(label.length).toBeGreaterThan(5);
  });
});
