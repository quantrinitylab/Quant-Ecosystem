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
 * This is deliberately the same set of people that `conversationKeyOf` groups on,
 * so the row's label and the reason the row exists cannot disagree. They used to:
 * recipients of *inbound* mail were left out, on the grounds that they are usually
 * just you. Once a row became a person rather than a subject, that shortcut
 * produced two rows both labelled `Alice` — the 1:1 and the group Alice happened
 * to have written to — which is the same "one person, several rows" confusion the
 * subject-keyed grouping used to cause, arriving by a different route.
 *
 * The sender still goes in first, so the primary name on the row is whoever wrote
 * the message being previewed, and the avatar keeps one colour per person.
 * `summarizeParticipants` is what stops a long list from overflowing.
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
    if (!isFromMe(message, currentEmail)) {
      const from =
        message.from ??
        ({
          email: (message as { fromAddress?: string }).fromAddress,
          name: (message as { fromName?: string }).fromName,
        } as EmailAddress);
      const identity = identityOf(from);
      if (identity) {
        if (!isMyAddress(from?.email, currentEmail)) add(identity);
      } else if (recipientsOf(message).length === 0) {
        // Nothing on the message names anyone. The row still has to say something,
        // and `Sender` is more honest than the reader's own name.
        add({ key: `unknown:${message.id}`, name: 'Sender' });
      }
    }

    for (const recipient of recipientsOf(message)) {
      if (isMyAddress(recipient.email, currentEmail)) continue;
      add(identityOf(recipient));
    }
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
 * The key that decides which row a message belongs to: who the conversation is
 * *with*.
 *
 * This is the one place where QuantMail stops being a mail client. A mail client
 * threads by subject, so `Hello`, `How are you` and `Re: Good` to the same person
 * are three rows, and a note you wrote yourself last Tuesday is a fourth row away
 * from the one you wrote today. That is what the inbox did, and it is what the
 * reader was complaining about: one person spread over four rows, `You` appearing
 * twice in the same screen, and no row that could show a send and its reply side
 * by side.
 *
 * A chat list threads by *person*, and that is the product this is. So the key is
 * the set of addresses on the message that are not yours — sender if the message
 * came in, recipients and cc if it went out — which makes a send and the reply to
 * it land in one place by construction rather than by hoping the server issued
 * the same `threadId` for both. Subject still names each message inside the
 * thread; it just no longer decides where the thread is.
 *
 * A group of three is its own key, not a merge into any of the three 1:1
 * conversations, for the same reason a group chat is its own row.
 *
 * `self` is the note-to-self bucket: nobody else on the message. `threadId` is not
 * consulted at all — it was the thing splitting these rows — but it is still
 * carried on the thread from the newest message, which is what a reply targets.
 */
function conversationKeyOf(email: Email, currentEmail?: string): string {
  const keys = new Set<string>();

  if (!isFromMe(email, currentEmail)) {
    const from =
      email.from ??
      ({
        email: (email as { fromAddress?: string }).fromAddress,
        name: (email as { fromName?: string }).fromName,
      } as EmailAddress);
    const identity = identityOf(from);
    if (identity && !isMyAddress(from?.email, currentEmail)) keys.add(identity.key);
  }

  for (const recipient of recipientsOf(email)) {
    if (isMyAddress(recipient.email, currentEmail)) continue;
    const identity = identityOf(recipient);
    if (identity) keys.add(identity.key);
  }

  if (keys.size === 0) return 'self';
  return `with:${Array.from(keys).sort().join('|')}`;
}

/**
 * How far apart two copies of one send may be timestamped and still be recognised
 * as the same message.
 *
 * The pair is written by two statements in the same request, so the real gap is
 * milliseconds; the allowance is generous because the two rows take their time
 * from different clocks (`sentAt` on the stored copy, `receivedAt` on the
 * delivered one) and a slow write should not turn one message into two.
 */
const DUPLICATE_WINDOW_MS = 120_000;

