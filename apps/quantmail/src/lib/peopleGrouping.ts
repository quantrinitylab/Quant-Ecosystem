/**
 * People-view grouping: a flat list of messages becomes one row per person.
 *
 * This is the data layer behind the unified "email with chat" People view: where
 * `lib/threading` groups by *counterparty set* (a 1:1 and a group with Alice are
 * two rows), this groups by *primary other person*, so every message to or from
 * Alice — letters and chat lines, 1:1 or group — lands in Alice's row. The row's
 * `world` then says which of the three views it belongs to: `log` (1-to-1),
 * `groups` (2+ other participants), or `updates` (machine mail).
 *
 * Grouping rules (the contract sibling views code against):
 * - For each email, compute the "other party": when the message is from the
 *   signed-in user (`isFromMe` from `lib/threading`), the other party is the
 *   first `to` address that is not the user's own (`cc` only as a fallback for
 *   degenerate messages with no `to`); otherwise it is the `from` address.
 * - Group by the normalized (lowercased) other-party email. A group message is
 *   keyed by its primary other party; `participantEmails` keeps everyone else
 *   for group avatars, and `world` flips to `groups` when there is more than
 *   one distinct other participant.
 * - Note-to-self (every address on the message is the user's own, or the
 *   self-send shape of sender-equals-every-recipient) → `personKey` `'self'`.
 * - Drafts (`isDraft`) are not conversations and are excluded from grouping.
 * - `messages` are chronological ascending with send/delivery duplicates
 *   collapsed (see below); the returned conversations sort by `lastActivityAt`
 *   descending.
 * - `unreadCount` is the real count of messages that are unread AND not from
 *   the user — 0 when there are none, never invented.
 *
 * World classification, documented because it is deliberately narrow:
 * - `updates` when the latest message's declared category is `promotions` or
 *   `updates` (`aiCategory` first, then `category`, mirroring threading's
 *   precedence), OR the sender's local part starts with noreply / no-reply /
 *   newsletter / donotreply. It does NOT run the heuristic classifier: a row
 *   claiming "Updates" must be grounded in what the message declares or an
 *   obviously machine address, not in a guess about its content.
 * - `groups` when the conversation has more than one distinct other
 *   participant; otherwise `log`.
 *
 * A plain `.ts` module: `tsconfig.backend.json` typechecks `src/**\/*.ts` with no
 * `jsx` option, so nothing here may import a `.tsx` file.
 */

import type { Email, EmailAddress } from '../types';
import { isFromMe, messageKindOf, normalizeSubject, sanitizeSnippetText } from './threading';

/** Which of the three People-view worlds a conversation belongs to. */
export type ConversationWorld = 'log' | 'groups' | 'updates';

export interface PersonConversation {
  /** Normalized other-person email (lowercase), or `'self'` for note-to-self. */
  personKey: string;
  /** The other person's display name (`EmailAddress.name`, falling back to the email handle); `'You'` for note-to-self. */
  name: string;
  /** The other person's email (the user's own email when `'self'`). */
  email: string;
  /** Chronological ASCENDING, both directions, send/delivery duplicates collapsed. */
  messages: Email[];
  lastMessage: Email;
  lastActivityAt: Date;
  /** REAL count: messages unread && !fromMe. 0 when none. Never invented. */
  unreadCount: number;
  lastMessageFromMe: boolean;
  world: ConversationWorld;
  /** Distinct other participants (addresses, lowercase) — for group avatars. */
  participantEmails: string[];
}

const SELF_KEY = 'self';

/** Trim + lowercase; the canonical form of an address used as a key. */
function normalizeAddress(address?: string | null): string {
  return (address || '').trim().toLowerCase();
}

/**
 * Whether an address belongs to the signed-in user.
 *
 * Mirrors the private `isMyAddress` in `lib/threading` (exact match plus the
 * `handle@` prefix alias rule), which this file may not import. Kept in sync
 * with it so "not mine" here means the same thing `isFromMe` means there.
 */
function isOwnAddress(address?: string | null, currentEmail?: string): boolean {
  const addr = normalizeAddress(address);
  const mine = normalizeAddress(currentEmail);
  if (!addr || !mine) return false;
  if (addr === mine) return true;
  const handle = mine.split('@')[0];
  return Boolean(handle && addr.startsWith(`${handle}@`));
}

