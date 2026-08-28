/**
 * Conversation threading: how a flat list of messages becomes the rows the inbox
 * renders.
 *
 * Extracted from `app/page.tsx` because the rules here are subtle enough to be
 * worth a test, and a function that lives inside a 3,000-line page component
 * cannot have one. Two of them were wrong until recently, in ways that were
 * invisible from the call site — see `groupEmailsIntoThreads`.
 *
 * A plain `.ts` module: `tsconfig.backend.json` typechecks `src/**\/*.ts` with no
 * `jsx` option, so nothing here may import a `.tsx` file.
 */

import type { Email, EmailAddress, EmailCategory, MessageKind } from '../types';

/** One row in the inbox: a group of messages plus the summary the row shows. */
export interface ConversationThread {
  id: string;
  threadId: string;
  subject: string;
  normalizedSubject: string;
  latestEmail: Email;
  messages: Email[];
  count: number;
  /**
   * Everyone in the conversation who is not the signed-in user, in the order they
   * first appear. Empty for a note-to-self. The row uses the first entry to seed
   * the avatar, so a given person keeps one colour across every row they appear in.
   */
  participants: string[];
  /** `participants` rendered for one line — see `summarizeParticipants`. */
  participantsSummary: string;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: string | Date;
  category: EmailCategory;
  priority?: string;
  labels: string[];
  /**
   * Which kinds of message the conversation holds: only letters, only chat, or
   * both. Computed once here so the row does not walk the message list again, and
   * so `mixed` — the case that makes the unified thread worth having — has a name.
   */
  kindMix: ThreadKindMix;
}

/**
 * Whether an address belongs to the signed-in user.
 *
 * The handle-prefix check catches the case where the same person receives on one
 * domain and sends from another — a real situation for anyone with an alias, and
 * the reason a plain equality test is not enough. It is deliberately a prefix on
 * `handle@` and not on `handle`, so `kundansingh@` is not read as `kundan@`.
 *
 * Address only: no `isSent` flag, because this also has to answer the question for
 * a *recipient*, where no such flag exists.
 */
function isMyAddress(address?: string | null, currentEmail?: string): boolean {
  const addr = (address || '').trim().toLowerCase();
  const mine = (currentEmail || '').trim().toLowerCase();
  if (!addr || !mine) return false;
  if (addr === mine) return true;
  const handle = mine.split('@')[0];
  return Boolean(handle && addr.startsWith(`${handle}@`));
}

/**
 * Whether a message was sent by the signed-in user.
 *
 * Three signals, because the shape of a message depends on where it came from:
 * the server's own `isSent`/`status` when it round-tripped through our API, and
 * the address otherwise.
 */
export function isFromMe(email: Email, currentEmail?: string): boolean {
  const fromAddr = email.from?.email || (email as { fromAddress?: string }).fromAddress || '';
  return Boolean(
    isMyAddress(fromAddr, currentEmail) ||
    (email as { isSent?: boolean }).isSent ||
    email.status === 'sent',
  );
}

/**
 * Whether a message came from a machine rather than a person.
 *
 * Address shape only. It is deliberately not a classifier: the server has an
 * `aiCategory` column for that and nothing in the codebase ever writes to it, so
 * a UI claiming to tell "Updates" from "Offers" would be claiming knowledge it
 * does not have. What this *can* say honestly is that `no-reply@` will never read
 * your answer, which is enough to keep a notification out of a queue whose whole
 * promise is that a person is waiting on you.
 */
export function isAutomatedSender(email: Email): boolean {
  const fromAddr = (
    email.from?.email ||
    (email as { fromAddress?: string }).fromAddress ||
    ''
  ).toLowerCase();
  if (!fromAddr) return false;
  return /no-?reply|do-?not-?reply|notification|alert|newsletter|marketing|updates?@|promo|mailer|support@|digest|bot@|automated|noti(fy|ce)@/i.test(
    fromAddr,
  );
}

/** Which side of a conversation the ball is on. */
export type ThreadFocus = 'needs_you' | 'waiting' | 'neither';

