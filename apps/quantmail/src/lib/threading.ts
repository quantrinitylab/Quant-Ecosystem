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

import type { Email, EmailCategory } from '../types';

/** One row in the inbox: a group of messages plus the summary the row shows. */
export interface ConversationThread {
  id: string;
  threadId: string;
  subject: string;
  normalizedSubject: string;
  latestEmail: Email;
  messages: Email[];
  count: number;
  sendersSummary: string;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: string | Date;
  category: EmailCategory;
  priority?: string;
  labels: string[];
}

/**
 * Whether a message was sent by the signed-in user.
 *
 * Three signals, because the shape of a message depends on where it came from:
 * the server's own `isSent`/`status` when it round-tripped through our API, and
 * the address otherwise. The handle-prefix check catches the case where the same
 * person receives on one domain and sends from another — a real situation for
 * anyone with an alias, and the reason a plain equality test is not enough.
 */
export function isFromMe(email: Email, currentEmail?: string): boolean {
  const normMyEmail = (currentEmail || '').trim().toLowerCase();
  const myHandle = normMyEmail.split('@')[0];
  const fromAddr = (
    email.from?.email ||
    (email as { fromAddress?: string }).fromAddress ||
    ''
  ).toLowerCase();
  return Boolean(
    (normMyEmail &&
      (fromAddr === normMyEmail || (myHandle && fromAddr.startsWith(`${myHandle}@`)))) ||
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

    const senderNames: string[] = [];
    let hasOther = false;
    for (const m of msgList) {
      if (isFromMe(m, currentEmail)) {
        if (!senderNames.includes('You')) senderNames.push('You');
      } else {
        hasOther = true;
        const name =
          m.from?.name ||
          (m as any).fromName ||
          m.from?.email?.split('@')[0] ||
          (m as any).fromAddress?.split('@')[0] ||
          'Sender';
        if (!senderNames.includes(name)) senderNames.push(name);
      }
    }
    let sendersSummary = senderNames.join(', ');
    if (senderNames.length === 0) sendersSummary = 'Conversation';
    else if (senderNames.length === 1 && senderNames[0] === 'You' && !hasOther)
      sendersSummary = 'You';

    const normalizedLatest = normalizeSubject(latest.subject);

    threads.push({
      id: latest.id,
      threadId: latest.threadId || (key.startsWith('subj:') ? latest.id : key),
      subject: normalizedLatest ? latest.subject : '(no subject)',
      normalizedSubject: normalizedLatest,
      latestEmail: latest,
      messages: msgList,
      count: msgList.length,
      sendersSummary,
      isRead,
      isStarred,
      receivedAt: latest.receivedAt || latest.createdAt || new Date(),
      category: latest.category || 'primary',
      priority: latest.priority,
      labels: Array.from(new Set(msgList.flatMap((m) => m.labels || []))),
    });
  }

  threads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return threads;
}