/**
 * The addresses a message was written to, from whichever shape it arrived in.
 *
 * Mirrors the private `recipientsOf` in `lib/threading`: both the structured
 * `to`/`cc` arrays and the flat `toAddresses`/`ccAddresses` spellings, because
 * a message rehydrated from IndexedDB or built optimistically may carry only
 * one of them.
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
 * The normalized addresses of one recipient field, `to` before `cc`, structured
 * entries before the flat `toAddresses`/`ccAddresses` spellings.
 */
function addressesOfField(email: Email, field: 'to' | 'cc'): string[] {
  const out: string[] = [];
  const push = (raw: unknown) => {
    const addr = normalizeAddress(typeof raw === 'string' ? raw : (raw as EmailAddress)?.email);
    if (addr) out.push(addr);
  };
  const structured = email[field];
  if (Array.isArray(structured)) for (const entry of structured) push(entry);
  const flat = (email as unknown as Record<string, unknown>)[`${field}Addresses`];
  if (Array.isArray(flat)) for (const entry of flat) push(entry);
  return out;
}

/**
 * The self-send shape: the sender's address is also every recipient's.
 *
 * Identifies a note to self even when nobody told us who the user is
 * (`currentEmail` unknown), exactly like `noteToSelfAddress` in threading —
 * but here it keys the whole conversation `'self'` rather than by subject,
 * because the People view keeps one row per person and you are one person.
 */
function isSelfSendShape(email: Email): boolean {
  const from = normalizeAddress(email.from?.email);
  if (!from) return false;
  const recipientAddrs = recipientsOf(email)
    .map((r) => normalizeAddress(r.email))
    .filter(Boolean);
  return recipientAddrs.length > 0 && recipientAddrs.every((addr) => addr === from);
}

/**
 * The key that decides which person-row a message belongs to: the other party.
 *
 * Outbound → the first `to` address that is not the user's own (`cc` only as a
 * fallback for degenerate messages with no `to`). Inbound → the sender, unless
 * the sender is the user or missing, in which case whoever else is on the
 * message. Anything with nobody else on it is a note to self.
 */
function otherPartyKey(email: Email, currentUserEmail: string): string {
  if (isSelfSendShape(email)) return SELF_KEY;

  if (isFromMe(email, currentUserEmail)) {
    for (const addr of [...addressesOfField(email, 'to'), ...addressesOfField(email, 'cc')]) {
      if (addr.includes('@') && !isOwnAddress(addr, currentUserEmail)) return addr;
    }
    return SELF_KEY;
  }

  const fromAddr = normalizeAddress(email.from?.email);
  if (fromAddr && fromAddr.includes('@') && !isOwnAddress(fromAddr, currentUserEmail)) {
    return fromAddr;
  }
  for (const recipient of recipientsOf(email)) {
    const addr = normalizeAddress(recipient.email);
    if (addr && addr.includes('@') && !isOwnAddress(addr, currentUserEmail)) return addr;
  }
  return SELF_KEY;
}

/** Comparable timestamp for ordering; undated messages sort as the oldest. */
function messageTime(email: Email): number {
  return new Date(email.receivedAt || email.createdAt || 0).getTime();
}

/**
 * How far apart two copies of one send may be timestamped and still be
 * recognised as the same message. Mirrors `DUPLICATE_WINDOW_MS` in threading:
 * the pair is written by two statements in the same request, so the real gap is
 * milliseconds; the allowance is generous because the two rows take their time
 * from different clocks.
 */
const DUPLICATE_WINDOW_MS = 120_000;

/**
 * Whether two messages in the same conversation are one message stored twice.
 *
 * Mirrored from the private `isSameSend` in `lib/threading`, which this file may
 * not import. The test is deliberately narrow — disagreeing on `isSent` is
 * required, so two genuinely similar messages are never folded together. If
 * threading's version changes, this copy must be updated to match.
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
  return Math.abs(messageTime(a) - messageTime(b)) <= DUPLICATE_WINDOW_MS;
}

/**
 * Collapse each send/delivery pair into the one message it is.
 *
 * Mirrored from the private `collapseDuplicateSends` in `lib/threading`, which
 * this file may not import: sending writes two rows (the Sent copy and the
 * delivered copy), and without the fold a two-message conversation counts four
 * and reads as unread forever. The survivor is the earlier copy and inherits
 * the union of the flags plus the loser's id in `collapsedIds`, exactly as in
 * threading. `messages` must already be sorted oldest-first.
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
      isPinned:
        Boolean((twin as { isPinned?: boolean }).isPinned) ||
        Boolean((message as { isPinned?: boolean }).isPinned),
      snippet: twin.snippet || message.snippet,
      threadId: twin.threadId || message.threadId,
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
 * Every address in a conversation that is not the signed-in user's, in the order
 * each first appears. Senders and recipients, from every message — a group
 * conversation is with everyone on it. Name-only identities are dropped by the
 * `@` test: these are addresses, for avatar seeding and world classification.
 */
