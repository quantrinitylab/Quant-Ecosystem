/**
 * fix/qm-calendar-nlp-quickadd — one-key event-from-email (Superhuman
 * "Instant Event" style): build a calendar draft from an open email thread.
 *
 * Attendees come from the thread's real participants (from/to/cc across every
 * message, deduplicated, minus the signed-in user). The time is parsed out of
 * the subject/snippet with the same NLP parser the quick-add uses; when the
 * email names no time the draft falls back to tomorrow 10:00 and says so
 * honestly (`timeWasSuggested`), so the sheet never pretends the email said
 * something it didn't.
 *
 * No meeting link is invented: QuantMail events have no video-link field, so
 * the location stays empty for the user to fill. The description carries a
 * real link back to the thread instead.
 */

import type { Email } from '../types';
import { parseQuickAdd } from '../app/calendar/lib/nlpEventParser';

export type EmailDraftEntryType = 'event' | 'task';

export interface EmailEventDraft {
  entryType: EmailDraftEntryType;
  title: string;
  /** ISO strings, local-time based — exactly what the event sheet sends. */
  startISO: string;
  endISO: string;
  allDay: boolean;
  /** Real participant email addresses, never names. */
  attendees: string[];
  description: string;
  threadId: string;
  /** True when the email named no time and tomorrow-10:00 was defaulted. */
  timeWasSuggested: boolean;
}

const SUBJECT_PREFIX = /^(re|fwd?|aw|wg)\s*:\s*/i;

function cleanSubject(subject: string): string {
  let s = (subject || '').trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(SUBJECT_PREFIX, '').trim();
  } while (s !== prev);
  return s || '(No subject)';
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Build the draft from a thread's messages. Returns null when there is
 * nothing to build from (empty thread). Never throws on malformed rows.
 */
export function buildEventDraftFromThread(
  messages: Email[],
  selfEmail: string,
  now: Date = new Date(),
  entryType: EmailDraftEntryType = 'event',
): EmailEventDraft | null {
  if (!messages || messages.length === 0) return null;
  const self = (selfEmail || '').trim().toLowerCase();

  const attendees: string[] = [];
  const seen = new Set<string>();
  const pushAddr = (raw: string | undefined | null) => {
    const addr = (raw || '').trim().toLowerCase();
    if (!addr || addr === self || seen.has(addr)) return;
    if (!isPlausibleEmail(addr)) return;
    seen.add(addr);
    attendees.push(addr);
  };

  for (const m of messages) {
    pushAddr(m?.from?.email);
    for (const a of m?.to ?? []) pushAddr(a?.email);
    for (const a of m?.cc ?? []) pushAddr(a?.email);
  }
  // The backend caps attendees at 200; stay well inside it.
  const cappedAttendees = attendees.slice(0, 100);

  const latest = messages[messages.length - 1];
  const threadId = latest?.threadId || messages[0]?.threadId || '';
  const title = cleanSubject(latest?.subject || '');

  // Try to lift a real time out of the email before defaulting one.
  const haystack = `${latest?.subject || ''} ${(latest?.snippet || latest?.bodyText || '').slice(0, 600)}`;
  const parsed = parseQuickAdd(haystack, now);
  let start: Date;
  let end: Date;
  let allDay = false;
  let timeWasSuggested = false;
  if (parsed) {
    start = parsed.start;
    end = parsed.end;
    allDay = parsed.allDay;
  } else {
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(10, 0, 0, 0);
    start = fallback;
    end = new Date(fallback.getTime() + 60 * 60_000);
    timeWasSuggested = true;
  }

  const snippet = (latest?.snippet || latest?.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const descriptionLines = [
    `From email: ${title}`,
    ...(snippet ? [`“${snippet}”`] : []),
    ...(threadId ? [`Open the email: /thread/${threadId}`] : []),
    ...(timeWasSuggested ? ['Suggested time — the email named no time, so tomorrow 10:00 was picked. Adjust it.'] : []),
  ];

  return {
    entryType,
    title,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    allDay,
    attendees: cappedAttendees,
    description: descriptionLines.join('\n'),
    threadId,
    timeWasSuggested,
  };
}

/** URL-safe transport for the /calendar?emailDraft= deep link. */
export function encodeEmailDraft(draft: EmailEventDraft): string {
  const json = JSON.stringify(draft);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeEmailDraft(encoded: string): EmailEventDraft | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(padded)));
    const draft = JSON.parse(json) as Partial<EmailEventDraft>;
    if (!draft || typeof draft.title !== 'string' || typeof draft.startISO !== 'string') return null;
    return {
      entryType: draft.entryType === 'task' ? 'task' : 'event',
      title: draft.title.slice(0, 200),
      startISO: draft.startISO,
      endISO: typeof draft.endISO === 'string' ? draft.endISO : draft.startISO,
      allDay: draft.allDay === true,
      attendees: Array.isArray(draft.attendees)
        ? draft.attendees.filter((a): a is string => typeof a === 'string').slice(0, 100)
        : [],
      description: typeof draft.description === 'string' ? draft.description.slice(0, 2000) : '',
      threadId: typeof draft.threadId === 'string' ? draft.threadId : '',
      timeWasSuggested: draft.timeWasSuggested === true,
    };
  } catch {
    return null;
  }
}