/**
 * Whether two messages in the same conversation are one message stored twice.
 *
 * Sending to an address that is also yours writes two rows: the copy in Sent
 * (`isSent: true`) and the copy that was delivered (`isSent: false`). They carry
 * different ids, so nothing downstream could tell they were one send — a
 * two-message conversation counted 4, and because the Sent copy is written with
 * `isRead: false`, every such conversation also read as unread forever.
 *
 * The test is deliberately narrow. Disagreeing on `isSent` is required, which is
 * what makes this a send/delivery pair rather than two genuinely similar messages
 * — a person who sends `ok` twice in a minute has said two things, and both of
 * those carry the same `isSent`.
 */
function isSameSend(a: Email, b: Email): boolean {
  const sentA = Boolean((a as { isSent?: boolean }).isSent);
  const sentB = Boolean((b as { isSent?: boolean }).isSent);
  if (sentA === sentB) return false;
  if (normalizeSubject(a.subject) !== normalizeSubject(b.subject)) return false;
  if (messageKindOf(a) !== messageKindOf(b)) return false;
  const bodyA = (a.bodyText || (a as { bodyPlain?: string }).bodyPlain || '').trim();
  const bodyB = (b.bodyText || (b as { bodyPlain?: string }).bodyPlain || '').trim();
  if (bodyA !== bodyB) return false;
  const replyA = (a as { inReplyTo?: string | null }).inReplyTo || '';
  const replyB = (b as { inReplyTo?: string | null }).inReplyTo || '';
  if (replyA !== replyB) return false;
  const timeA = new Date(a.receivedAt || a.createdAt || 0).getTime();
  const timeB = new Date(b.receivedAt || b.createdAt || 0).getTime();
  return Math.abs(timeA - timeB) <= DUPLICATE_WINDOW_MS;
}

/**
 * Collapse each send/delivery pair into the one message it is.
 *
 * The surviving copy is the earlier of the two, so ordering is untouched, and it
 * inherits the union of the flags: read if either copy was read, starred if
 * either was starred. Read is a union rather than an `every` because the Sent
 * copy's `isRead: false` is a storage artefact — nobody has to open their own
 * outgoing message before it stops being new.
 *
 * It also inherits the loser's *id*, in `collapsedIds`. Flags alone were not
 * enough: the copy that disappears here is still a row in the mailbox, and a
 * conversation that is entirely your own sends — every self-sent thread, and every
 * thread you have replied to — is made of nothing but these pairs. Archiving one
 * moved the halves the screen had kept and left the halves it had folded away, so
 * the conversation was in the archive and the inbox at once and the row survived a
 * reload. Read state failed the same way, one copy at a time.
 *
 * `messages` must already be sorted oldest-first.
 */
function collapseDuplicateSends(messages: Email[]): Email[] {
  const out: Email[] = [];
  for (const message of messages) {
    const twinIndex = out.findIndex((seen) => isSameSend(seen, message));
    if (twinIndex === -1) {
      out.push(message);
      continue;
    }
    const twin = out[twinIndex];
    out[twinIndex] = {
      ...twin,
      isRead: Boolean(twin.isRead) || Boolean(message.isRead),
      isStarred: Boolean(twin.isStarred) || Boolean(message.isStarred),
      snippet: twin.snippet || message.snippet,
      threadId: twin.threadId || message.threadId,
      // A pair can itself be paired with a third copy, so the loser's own folded
      // ids come along too rather than being dropped one level down.
      collapsedIds: Array.from(
        new Set(
          [...(twin.collapsedIds ?? []), message.id, ...(message.collapsedIds ?? [])].filter(
            Boolean,
          ),
        ),
      ),
    } as Email;
  }
  return out;
}

/**
 * Group messages into conversations, newest conversation first.
 *
 * Grouping is by counterparty — see `conversationKeyOf` for why a chat list and a
 * mail client answer this differently, and why this is the chat list's answer.
 *
 * The displayed title comes from the newest message, and the test for "has a
 * subject" is the *normalized* form, not the raw one: a subject of literally `Re:`
 * is truthy but normalizes to nothing, and `subject || '(no subject)'` let it
 * through and rendered a reply marker pointing at nothing.
 *
 * `isRead` treats anything you sent as read — you cannot have unread mail from
 * yourself, and the Sent copy of a message is stored with `isRead: false` — so a
 * conversation is unread only when a message *someone else* sent is unread.
 * `isStarred` is `some`: starring any message flags the whole conversation, which
 * is what the pin control on the row toggles.
 */
