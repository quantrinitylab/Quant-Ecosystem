/**
 * Session undo for calendar deletes (the `z` shortcut).
 *
 * The backend delete is final — there is no trash — so undo re-creates the
 * entry from the raw DTO captured before the delete. The rebuild is a pure
 * function so it is unit-testable without the network; it returns `null` when
 * the DTO cannot be faithfully restored (unparseable dates), and the caller
 * must surface that honestly instead of creating a corrupted entry.
 *
 * Fidelity notes:
 *
 * - `description` passes through verbatim, meta header included. Every
 *   sheet-type field (priority, subtasks, flow intensity, feelings, …) rides
 *   in `__QUANT_META__`, so the header round-trips them all; the individual
 *   top-level sheet fields are not columns server-side and are re-derived
 *   from the header on the next read.
 * - `recurrence` goes through `toRecurrenceRule`, which passes an RRULE
 *   straight through — a deleted recurring series is restored as a series.
 * - `color` is intentionally absent: the DTO does not carry it and neither
 *   does the stored row, so there is nothing faithful to restore.
 * - Attendees are reduced to email-shaped strings; the backend drops
 *   malformed ones anyway, and re-inviting a malformed address would be worse
 *   than dropping it.
 */

import { toRecurrenceRule } from './recurrence';
import { isEmailShaped } from './attendee-validation';

export interface UndoCreatePayload {
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  attendees: string[];
  reminders: unknown[];
  recurrence: string | null;
  timeZone?: string;
  accountEmail?: string;
  type?: string;
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function emailList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const email =
      typeof entry === 'string' ? entry.trim() : String((entry as { email?: unknown })?.email ?? '').trim();
    if (!email || !isEmailShaped(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

/**
 * Rebuild a POST /events create payload from a raw event DTO.
 * Returns `null` when the DTO has no parseable start/end — restoring a
 * dateless entry would corrupt the calendar, so the shortcut must decline.
 */
export function buildUndoCreatePayload(raw: unknown): UndoCreatePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const dto = raw as Record<string, unknown>;

  const startDate = toValidDate(dto.startTime);
  const endDate = toValidDate(dto.endTime);
  if (!startDate || !endDate) return null;

  const title =
    typeof dto.title === 'string' && dto.title.trim() ? dto.title.trim() : 'Restored event';

  const payload: UndoCreatePayload = {
    title,
    // Verbatim: the stored description already carries the __QUANT_META__
    // header; re-prepending one would duplicate it.
    description: typeof dto.description === 'string' ? dto.description : '',
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    allDay: Boolean(dto.allDay),
    location: typeof dto.location === 'string' ? dto.location : '',
    attendees: emailList(dto.attendees),
    // The stored labels round-trip through the backend's own reminder
    // normaliser; pass through rather than reinterpreting them.
    reminders: Array.isArray(dto.reminders) ? dto.reminders : [],
    recurrence: toRecurrenceRule(
      typeof dto.recurrence === 'string' ? dto.recurrence : (dto.recurrenceRule as string | undefined),
    ),
  };

  const timeZone = dto.timeZone ?? dto.timezone;
  if (typeof timeZone === 'string' && timeZone.trim()) {
    payload.timeZone = timeZone;
  }
  if (typeof dto.accountEmail === 'string' && dto.accountEmail.trim()) {
    payload.accountEmail = dto.accountEmail;
  }
  const type = dto.type;
  if (type === 'event' || type === 'task' || type === 'birthday' || type === 'period') {
    payload.type = type;
  }

  return payload;
}
