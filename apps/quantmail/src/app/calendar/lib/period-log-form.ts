/**
 * fix/qm-calendar-period-log — period-log edit form initialization + save payload.
 *
 * ROOT CAUSE (CODEX-REVIEW 6250866664 on merged #1318): `openEditSheet` built
 * the edit form with `ev.<field> ?? prev.<field>` fallbacks, and `closeSheet`
 * never reset the form state. So: open record A (BBT 36.6, weight 58, tags
 * ['A-only']) → close → open record B whose DTO omits those health fields →
 * the form inherited A's values from `prev` → Save sent them → the backend
 * sheet-meta writer persisted A's observations into B. A same-account,
 * cross-record data-integrity leak.
 *
 * RULE (enforced by construction here): an edit form is initialized ONLY
 * from the selected record's DTO plus explicit empty/unknown defaults —
 * never from the previously opened record's observations. A field the DTO
 * omits starts empty ('' / []) so the sheet shows "not recorded" honestly
 * and an unchanged save sends ''/[]; the backend treats ''/[] as "clear"
 * (a no-op for a key the record never had) instead of fabricating values.
 *
 * These helpers are the actual code `openEditSheet`/`handleSaveEntry` call,
 * so the unit tests in __tests__/period-log-form.test.ts exercise the real
 * init + save contract (A→B transition, cancel/reopen, cleared-field,
 * unchanged-save).
 */
import type { CalendarEventLike, EntryType, FormState } from '../types';
import { toRecurrenceRule } from './recurrence';
// fix/qm-quant-meta-strip: the payload builder always prepends exactly one
// fresh __QUANT_META__ header, so the user text it carries must be
// header-free — otherwise a stale header stacked into the body survives as
// visible text and headers accumulate one per edit.
import { stripQuantMeta } from '../event/event-detail-utils';

export type PeriodHealthFieldState = Pick<
  FormState,
  | 'birthYear'
  | 'feelings'
  | 'pain'
  | 'energy'
  | 'flowIntensity'
  | 'spottingColor'
  | 'currentCycleDay'
  | 'collectionMethod'
  | 'sleep'
  | 'sexLife'
  | 'intimateHealth'
  | 'hotFlashes'
  | 'bbt'
  | 'weight'
  | 'customTags'
  | 'periodDays'
  | 'cycleLength'
>;

/**
 * Initialize the period/birthday health fields of the edit sheet from the
 * selected record's DTO. Pure function of `ev` — it deliberately takes no
 * "previous" state, so a previous record's values can never leak in.
 */
export function initPeriodHealthFields(ev: CalendarEventLike): PeriodHealthFieldState {
  return {
    birthYear: typeof ev.birthYear === 'string' ? ev.birthYear : '',
    feelings: Array.isArray(ev.feelings) ? ev.feelings : [],
    pain: Array.isArray(ev.pain) ? ev.pain : [],
    energy: typeof ev.energy === 'string' && ev.energy ? ev.energy : '',
    flowIntensity: ev.flowIntensity || 'medium',
    spottingColor: ev.spottingColor || 'red',
    currentCycleDay: typeof ev.cycleDay === 'number' ? ev.cycleDay : 1,
    collectionMethod:
      typeof ev.collectionMethod === 'string' && ev.collectionMethod ? ev.collectionMethod : '',
    sleep: typeof ev.sleep === 'string' && ev.sleep ? ev.sleep : '',
    sexLife: typeof ev.sexLife === 'string' && ev.sexLife ? ev.sexLife : '',
    intimateHealth:
      typeof ev.intimateHealth === 'string' && ev.intimateHealth ? ev.intimateHealth : '',
    hotFlashes: typeof ev.hotFlashes === 'string' && ev.hotFlashes ? ev.hotFlashes : '',
    bbt: typeof ev.bbt === 'string' ? ev.bbt : '',
    weight: typeof ev.weight === 'string' ? ev.weight : '',
    customTags: Array.isArray(ev.customTags) ? ev.customTags : [],
    periodDays: typeof ev.periodDays === 'number' ? ev.periodDays : 5,
    cycleLength: typeof ev.cycleLength === 'number' ? ev.cycleLength : 28,
  };
}

export interface SheetSavePayloadInput {
  formState: FormState;
  sheetType: EntryType;
  editingEventId: string | null;
  startIso: string;
  endIso: string;
  finalTitle: string;
  sendUpdate: boolean;
}

