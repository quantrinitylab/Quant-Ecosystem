/**
 * fix/qm-calendar-nlp-quickadd — dependency-free natural-language date parser
 * for the calendar quick-add (Google Calendar "Q" style).
 *
 * Parses free text like "Lunch with Sam 1pm", "Dentist tomorrow at 9am" or
 * "Call mom next Friday 6pm" into a concrete start/end. No external NLP
 * library: the patterns below cover the shapes people actually type, and
 * anything unrecognized returns null so the caller can fall back honestly
 * (open the full editor with the title prefilled) instead of guessing.
 *
 * Matching runs against a lowercase copy, but every strip cuts the same
 * range out of the ORIGINAL-cased text, so "Lunch with Sam" keeps its
 * capitals in the created event title.
 *
 * All dates resolve in the LOCAL timezone of the machine running the parse —
 * the calendar sheet and the event API both accept ISO strings, so callers
 * convert with toISOString() exactly like the manual editor does.
 */

export interface QuickAddParse {
  /** The title with every recognized date/time token stripped out. */
  title: string;
  start: Date;
  end: Date;
  /** True when the text named a date but no time ("Dentist tomorrow"). */
  allDay: boolean;
  /**
   * True when no usable date/time was found and the caller defaulted the
   * slot. Callers surface this honestly ("time suggested — adjust it")
   * instead of pretending the email said it.
   */
  timeWasSuggested: boolean;
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const NAMED_TIMES: Array<{ re: RegExp; hour: number; minute: number }> = [
  { re: /\bmidnight\b/, hour: 0, minute: 0 },
  { re: /\bnoon\b/, hour: 12, minute: 0 },
  { re: /\bmorning\b/, hour: 9, minute: 0 },
  { re: /\bafternoon\b/, hour: 14, minute: 0 },
  { re: /\bevening\b/, hour: 18, minute: 0 },
  { re: /\btonight\b/, hour: 20, minute: 0 },
];

/**
 * The working text in two parallel forms: `lower` for matching, `text` for
 * the title. Both stay the same length at all times (case never changes
 * string length for the ASCII tokens matched here), so a match index found
 * in `lower` cuts the identical range from `text`.
 */
interface Work {
  lower: string;
  text: string;
}

function toWork(input: string): Work {
  const text = ` ${input.trim()} `;
  return { lower: text.toLowerCase(), text };
}

/** Remove the first match of `re` from both forms, reporting the hit. */
function stripFirst(work: Work, re: RegExp): { work: Work; matched: boolean } {
  const m = work.lower.match(re);
  if (!m || m.index === undefined) return { work, matched: false };
  const cut = (s: string) => `${s.slice(0, m.index)} ${s.slice(m.index! + m[0].length)}`;
  return { work: { lower: cut(work.lower), text: cut(work.text) }, matched: true };
}

function atMidnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Upcoming weekday: "friday" → the next Friday (today if today is Friday). */
function upcomingWeekday(now: Date, target: number): Date {
  const delta = (target - now.getDay() + 7) % 7;
  return addDays(atMidnight(now), delta);
}

/** "next friday" → the Friday of next week (Monday-based weeks). */
function nextWeekday(now: Date, target: number): Date {
  const daysToNextMonday = ((8 - now.getDay()) % 7) || 7;
  const mondayNext = addDays(atMidnight(now), daysToNextMonday);
  const offset = (target + 6) % 7; // Monday=0 … Sunday=6
  return addDays(mondayNext, offset);
}

interface DateHit {
  date: Date;
}

function matchDate(work: Work, now: Date): { date: DateHit | null; work: Work } {
  let w = work;

  // "day after tomorrow"
  let r = stripFirst(w, /\bday after tomorrow\b/);
  if (r.matched) return { date: { date: addDays(atMidnight(now), 2) }, work: r.work };
  w = r.work;

  // "tomorrow" / "tmrw"
  r = stripFirst(w, /\btomorrow\b|\btmrw\b/);
  if (r.matched) return { date: { date: addDays(atMidnight(now), 1) }, work: r.work };
  w = r.work;

  // "tonight" pins the date to today; the time pass claims the 20:00.
  if (/\btonight\b/.test(w.lower)) {
    return { date: { date: atMidnight(now) }, work: w };
  }

  // "today"
  r = stripFirst(w, /\btoday\b/);
  if (r.matched) return { date: { date: atMidnight(now) }, work: r.work };
  w = r.work;

  // "in N days|weeks"
  const inMatch = w.lower.match(/\bin (\d+) (days?|weeks?)\b/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10) * (inMatch[2].startsWith('week') ? 7 : 1);
    return {
      date: { date: addDays(atMidnight(now), n) },
      work: stripFirst(w, /\bin \d+ (days?|weeks?)\b/).work,
    };
  }