function otherParticipants(messages: Email[], currentUserEmail: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (address?: string | null) => {
    const addr = normalizeAddress(address);
    if (!addr || !addr.includes('@') || isOwnAddress(addr, currentUserEmail)) return;
    if (seen.has(addr)) return;
    seen.add(addr);
    out.push(addr);
  };
  for (const message of messages) {
    add(message.from?.email);
    for (const recipient of recipientsOf(message)) add(recipient.email);
  }
  return out;
}

/**
 * The name on the row: the `EmailAddress.name` the person actually uses, falling
 * back to the email handle. The sender's own signature wins (it is the name they
 * chose); a name attached to any recipient copy is the fallback. `'You'` for
 * note-to-self — the only case where the row is about the reader.
 */
function displayNameFor(
  personKey: string,
  messages: Email[],
  currentUserEmail: string,
): string {
  if (personKey === SELF_KEY) return 'You';
  for (const message of messages) {
    if (!isFromMe(message, currentUserEmail) && normalizeAddress(message.from?.email) === personKey) {
      const name = (message.from?.name || '').trim();
      if (name) return name;
    }
  }
  for (const message of messages) {
    for (const recipient of recipientsOf(message)) {
      if (normalizeAddress(recipient.email) === personKey) {
        const name = (recipient.name || '').trim();
        if (name) return name;
      }
    }
  }
  return personKey.split('@')[0] || personKey;
}

/**
 * Which world a conversation belongs to — see the module doc for why the
 * `updates` test is deliberately narrow (declared category or an obviously
 * machine sender, never a content guess).
 */
function classifyWorld(lastMessage: Email, participantEmails: string[]): ConversationWorld {
  const declared =
    lastMessage.aiCategory && lastMessage.aiCategory !== 'primary'
      ? lastMessage.aiCategory
      : lastMessage.category;
  if (declared === 'promotions' || declared === 'updates') return 'updates';
  const local = normalizeAddress(lastMessage.from?.email).split('@')[0] || '';
  if (/^(noreply|no-reply|donotreply|do-not-reply|newsletter)/i.test(local)) return 'updates';
  return participantEmails.length > 1 ? 'groups' : 'log';
}

/**
 * Group a flat message list into one conversation per person, newest
 * conversation first. Drafts are excluded: they are not conversations.
 */
export function groupEmailsByPerson(
  emails: Email[],
  currentUserEmail: string,
): PersonConversation[] {
  if (!Array.isArray(emails) || emails.length === 0) return [];

  const buckets = new Map<string, Email[]>();
  for (const email of emails) {
    if (!email || email.isDraft) continue;
    const key = otherPartyKey(email, currentUserEmail);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(email);
    else buckets.set(key, [email]);
  }

  const conversations: PersonConversation[] = [];
  for (const [personKey, bucket] of buckets) {
    bucket.sort((a, b) => messageTime(a) - messageTime(b));
    const messages = collapseDuplicateSends(bucket);
    const lastMessage = messages[messages.length - 1];
    const participantEmails = otherParticipants(messages, currentUserEmail);
    const lastMessageFromMe = isFromMe(lastMessage, currentUserEmail);
    conversations.push({
      personKey,
      name: displayNameFor(personKey, messages, currentUserEmail),
      email: personKey === SELF_KEY ? normalizeAddress(currentUserEmail) : personKey,
      messages,
      lastMessage,
      lastActivityAt: new Date(messageTime(lastMessage)),
      unreadCount: messages.filter((m) => !m.isRead && !isFromMe(m, currentUserEmail)).length,
      lastMessageFromMe,
      world: classifyWorld(lastMessage, participantEmails),
      participantEmails,
    });
  }

  conversations.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  return conversations;
}

const SNIPPET_CHARS = 80;

/**
 * The one-line preview for a person row: `You: <snippet>` when the latest
 * message is the reader's own, otherwise the snippet. The snippet is the last
 * message's snippet, repaired (mojibake/markup stripped) and trimmed to ~80
 * characters.
 */
export function personSnippet(c: PersonConversation): string {
  const clean = sanitizeSnippetText(c.lastMessage.snippet || '');
  const snippet = clean.length > SNIPPET_CHARS ? clean.slice(0, SNIPPET_CHARS).trimEnd() : clean;
  return c.lastMessageFromMe ? `You: ${snippet}` : snippet;
}