/**
 * Build the exact create/update payload `handleSaveEntry` sends. Extracted
 * verbatim (plus the honest derived-description below) so tests run the real
 * save contract, not a reimplementation.
 */
export function buildSheetSavePayload(input: SheetSavePayloadInput) {
  const { formState, sheetType, editingEventId, startIso, endIso, finalTitle, sendUpdate } = input;
  const isPeriod = sheetType === 'period';

  const metaObj = {
    type: sheetType,
    priority: sheetType === 'task' ? formState.priority : undefined,
    flowIntensity: isPeriod ? formState.flowIntensity : undefined,
    spottingColor: isPeriod ? formState.spottingColor : undefined,
    cycleDay: isPeriod ? formState.currentCycleDay : undefined,
    feelings: isPeriod ? formState.feelings : undefined,
    pain: isPeriod ? formState.pain : undefined,
    energy: isPeriod ? formState.energy : undefined,
    subtasks: sheetType === 'task' ? formState.subtasks : undefined,
    birthYear: sheetType === 'birthday' ? formState.birthYear : undefined,
    // Persisted by the backend into the __QUANT_META__ header; carried here
    // as well so the client-built description is self-consistent.
    driveLink: formState.driveLink.trim() || undefined,
  };
  const metaHeader = `__QUANT_META__:${JSON.stringify(metaObj)}:__END_QUANT_META__\n`;
  // Honest derived description: only observations the record actually has
  // are named. Editing a record that never logged feelings/pain/energy no
  // longer writes "Feelings:  | Pain:  | Energy: " noise into its description.
  const healthBits = [
    formState.feelings.length > 0 ? `Feelings: ${formState.feelings.join(', ')}` : '',
    formState.pain.length > 0 ? `Pain: ${formState.pain.join(', ')}` : '',
    formState.energy ? `Energy: ${formState.energy}` : '',
  ].filter(Boolean);
  const userDesc =
    // fix/qm-quant-meta-strip: strip any stale header the form text may
    // carry (defense in depth — openEditSheet already seeds stripped text),
    // so the fresh metaHeader below is the ONLY header in the payload.
    stripQuantMeta(formState.description || '') ||
    (isPeriod ? healthBits.join(' | ') : '');
  const finalDescription = metaHeader + userDesc;

  return {
    title: finalTitle,
    startTime: startIso,
    endTime: endIso,
    start: startIso,
    end: endIso,
    description: finalDescription,
    location: formState.location,
    allDay: formState.allDay,
    type: sheetType,
    color: formState.color,
    // The form holds the human-readable label (or a builder-made RRULE);
    // the API only accepts real RRULEs, so convert before sending.
    recurrence: toRecurrenceRule(formState.recurrence),
    reminders: formState.notifications,
    attendees: formState.attendees,
    accountEmail: formState.accountEmail,
    timezone: formState.timezone,
    // fix/qm-calendar-event-guest-notify: only true when the user confirmed
    // "Send update to guests?" above; the backend emails nobody otherwise.
    sendUpdate: editingEventId ? sendUpdate : undefined,
    driveLink: formState.driveLink,
    priority: sheetType === 'task' ? formState.priority : undefined,
    subtasks: sheetType === 'task' ? formState.subtasks : undefined,
    flowIntensity: isPeriod ? formState.flowIntensity : undefined,
    spottingColor: isPeriod ? formState.spottingColor : undefined,
    collectionMethod: isPeriod ? formState.collectionMethod : undefined,
    moods: isPeriod ? formState.feelings : undefined,
    pain: isPeriod ? formState.pain : undefined,
    sleep: isPeriod ? formState.sleep : undefined,
    sexLife: isPeriod ? formState.sexLife : undefined,
    energy: isPeriod ? formState.energy : undefined,
    intimateHealth: isPeriod ? formState.intimateHealth : undefined,
    hotFlashes: isPeriod ? formState.hotFlashes : undefined,
    bbt: isPeriod ? formState.bbt : undefined,
    weight: isPeriod ? formState.weight : undefined,
    customTags: isPeriod ? formState.customTags : undefined,
    cycleDay: isPeriod ? formState.currentCycleDay : undefined,
    // fix/qm-period-log-silent-drop-2: these were collected by the sheet
    // (period-length / cycle-length sliders) but never sent — the values
    // vanished on save. The backend folds them into the __QUANT_META__
    // header like the other top-level sheet fields.
    periodDays: isPeriod ? formState.periodDays : undefined,
    cycleLength: isPeriod ? formState.cycleLength : undefined,
  };
}