  // "(this|next)? weekday"
  const wdRe = /\b(this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/;
  const wdMatch = w.lower.match(wdRe);
  if (wdMatch) {
    const target = WEEKDAYS.indexOf(wdMatch[2] as (typeof WEEKDAYS)[number]);
    const date = wdMatch[1] === 'next' ? nextWeekday(now, target) : upcomingWeekday(now, target);
    return { date: { date }, work: stripFirst(w, wdRe).work };
  }

  // "October 20" / "Oct 20" / "20 October" / "20th of October"
  const fwdRe =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(st|nd|rd|th)?\b/;
  const revRe =
    /\b(\d{1,2})(st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/;
  const fwd = w.lower.match(fwdRe);
  const rev = !fwd ? w.lower.match(revRe) : null;
  const monthHit = fwd ?? rev;
  if (monthHit) {
    const reversed = !fwd;
    const monthToken = (reversed ? monthHit[3] : monthHit[1]).toLowerCase();
    const dayToken = reversed ? monthHit[1] : monthHit[2];
    const monthIdx =
      monthToken.length > 3
        ? MONTHS.indexOf(monthToken as (typeof MONTHS)[number])
        : (MONTH_ABBR[monthToken] ?? -1);
    const dayNum = parseInt(dayToken, 10);
    if (monthIdx >= 0 && !Number.isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
      let date = new Date(now.getFullYear(), monthIdx, dayNum, 0, 0, 0, 0);
      // A month-day in the past means next year — never schedule backwards.
      if (date.getTime() < atMidnight(now).getTime()) {
        date = new Date(now.getFullYear() + 1, monthIdx, dayNum, 0, 0, 0, 0);
      }
      return { date: { date }, work: stripFirst(w, reversed ? revRe : fwdRe).work };
    }
  }

  // "10/20", "10-20", "2026-10-20"
  const numeric = w.lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[/-](\d{1,2})\b/);
  if (numeric) {
    let y = now.getFullYear();
    let m: number;
    let d: number;
    if (numeric[1]) {
      y = parseInt(numeric[1], 10);
      m = parseInt(numeric[2], 10) - 1;
      d = parseInt(numeric[3], 10);
    } else {
      m = parseInt(numeric[4], 10) - 1;
      d = parseInt(numeric[5], 10);
      const candidate = new Date(y, m, d, 0, 0, 0, 0);
      if (candidate.getTime() < atMidnight(now).getTime()) y += 1;
    }
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const date = new Date(y, m, d, 0, 0, 0, 0);
      const stripRe = numeric[1] ? /\b\d{4}-\d{1,2}-\d{1,2}\b/ : /\b\d{1,2}[/-]\d{1,2}\b/;
      return { date: { date }, work: stripFirst(w, stripRe).work };
    }
  }

  return { date: null, work: w };
}

interface TimeHit {
  hour: number;
  minute: number;
  /** "meet at 5" — the hour is genuinely ambiguous; the caller picks a side. */
  ambiguous?: boolean;
}

function matchTime(work: Work): { time: TimeHit | null; work: Work } {
  let w = work;

  // Named times first: "noon", "tonight", "morning"…
  for (const named of NAMED_TIMES) {
    const r = stripFirst(w, named.re);
    if (r.matched) return { time: { hour: named.hour, minute: named.minute }, work: r.work };
  }

  // "1pm", "1:30pm"
  const ampm = w.lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPm = ampm[3] === 'pm';
    if (hour >= 1 && hour <= 12 && minute <= 59) {
      if (isPm && hour !== 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      return {
        time: { hour, minute },
        work: stripFirst(w, /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/).work,
      };
    }
  }

  // 24-hour "14:30"
  const h24 = w.lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    return {
      time: { hour: parseInt(h24[1], 10), minute: parseInt(h24[2], 10) },
      work: stripFirst(w, /\b([01]?\d|2[0-3]):([0-5]\d)\b/).work,
    };
  }

  // Bare hour after "at": "meet at 5". Ambiguous — the caller resolves it
  // against the current time rather than guessing here.
  const atHour = w.lower.match(/\bat (\d{1,2})\b/);
  if (atHour) {
    const hour = parseInt(atHour[1], 10);
    if (hour >= 1 && hour <= 12) {
      return {
        time: { hour, minute: 0, ambiguous: true },
        work: stripFirst(w, /\bat \d{1,2}\b/).work,
      };
    }
  }

  return { time: null, work: w };
}

