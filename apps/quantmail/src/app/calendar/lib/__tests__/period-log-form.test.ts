import { describe, it, expect } from 'vitest';

import { initPeriodHealthFields, buildSheetSavePayload } from '../period-log-form';
import { stripQuantMeta } from '../../event/event-detail-utils';
import type { CalendarEventLike, FormState } from '../../types';

/**
 * fix/qm-calendar-period-log (CODEX-REVIEW 6250866664 on merged #1318):
 * opening record B after record A leaked A's health values (BBT, weight,
 * tags, sexLife, periodDays, cycleLength, …) into B's form via `prev`
 * fallbacks, and Save persisted them into B. The edit form must be
 * initialized ONLY from the selected record's DTO plus explicit
 * empty/unknown defaults. These tests run the actual init + save-contract
 * code the sheet calls — no reimplementation.
 */

// Record A: a fully-logged period entry (the CODEX repro values).
const DTO_A: CalendarEventLike = {
  id: 'A',
  title: 'Period Log',
  type: 'period',
  bbt: '36.6',
  weight: '58',
  customTags: ['A-only'],
  sexLife: 'Protected',
  sleep: 'Woke up refreshed',
  energy: 'Energetic',
  intimateHealth: 'Normal / Good',
  hotFlashes: 'None today',
  collectionMethod: 'Pad',
  feelings: ['Happy', 'Calm'],
  pain: ['Cramps'],
  periodDays: 6,
  cycleLength: 30,
  cycleDay: 3,
  flowIntensity: 'heavy',
  spottingColor: 'brown',
  birthYear: '1990',
};

// Record B: a period entry whose DTO omits every health field (e.g. an old
// row, or one logged before these fields existed).
const DTO_B: CalendarEventLike = { id: 'B', title: 'Period Log', type: 'period' };

function makeFormState(overrides: Partial<FormState> = {}): FormState {
  return {
    title: '',
    startDate: '2026-10-18',
    endDate: '2026-10-18',
    startTime: '10:00',
    endTime: '11:00',
    allDay: true,
    timezone: 'Asia/Kolkata',
    location: '',
    description: '',
    recurrence: 'Does not repeat',
    color: 'var(--app-accent)',
    accountEmail: 'user@quantmail.in',
    notifications: [],
    attendeeInput: '',
    attendees: [],
    driveLink: '',
    priority: 'medium',
    subtaskInput: '',
    subtasks: [],
    birthYear: '',
    giftIdeas: '',
    flowIntensity: 'medium',
    spottingColor: 'red',
    collectionMethod: '',
    feelings: [],
    pain: [],
    pms: false,
    sleep: '',
    sexLife: '',
    energy: '',
    intimateHealth: '',
    hotFlashes: '',
    bbt: '',
    weight: '',
    customTagInput: '',
    customTags: [],
    periodDays: 5,
    cycleLength: 28,
    currentCycleDay: 1,
    ...overrides,
  };
}

function savePayloadFor(formState: FormState, editingEventId: string | null = 'B') {
  return buildSheetSavePayload({
    formState,
    sheetType: 'period',
    editingEventId,
    startIso: '2026-10-18T00:00:00.000Z',
    endIso: '2026-10-18T23:59:59.000Z',
    finalTitle: 'Period Log (Day 1, medium flow)',
    sendUpdate: false,
  });
}

