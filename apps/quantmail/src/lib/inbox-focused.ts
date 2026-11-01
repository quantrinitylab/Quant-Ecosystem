/**
 * Slice 1 of the QuantMail inbox rebuild: Focused/Other partition, date group
 * headers, and @-mention highlighting for the inbox list.
 *
 * Everything here is pure and client-side, so it is unit-testable without a
 * mailbox. It deliberately invents no priority classifier:
 *
 * - The Focused rule reuses signals this client already computes:
 *   `ConversationThread.category` (the client-side heuristic in
 *   `lib/threading.ts` `classifyThreadCategory`, which runs inside
 *   `groupEmailsIntoThreads`), the address-book join, and the
 *   starred/high-priority flags. It is a heuristic partition, not Outlook's
 *   server-side Focused model, and the UI says so in its title text.
 * - Date groups are calendar-day buckets off `receivedAt`, documented below.
 * - @-mentions highlight `@handle` tokens only. A full-name mention
 *   ("@Sam Lee") cannot be told apart from ordinary prose in plain text
 *   without a contact directory, so it is not guessed at.
 */

export type FocusedThreadSignals = {
  /** Client-heuristic category: 'primary' | 'updates' | 'social' | 'promotions' | 'forums'. */
  category?: string;
  /** True when any participant is in the user's address book. */
  isContact?: boolean;
  /** True when starred or high-priority. */
  isImportant?: boolean;
};

/**
 * The Focused/Other rule, stated plainly:
 * Focused = a direct (primary-category) conversation, OR one with someone in
 * the address book, OR a starred/high-priority one. Other = everything else
 * (updates, offers, social and forums mail that is none of those three).
 */
export function matchesFocusedRule(signals: FocusedThreadSignals): boolean {
  return (
    signals.category === 'primary' || signals.isContact === true || signals.isImportant === true
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Date-group label for one message date, against `now` (default: today).
 * Buckets, in local calendar days:
 * - same day -> 'Today'
 * - 1 day ago -> 'Yesterday'
 * - 2-6 days ago -> 'This Week'
 * - 7-30 days ago -> 'Last Month'
 * - older -> the 4-digit year ('2025')
 * - unparseable/missing -> 'Earlier' (the row still renders, in the last group)
 */
export function dateGroupLabelFor(
  value: string | Date | undefined | null,
  now: Date = new Date(),
): string {
  if (!value) return 'Earlier';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / dayMs,
  );
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 6) return 'This Week';
  if (diffDays <= 30) return 'Last Month';
  return String(date.getFullYear());
}

export type MentionSegment = { text: string; mention: boolean };

const MENTION_RE = /(@[A-Za-z0-9._+-]+)/g;

/**
 * Split preview text into plain and @-mention segments. Mention segments
 * render highlighted (blue) in the row; they are not links, because no
 * profile route exists to point one at.
 */
export function splitMentionSegments(text: string): MentionSegment[] {
  if (!text) return [];
  const segments: MentionSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), mention: false });
    }
    segments.push({ text: match[0], mention: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), mention: false });
  }
  return segments;
}