export function groupEmailsIntoThreads(
  emails: Email[] = [],
  currentEmail?: string,
): ConversationThread[] {
  // `Array.isArray` and not a truthiness check: this was handed the search route's
  // pagination envelope — an object, so truthy, and `.length === 0` was
  // `undefined === 0` — and threw `emails is not iterable` on the line below. The
  // error boundary caught it, so the inbox looked empty rather than broken and the
  // bug read as "search finds nothing". A shape the grouper does not understand
  // should cost you results, never the screen.
  if (!Array.isArray(emails) || emails.length === 0) return [];

  const threadMap = new Map<string, Email[]>();

  for (const email of emails) {
    const key = conversationKeyOf(email, currentEmail);
    const existing = threadMap.get(key) || [];
    existing.push(email);
    threadMap.set(key, existing);
  }

  const threads: ConversationThread[] = [];

  for (const msgList of threadMap.values()) {
    msgList.sort(
      (a, b) =>
        new Date(a.receivedAt || a.createdAt || 0).getTime() -
        new Date(b.receivedAt || b.createdAt || 0).getTime(),
    );

    const messages = collapseDuplicateSends(msgList);
    const latest = messages[messages.length - 1];
    const isRead = messages.every((m) => m.isRead || isFromMe(m, currentEmail));
    const isStarred = messages.some((m) => m.isStarred);

    const participants = threadParticipants(messages, currentEmail);

    const normalizedLatest = normalizeSubject(latest.subject);

    threads.push({
      id: latest.id,
      threadId: latest.threadId || latest.id,
      subject: normalizedLatest ? latest.subject : '(no subject)',
      normalizedSubject: normalizedLatest,
      latestEmail: latest,
      messages,
      count: messages.length,
      participants,
      participantsSummary: summarizeParticipants(participants),
      isRead,
      isStarred,
      receivedAt: latest.receivedAt || latest.createdAt || new Date(),
      category: latest.category || 'primary',
      priority: latest.priority,
      labels: Array.from(new Set(messages.flatMap((m) => m.labels || []))),
      kindMix: threadKindMix(messages),
    });
  }

  threads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return threads;
}

/**
 * The conversation a given id belongs to.
 *
 * Once a row stopped being a server thread, `/thread/<id>` could no longer be
 * answered by the server: `GET /threads/:id` returns the messages that share one
 * `threadId`, which is one message out of the eleven the row had just counted. So
 * tapping a row that said `11` opened a page that said `1 Message`, and the row and
 * the page it opened disagreed about what a conversation is.
 *
 * This resolves the id against the same grouping the row came from, so they cannot.
 * Any of the four things a caller might be holding will find it — the conversation's
 * own `id` or `threadId`, or the `id` or `threadId` of any message inside it —
 * because the inbox links with the thread id, a notification with a message id, and
 * a reply's optimistic copy with whatever the server just issued.
 *
 * Message ids are checked before thread ids on purpose. A conversation carries the
 * `threadId` of its newest message, so with several conversations open on the same
 * server thread the message id is the one that identifies exactly one of them.
 */
export function findConversation(
  threads: ConversationThread[] = [],
  id?: string | null,
): ConversationThread | null {
  if (!id) return null;

  for (const thread of threads) {
    if (thread.id === id) return thread;
    if (thread.messages.some((m) => m.id === id)) return thread;
  }

  for (const thread of threads) {
    if (thread.threadId === id) return thread;
    if (thread.messages.some((m) => m.threadId === id)) return thread;
  }

  return null;
}

/**
 * The stored rows a list of messages stands for, as ids.
 *
 * Not the same thing as the messages themselves: `collapseDuplicateSends` folds a
 * send and its delivery copy into one bubble, so two visible messages can be four
 * rows in the mailbox. An action given only the visible ids moves half of a
 * conversation — the live inbox listed a thread the archive was listing at the same
 * moment, and it survived a reload.
 *
 * De-duplicated, because a message and a folded copy can name the same row, and
 * empty ids are dropped so an optimistic copy that has not been issued an id yet
 * cannot become a request for `undefined`.
 */