describe('initPeriodHealthFields — no cross-record leak', () => {
  it('restores every health value the DTO carries (unchanged-save baseline)', () => {
    const init = initPeriodHealthFields(DTO_A);
    expect(init.bbt).toBe('36.6');
    expect(init.weight).toBe('58');
    expect(init.customTags).toEqual(['A-only']);
    expect(init.sexLife).toBe('Protected');
    expect(init.sleep).toBe('Woke up refreshed');
    expect(init.energy).toBe('Energetic');
    expect(init.intimateHealth).toBe('Normal / Good');
    expect(init.hotFlashes).toBe('None today');
    expect(init.collectionMethod).toBe('Pad');
    expect(init.feelings).toEqual(['Happy', 'Calm']);
    expect(init.pain).toEqual(['Cramps']);
    expect(init.periodDays).toBe(6);
    expect(init.cycleLength).toBe(30);
    expect(init.currentCycleDay).toBe(3);
    expect(init.flowIntensity).toBe('heavy');
    expect(init.spottingColor).toBe('brown');
    expect(init.birthYear).toBe('1990');
  });

  it('A→B: fields B never logged start empty — none of A\u2019s values leak', () => {
    initPeriodHealthFields(DTO_A); // open A first (return value discarded)
    const b = initPeriodHealthFields(DTO_B); // close, open B
    expect(b.bbt).toBe('');
    expect(b.weight).toBe('');
    expect(b.customTags).toEqual([]);
    expect(b.sexLife).toBe('');
    expect(b.sleep).toBe('');
    expect(b.energy).toBe('');
    expect(b.intimateHealth).toBe('');
    expect(b.hotFlashes).toBe('');
    expect(b.collectionMethod).toBe('');
    expect(b.feelings).toEqual([]);
    expect(b.pain).toEqual([]);
    expect(b.birthYear).toBe('');
    // Slider-backed fields fall back to the sheet defaults, never A's values.
    expect(b.periodDays).toBe(5);
    expect(b.cycleLength).toBe(28);
    expect(b.currentCycleDay).toBe(1);
    expect(b.flowIntensity).toBe('medium');
    expect(b.spottingColor).toBe('red');
  });

  it('cancel/reopen: init is a pure function of the DTO, independent of open order', () => {
    const a1 = initPeriodHealthFields(DTO_A);
    const b1 = initPeriodHealthFields(DTO_B);
    const a2 = initPeriodHealthFields(DTO_A); // reopen A after B
    const b2 = initPeriodHealthFields(DTO_B); // reopen B after A
    expect(a2).toEqual(a1);
    expect(b2).toEqual(b1);
    expect(b2.bbt).toBe('');
    expect(a2.bbt).toBe('36.6');
  });

  it('cleared-field: an explicit empty value stays empty', () => {
    const cleared = initPeriodHealthFields({ ...DTO_A, bbt: '', weight: '', customTags: [] });
    expect(cleared.bbt).toBe('');
    expect(cleared.weight).toBe('');
    expect(cleared.customTags).toEqual([]);
    // …and the rest of A's values still restore.
    expect(cleared.sexLife).toBe('Protected');
  });

  it('garbage-typed DTO fields fall back to empty defaults, never throw', () => {
    const init = initPeriodHealthFields({
      id: 'X',
      title: 'x',
      bbt: 36.6,
      weight: null,
      customTags: 'tag',
      periodDays: '6',
      cycleLength: NaN,
      feelings: 'Happy',
    } as unknown as CalendarEventLike);
    expect(init.bbt).toBe('');
    expect(init.weight).toBe('');
    expect(init.customTags).toEqual([]);
    expect(init.feelings).toEqual([]);
    // NaN is typeof 'number' — passed through; the backend validates ranges.
    expect(init.periodDays).toBe(5);
    expect(init.cycleLength).toBe(NaN);
  });
});

describe('buildSheetSavePayload — the actual save contract', () => {
  it('A→B save: B\u2019s payload carries none of A\u2019s health values', () => {
    const payload = savePayloadFor(makeFormState(initPeriodHealthFields(DTO_B)));
    expect(payload.bbt).toBe('');
    expect(payload.weight).toBe('');
    expect(payload.customTags).toEqual([]);
    expect(payload.sexLife).toBe('');
    expect(payload.sleep).toBe('');
    expect(payload.energy).toBe('');
    expect(payload.intimateHealth).toBe('');
    expect(payload.hotFlashes).toBe('');
    expect(payload.collectionMethod).toBe('');
    expect(payload.moods).toEqual([]);
    expect(payload.pain).toEqual([]);
    // Sliders send the sheet defaults, not A's 6/30.
    expect(payload.periodDays).toBe(5);
    expect(payload.cycleLength).toBe(28);
    expect(payload.cycleDay).toBe(1);
    const dumped = JSON.stringify(payload);
    expect(dumped).not.toContain('36.6');
    expect(dumped).not.toContain('A-only');
  });

  it('unchanged-save: a fully-logged record round-trips its own values', () => {
    const payload = savePayloadFor(makeFormState(initPeriodHealthFields(DTO_A)), 'A');
    expect(payload.bbt).toBe('36.6');
    expect(payload.weight).toBe('58');
    expect(payload.customTags).toEqual(['A-only']);
    expect(payload.moods).toEqual(['Happy', 'Calm']);
    expect(payload.pain).toEqual(['Cramps']);
    expect(payload.sexLife).toBe('Protected');
    expect(payload.sleep).toBe('Woke up refreshed');
    expect(payload.energy).toBe('Energetic');
    expect(payload.periodDays).toBe(6);
    expect(payload.cycleLength).toBe(30);
    expect(payload.cycleDay).toBe(3);
    expect(payload.flowIntensity).toBe('heavy');
  });

  it('cleared-field save: empty string/array is sent so the backend clears the key', () => {
    const payload = savePayloadFor(
      makeFormState({ ...initPeriodHealthFields(DTO_A), bbt: '', customTags: [], feelings: [] }),
      'A',
    );
    // '' / [] (not undefined): the sheet-meta writer deletes the stored key.
    expect(payload.bbt).toBe('');
    expect(payload.customTags).toEqual([]);
    expect(payload.moods).toEqual([]);
  });

  it('derived description names only observations the record actually has', () => {
    const emptyDesc = savePayloadFor(makeFormState(initPeriodHealthFields(DTO_B))).description;
    expect(emptyDesc).toContain('__QUANT_META__');
    expect(emptyDesc).not.toContain('Feelings:');
    const fullDesc = savePayloadFor(makeFormState(initPeriodHealthFields(DTO_A)), 'A').description;
    expect(fullDesc).toContain('Feelings: Happy, Calm | Pain: Cramps | Energy: Energetic');
    // A user-typed description is preserved verbatim.
    const typed = savePayloadFor(makeFormState({ description: 'spotting only' }));
    expect(typed.description.endsWith('\nspotting only')).toBe(true);
  });

  it('meta header carries the sheet type and period fields', () => {
    const payload = savePayloadFor(makeFormState(initPeriodHealthFields(DTO_A)), 'A');
    const match = payload.description.match(/__QUANT_META__:(.*):__END_QUANT_META__/);
    expect(match).not.toBeNull();
    const meta = JSON.parse(match![1]);
    expect(meta.type).toBe('period');
    expect(meta.flowIntensity).toBe('heavy');
    expect(meta.cycleDay).toBe(3);
    expect(meta.feelings).toEqual(['Happy', 'Calm']);
  });

  it('non-period sheet types send no period health fields', () => {
    const form = makeFormState(initPeriodHealthFields(DTO_A));
    const eventPayload = buildSheetSavePayload({
      formState: form,
      sheetType: 'event',
      editingEventId: null,
      startIso: '2026-10-18T10:00:00.000Z',
      endIso: '2026-10-18T11:00:00.000Z',
      finalTitle: 'Standup',
      sendUpdate: false,
    });
    expect(eventPayload.bbt).toBeUndefined();
    expect(eventPayload.sexLife).toBeUndefined();
    expect(eventPayload.moods).toBeUndefined();
    expect(eventPayload.periodDays).toBeUndefined();
    expect(eventPayload.sendUpdate).toBeUndefined();
  });
});