/**
 * The conversational state of a thread: who spoke last.
 *
 * - `waiting` — you sent the most recent message, so you are waiting on them.
 * - `needs_you` — a person sent the most recent message, so they are waiting on
 *   you.
 * - `neither` — the most recent message is from a machine. Not a reply you owe,
 *   and not one you are owed.
 *
 * This is what replaced the inbox's category tabs. Those read `category`, which
 * `groupEmailsIntoThreads` resolves to `'primary'` for every message ever stored
 * because nothing writes `aiCategory` — so `Updates` and `Offers` were
 * permanently empty and `Contacts` collapsed to "not automated", three tabs
 * describing a classifier that was never built. Who spoke last is derivable from
 * the messages actually in hand, so the answer is always true.
 */
export function threadFocus(thread: ConversationThread, currentEmail?: string): ThreadFocus {
  const last = thread.messages[thread.messages.length - 1] ?? thread.latestEmail;
  if (!last) return 'neither';
  if (isFromMe(last, currentEmail)) return 'waiting';
  return isAutomatedSender(last) ? 'neither' : 'needs_you';
}

/** What kinds of message a conversation holds. */
export type ThreadKindMix = 'mail' | 'chat' | 'mixed';

/**
 * Whether a message is a letter or a line typed into the conversation.
 *
 * The server records this on the message, so the answer is normally just read
 * back. The fallback matters only for mail stored before the column existed: those
 * rows are letters, because the chat composer did not exist when they were
 * written, and every one of them came in through a mail client or the full
 * composer.
 *
 * It is read through one function rather than inline at each call site because the
 * previous behaviour was to *guess* — `!bodyHtml && bodyText.length < 120` — which
 * called a one-line letter a chat message and a long chat message a letter, and
 * which the thread view's own optimistic update defeated by filling in `bodyHtml`
 * for every reply it had just sent.
 */
export function messageKindOf(email?: Email | null): MessageKind {
  if (!email) return 'mail';
  return String(email.messageKind ?? '').toLowerCase() === 'chat' ? 'chat' : 'mail';
}

/**
 * The kinds present across a list of messages.
 *
 * `mixed` is the interesting answer: it is the case the unified thread exists for,
 * where a letter and a chat message sit in one conversation. An empty list reads
 * as `mail`, matching `messageKindOf`'s own default rather than inventing a fourth
 * state for a thread with nothing in it.
 */
export function threadKindMix(messages: Email[] = []): ThreadKindMix {
  let hasMail = false;
  let hasChat = false;
  for (const message of messages) {
    if (messageKindOf(message) === 'chat') hasChat = true;
    else hasMail = true;
    if (hasMail && hasChat) return 'mixed';
  }
  return hasChat ? 'chat' : 'mail';
}

/**
 * Repair mojibake and collapse whitespace in text destined for a single line.
 *
 * The `escape`/`decodeURIComponent` pair round-trips UTF-8 that arrived decoded as
 * Latin-1, which is the usual shape of the damage. It throws on anything it
 * cannot interpret that way, and the `catch` then patches the sequences seen most
 * often in real mail. The replacement table is content repair, not decoration —
 * the emoji in it are the output, so they stay.
 */