function matchDuration(work: Work): { minutes: number | null; work: Work } {
  // "for 2 hours", "for 30 minutes", "2h", "90 min"
  const forRe = /\bfor (\d+)\s*(hours?|hrs?|minutes?|mins?)\b/;
  const forMatch = work.lower.match(forRe);
  if (forMatch) {
    const n = parseInt(forMatch[1], 10);
    const minutes = /hour|hr/.test(forMatch[2]) ? n * 60 : n;
    return { minutes, work: stripFirst(work, forRe).work };
  }
  const hRe = /\b(\d+)\s*h\b/;
  if (hRe.test(work.lower)) {
    const n = parseInt(work.lower.match(hRe)![1], 10);
    return { minutes: n * 60, work: stripFirst(work, hRe).work };
  }
  const mRe = /\b(\d+)\s*min\b/;
  if (mRe.test(work.lower)) {
    const n = parseInt(work.lower.match(mRe)![1], 10);
    return { minutes: n, work: stripFirst(work, mRe).work };
  }
  return { minutes: null, work };
}

const FILLER_LEAD = /^(please\s+|kindly\s+|add\s+(an?\s+)?|schedule\s+(an?\s+)?|create\s+(an?\s+)?|set\s+up\s+(an?\s+)?)+/i;
const FILLER_TRAIL = /(\s+(please|thanks|thank\s+you))*$/i;

function cleanTitle(text: string): string {
  let title = text.replace(/\s+/g, ' ').trim();
  title = title.replace(FILLER_LEAD, '').replace(FILLER_TRAIL, '').trim();
  // Strip leftover connector words at the edges ("with" is kept mid-title:
  // "Lunch with Sam" must survive).
  title = title
    .replace(/^(with|at|on)\s+/i, '')
    .replace(/\s+(with|at|on)$/i, '')
    .trim();
  if (title.length > 200) title = title.slice(0, 200).trim();
  return title;
}

/**
 * Parse quick-add text. Returns null when there is nothing schedulable —
 * callers must NOT invent a date; open the full editor prefilled instead.
 */
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddParse | null {
  if (!input || !input.trim()) return null;
  let w = toWork(input);

  // Relative "in N hours/minutes" is a start offset, not a date+time pair.
  const relMatch = w.lower.match(/\bin (\d+)\s*(hours?|hrs?|minutes?|mins?)\b/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const minutes = /hour|hr/.test(relMatch[2]) ? n * 60 : n;
    w = stripFirst(w, /\bin \d+\s*(hours?|hrs?|minutes?|mins?)\b/).work;
    const dur = matchDuration(w);
    w = dur.work;
    const title = cleanTitle(w.text);
    if (!title) return null;
    const start = new Date(now.getTime() + minutes * 60_000);
    const end = new Date(start.getTime() + (dur.minutes ?? 60) * 60_000);
    return { title, start, end, allDay: false, timeWasSuggested: false };
  }

  const dateRes = matchDate(w, now);
  w = dateRes.work;
  const timeRes = matchTime(w);
  w = timeRes.work;
  const dur = matchDuration(w);
  w = dur.work;

  const title = cleanTitle(w.text);
  if (!title) return null;

  // No date and no time → nothing schedulable. Never guess.
  if (!dateRes.date && !timeRes.time) return null;

  const day = dateRes.date ? dateRes.date.date : atMidnight(now);

  if (!timeRes.time) {
    // Date but no time → all-day.
    const start = atMidnight(day);
    const end = new Date(start);
    end.setHours(23, 59, 59, 0);
    return { title, start, end, allDay: true, timeWasSuggested: false };
  }

  let { hour, minute } = timeRes.time;
  if (timeRes.time.ambiguous) {
    // "meet at 5": prefer the upcoming occurrence — the afternoon slot when
    // the morning one already passed.
    const candidate = new Date(day);
    candidate.setHours(hour, minute, 0, 0);
    const picked =
      candidate.getTime() > now.getTime()
        ? candidate
        : new Date(day).setHours(hour + 12, minute, 0, 0);
    const d = new Date(picked);
    hour = d.getHours();
    minute = d.getMinutes();
  }

  const start = new Date(day);
  start.setHours(hour, minute, 0, 0);
  // A time earlier today means tomorrow — never schedule in the past.
  if (!dateRes.date && start.getTime() <= now.getTime()) {
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start.getTime() + (dur.minutes ?? 60) * 60_000);
  return { title, start, end, allDay: false, timeWasSuggested: false };
}