export function messageRowIds(messages: readonly Email[] | null | undefined): string[] {
  if (!Array.isArray(messages)) return [];
  return Array.from(
    new Set(messages.flatMap((m) => [m.id, ...(m.collapsedIds ?? [])]).filter(Boolean)),
  );
}

/**
 * Every message a conversation is made of, as ids.
 *
 * What a mailbox action has to be given. `thread.id` is the *newest message's* id,
 * which is the right thing to link with and the wrong thing to act on: archiving a
 * row that counted eleven moved one message and left ten behind, so the row came
 * straight back one shorter. Read state was worse than wasteful — a row is unread
 * when *any* inbound message in it is, so marking one message read left the row
 * bold with no way to clear it.
 */
export function threadMessageIds(thread: ConversationThread | null | undefined): string[] {
  if (!thread) return [];
  return messageRowIds(thread.messages);
}

/**
 * Everything about a conversation that a person could reasonably expect to find it by.
 *
 * Joined with whitespace, which a token can never contain — the query is split on it —
 * so no token can match across the seam between two fields.
 *
 * Both spellings of every field are read, for the same reason `recipientsOf` reads
 * both: a message rehydrated from IndexedDB or built optimistically by the composer
 * carries `fromAddress`/`bodyPlain`, while one straight from `formatEmailRecord`
 * carries `from`/`bodyText`.
 *
 * `bodyHtml` is deliberately not in here. Searching markup matches tag and attribute
 * names, so `div`, `span` and `href` would hit nearly every letter in the mailbox.
 */
function searchHaystack(thread: ConversationThread, currentEmail?: string): string {
  const parts: string[] = [thread.subject, thread.normalizedSubject, ...thread.participants];

  for (const message of thread.messages) {
    const raw = message as unknown as Record<string, unknown>;
    parts.push(
      message.subject || '',
      message.from?.name || '',
      message.from?.email || '',
      typeof raw.fromName === 'string' ? raw.fromName : '',
      typeof raw.fromAddress === 'string' ? raw.fromAddress : '',
      message.bodyText || '',
      typeof raw.bodyPlain === 'string' ? raw.bodyPlain : '',
      message.snippet || '',
    );

    for (const person of recipientsOf(message)) {
      parts.push(person.name || '', person.email || '');
    }

    // The thread view signs your own messages `You`, so `you` is a name in this
    // mailbox and search has to answer to it. `me` for the same reason — it is what
    // people type when `you` does not work.
    if (isFromMe(message, currentEmail)) parts.push('you me');
  }

  return parts.join('   ').toLowerCase();
}

/**
 * Whether a conversation answers to what was typed.
 *
 * Tokens are ANDed: every word has to appear somewhere in the conversation, in any
 * field, in any message. That is the behaviour people already expect from a search
 * box, and it is what makes a second word narrow the list instead of widening it.
 * Order does not matter and neither does which field each word came from, so
 * `alice budget` finds Alice's thread about the budget.
 *
 * An empty query matches everything, so a caller can pass whatever is in the box
 * without branching on it.
 */
export function threadMatchesQuery(
  thread: ConversationThread,
  query: string,
  currentEmail?: string,
): boolean {
  const tokens = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = searchHaystack(thread, currentEmail);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * The conversations that answer to a query.
 *
 * `alwaysInclude` carries the ids the server matched. The server searches the whole
 * mailbox and looks at fields this function cannot see the same way — `bodyPlain` of a
 * message on a page the client never loaded — so a server hit is kept even when the
 * local match fails. Without it, widening the corpus to catch what the server found
 * would then filter those same messages back out.
 */
export function filterThreadsByQuery(
  threads: ConversationThread[] = [],
  query: string = '',
  currentEmail?: string,
  alwaysInclude?: ReadonlySet<string>,
): ConversationThread[] {
  if (!Array.isArray(threads)) return [];
  if (!(query || '').trim()) return threads;

  return threads.filter((thread) => {
    if (alwaysInclude && alwaysInclude.size > 0) {
      if (alwaysInclude.has(thread.id)) return true;
      if (thread.messages.some((m) => alwaysInclude.has(m.id))) return true;
    }
    return threadMatchesQuery(thread, query, currentEmail);
  });
}