export function sanitizeSnippetText(text?: string): string {
  if (!text) return '';
  let clean = text;
  try {
    clean = decodeURIComponent(escape(text));
  } catch {
    clean = text
      .replace(/ðŸŽ‰/g, '🎉')
      .replace(/ðŸ‘\s*[\x80-\xBF]?/g, '👍')
      .replace(/ðŸ”¥/g, '🔥')
      .replace(/ðŸš€/g, '🚀')
      .replace(/âœ…/g, '✅')
      .replace(/â ¤ï¸ ?/g, '❤️')
      .replace(/ðŸ˜Š/g, '😊')
      .replace(/ðŸ’¡/g, '💡')
      .replace(/ðŸ’¬/g, '💬')
      .replace(/âš\xa0ï¸ ?/g, '⚠️')
      .replace(/â€[™']/g, "'")
      .replace(/â€œ|â€ /g, '"')
      .replace(/â€“|â€”/g, '—')
      .replace(/â€¦/g, '…');
  }
  return clean
    .replace(/Â[\u00A0\s]?/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The comparable form of a subject: repaired, stripped of every reply or forward
 * prefix, trimmed and lowercased.
 *
 * Stripping repeats rather than just the first marker matters for the same reason
 * the function exists at all. Mail that has been round-tripped a few times
 * arrives as `Re: Fwd: Re: Design review`, and a single-prefix strip left that
 * under its own key, in a separate conversation from `Design review` — the exact
 * merge failure this normalization is here to prevent. Outlook's `Re[2]:` counter
 * form is stripped by the same pass.
 *
 * The rule is deliberately the one the server already applies when it stitches
 * inbound mail by subject (`normalizeSubject` in
 * `backend/services/thread.service.ts`), so that client-side grouping cannot
 * disagree with the `threadId` the server hands back for the same two messages.
 *
 * Returns `''` for a subject that is nothing but prefixes, which is the signal
 * both callers below depend on.
 */
export function normalizeSubject(subject: string = ''): string {
  return sanitizeSnippetText(subject)
    .replace(/^(\s*(re|fwd|fw)(\[\d+\])?\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

/**
 * The addresses a message was written to, from whichever shape it arrived in.
 *
 * `formatEmailRecord` on the server populates both the structured `to`/`cc` arrays
 * and the flat `toAddresses`/`ccAddresses` string arrays, but a message read back
 * out of IndexedDB or built optimistically by the composer may carry only one of
 * them, so both are read.
 */
function recipientsOf(email: Email): EmailAddress[] {
  const out: EmailAddress[] = [];
  for (const field of ['to', 'cc'] as const) {
    const structured = email[field];
    if (Array.isArray(structured)) {
      for (const entry of structured) {
        if (typeof entry === 'string') out.push({ email: entry });
        else if (entry?.email) out.push(entry);
      }
    }
    const flat = (email as unknown as Record<string, unknown>)[`${field}Addresses`];
    if (Array.isArray(flat)) {
      for (const entry of flat) if (typeof entry === 'string' && entry) out.push({ email: entry });
    }
  }
  return out;
}

/**
 * How to show a person on one line, and the key that decides whether two mentions
 * of them are the same person.
 *
 * Keyed on the address, not the display name: the server synthesizes a recipient's
 * `name` from the local part, so the same human is `Alice` when they write to you
 * and `alice` when you write to them, and keying on the name lists them twice.
 */
function identityOf(address?: EmailAddress | null): { key: string; name: string } | null {
  const addr = (address?.email || '').trim();
  const name = (address?.name || '').trim();
  if (!addr && !name) return null;
  return {
    key: (addr || name).toLowerCase(),
    name: name || addr.split('@')[0] || addr,
  };
}

/**
 * Everyone in a conversation who is not the signed-in user, in the order they
 * first appear.
 *
 * Which end of a message to read depends on who wrote it: a message *to* you is
 * described by its sender, a message *from* you by its recipients. Reading only
 * the sender — which is what this did until recently — labelled every thread you
 * had sent with your own name, so in a unified inbox where most rows are yours the
 * list was a column of "You" and the row could not say who the conversation was
 * with.
 *
 * Recipients of *inbound* mail are deliberately left out. They are usually just
 * you, and on a group thread they push the person who actually wrote to you off
 * the end of a row that has a count, a dot, a kind mark and a timestamp to fit.
 *
 * Returns `[]` for a genuine note-to-self, which `summarizeParticipants` renders.
 */
export function threadParticipants(messages: Email[] = [], currentEmail?: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  const add = (identity: { key: string; name: string } | null) => {
    if (!identity || seen.has(identity.key)) return;
    seen.add(identity.key);
    names.push(identity.name);
  };

  for (const message of messages) {
    if (isFromMe(message, currentEmail)) {
      for (const recipient of recipientsOf(message)) {
        if (isMyAddress(recipient.email, currentEmail)) continue;
        add(identityOf(recipient));
      }
      continue;
    }
    const from =
      message.from ??
      ({
        email: (message as { fromAddress?: string }).fromAddress,
        name: (message as { fromName?: string }).fromName,
      } as EmailAddress);
    add(identityOf(from) ?? { key: `unknown:${message.id}`, name: 'Sender' });
  }

  return names;
}

/**
 * How many participants a row names before it counts the rest.
 *
 * Three fits the narrowest supported row; beyond that the names are truncated
 * mid-word by CSS, which reads as a rendering fault rather than as a group thread.
 */
const MAX_NAMED_PARTICIPANTS = 3;

/**
 * `threadParticipants` on one line.
 *
 * Nobody else in the conversation means you wrote to yourself, so the row says
 * `You` — the only case where it should, and the reason the empty list is not
 * rendered as a generic placeholder.
 */
export function summarizeParticipants(participants: string[]): string {
  if (participants.length === 0) return 'You';
  if (participants.length <= MAX_NAMED_PARTICIPANTS) return participants.join(', ');
  return `${participants.slice(0, MAX_NAMED_PARTICIPANTS).join(', ')} +${
    participants.length - MAX_NAMED_PARTICIPANTS
  }`;
}

/**
 * Group messages into conversations, newest conversation first.
 *
 * `threadId` wins when the server supplied one. Otherwise messages are grouped by
 * normalized subject — and the test for "has a subject" is the *normalized* form,
 * not the raw one. That distinction is the fix for a real defect: a subject of
 * literally `Re:` (or `Fwd:`, or two spaces) is truthy but normalizes to nothing,
 * so keying off the raw string sent every one of them to the single key `subj:`
 * and merged unrelated mail from unrelated senders into one thread. Such messages
 * are unthreadable, so each becomes its own conversation.
 *
 * The same test decides the displayed title, for the same reason: `subject || '(no
 * subject)'` let `Re:` through and rendered a prefix with nothing after it.
 *
 * `isRead` is `every` and `isStarred` is `some`: a conversation with one unread
 * message is unread, and starring any message flags the whole conversation, which
 * is what the star control on the row toggles.
 */
export function groupEmailsIntoThreads(
  emails: Email[] = [],
  currentEmail?: string,
): ConversationThread[] {
  if (!emails || emails.length === 0) return [];

  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const normalized = normalizeSubject(email.subject);
    const key = email.threadId || (normalized ? `subj:${normalized}` : `email:${email.id}`);
    const existing = threadMap.get(key) || [];
    existing.push(email);
    threadMap.set(key, existing);
  }

  const threads: ConversationThread[] = [];

  for (const [key, msgList] of threadMap.entries()) {
    msgList.sort(
      (a, b) =>
        new Date(a.receivedAt || a.createdAt || 0).getTime() -
        new Date(b.receivedAt || b.createdAt || 0).getTime(),
    );

    const latest = msgList[msgList.length - 1];
    const isRead = msgList.every((m) => m.isRead);
    const isStarred = msgList.some((m) => m.isStarred);

    const participants = threadParticipants(msgList, currentEmail);

    const normalizedLatest = normalizeSubject(latest.subject);

    threads.push({
      id: latest.id,
      threadId: latest.threadId || (key.startsWith('subj:') ? latest.id : key),
      subject: normalizedLatest ? latest.subject : '(no subject)',
      normalizedSubject: normalizedLatest,
      latestEmail: latest,
      messages: msgList,
      count: msgList.length,
      participants,
      participantsSummary: summarizeParticipants(participants),
      isRead,
      isStarred,
      receivedAt: latest.receivedAt || latest.createdAt || new Date(),
      category: latest.category || 'primary',
      priority: latest.priority,
      labels: Array.from(new Set(msgList.flatMap((m) => m.labels || []))),
      kindMix: threadKindMix(msgList),
    });
  }

  threads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return threads;
}