describe('fix/qm-quant-meta-strip — __QUANT_META__ header idempotency', () => {
  const STORED_HEADER = '__QUANT_META__:{"type":"event","priority":"high"}:__END_QUANT_META__';
  const STORED = `${STORED_HEADER}\nTeam standup notes`;

  /** The exact seeding expression openEditSheet (calendar/page.tsx) now uses. */
  function seedEditDescription(stored: string): string {
    return stripQuantMeta(stored || '');
  }

  function saveEvent(formState: FormState, editingEventId: string | null = 'E') {
    return buildSheetSavePayload({
      formState,
      sheetType: 'event',
      editingEventId,
      startIso: '2026-10-18T10:00:00.000Z',
      endIso: '2026-10-18T11:00:00.000Z',
      finalTitle: 'Standup',
      sendUpdate: false,
    });
  }

  function headerCount(description: string): number {
    return (description.match(/__QUANT_META__:/g) || []).length;
  }

  it('edit-sheet seeding strips the stored header — the form holds only user text', () => {
    expect(seedEditDescription(STORED)).toBe('Team standup notes');
    expect(seedEditDescription(STORED_HEADER)).toBe('');
    expect(seedEditDescription('plain note')).toBe('plain note');
  });

  it('a seeded edit saves exactly one header with the user body intact', () => {
    const payload = saveEvent(makeFormState({ description: seedEditDescription(STORED) }));
    expect(headerCount(payload.description)).toBe(1);
    expect(payload.description).toContain('Team standup notes');
    expect(payload.description).not.toContain('"priority":"high"');
  });

  it('a stale header in the form text is dropped, not stacked (belt-and-braces save idempotency)', () => {
    // Simulates the OLD buggy seeding (raw stored description in the form):
    // even then, the payload must carry exactly one fresh header.
    const payload = saveEvent(makeFormState({ description: STORED }));
    expect(headerCount(payload.description)).toBe(1);
    expect(payload.description).toContain('Team standup notes');
    expect(payload.description).not.toContain('"priority":"high"');
  });

  it('repeated edits never accumulate headers (edit → save → edit → save)', () => {
    let stored: string = STORED;
    for (let i = 0; i < 3; i++) {
      const payload = saveEvent(makeFormState({ description: seedEditDescription(stored) }));
      stored = payload.description;
      expect(headerCount(stored)).toBe(1);
    }
    expect(stored).toContain('Team standup notes');
  });

  it('stacked legacy headers collapse to one on the next save', () => {
    const stacked = `${STORED_HEADER}\n${STORED_HEADER}\nTeam standup notes`;
    const payload = saveEvent(makeFormState({ description: seedEditDescription(stacked) }));
    expect(headerCount(payload.description)).toBe(1);
    expect(payload.description).toContain('Team standup notes');
  });
});
