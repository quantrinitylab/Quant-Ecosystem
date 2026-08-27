/**
 * Offline mailbox snapshots.
 *
 * The inbox previously started every cold load from the network: a spinner, a
 * round trip, then content. With a snapshot on disk the list paints immediately
 * from IndexedDB and the network response reconciles behind it — which is also
 * what makes the app usable on a train.
 *
 * Emails are stored once, by id, and each mailbox view stores only an ordered
 * list of ids. One `patchEmail` therefore updates every view a message appears
 * in, and there is no way for the inbox and a search result to disagree about
 * whether something is starred.
 */

import type { Email } from '../../types';
import { mailDatabase, STORE_EMAILS, STORE_MAILBOXES } from './client';

/** Ordered id list for one mailbox view. */
interface MailboxRecord {
  key: string;
  emailIds: string[];
  updatedAt: number;
}

/**
 * Cap on retained messages. Roughly a few MB of JSON — enough for deep scroll
 * history without competing with QuantDrive for the origin's storage quota.
 */
const MAX_CACHED_EMAILS = 5000;

/**
 * Stable cache key for a mailbox view. Mirrors the React Query key so the two
 * layers can never disagree about which list they are talking about.
 */
export function mailboxKey(options: {
  label?: string;
  category?: string;
  folderType?: string;
} = {}): string {
  return [options.folderType ?? 'INBOX', options.label ?? '', options.category ?? ''].join('|');
}

/**
 * Read a mailbox snapshot. Returns `null` — not `[]` — when nothing is cached,
 * so callers can tell "no cache" apart from "cached and genuinely empty".
 */
export async function readMailbox(key: string): Promise<Email[] | null> {
  const record = await mailDatabase.get<MailboxRecord>(STORE_MAILBOXES, key);
  if (!record || record.emailIds.length === 0) return record ? [] : null;

  const all = await mailDatabase.getAll<Email>(STORE_EMAILS);
  if (all.length === 0) return null;

  const byId = new Map(all.map((email) => [email.id, email]));
  // Preserve server order, and drop ids whose email was evicted.
  const emails = record.emailIds
    .map((id) => byId.get(id))
    .filter((email): email is Email => email !== undefined);

  return emails.length > 0 ? emails : null;
}

/** Persist a mailbox snapshot together with its emails. */
export async function writeMailbox(key: string, emails: Email[]): Promise<void> {
  const record: MailboxRecord = {
    key,
    emailIds: emails.map((email) => email.id),
    updatedAt: Date.now(),
  };
  await Promise.all([
    mailDatabase.putMany(STORE_EMAILS, emails),
    mailDatabase.put(STORE_MAILBOXES, record),
  ]);
  void evictOverflow();
}

/**
 * Apply a partial update to one cached email. Silently does nothing when the
 * message is not cached — the caller's optimistic React Query update is
 * authoritative for the current session either way.
 */
export async function patchEmail(id: string, patch: Partial<Email>): Promise<void> {
  const existing = await mailDatabase.get<Email>(STORE_EMAILS, id);
  if (!existing) return;
  await mailDatabase.put(STORE_EMAILS, { ...existing, ...patch });
}

/** Remove an email from one mailbox's ordering without deleting the message. */
export async function removeFromMailbox(key: string, id: string): Promise<void> {
  const record = await mailDatabase.get<MailboxRecord>(STORE_MAILBOXES, key);
  if (!record) return;
  const emailIds = record.emailIds.filter((entry) => entry !== id);
  if (emailIds.length === record.emailIds.length) return;
  await mailDatabase.put(STORE_MAILBOXES, { ...record, emailIds, updatedAt: Date.now() });
}

/** Drop everything. Called on sign-out so cached mail never outlives a session. */
export async function clearMailCache(): Promise<void> {
  await Promise.all([
    mailDatabase.clear(STORE_EMAILS),
    mailDatabase.clear(STORE_MAILBOXES),
  ]);
}

/**
 * Trim the email store back under {@link MAX_CACHED_EMAILS}, discarding the
 * oldest messages that no mailbox snapshot still references.
 */
async function evictOverflow(): Promise<void> {
  const all = await mailDatabase.getAll<Email>(STORE_EMAILS);
  if (all.length <= MAX_CACHED_EMAILS) return;

  const mailboxes = await mailDatabase.getAll<MailboxRecord>(STORE_MAILBOXES);
  const referenced = new Set<string>();
  for (const mailbox of mailboxes) {
    for (const id of mailbox.emailIds) referenced.add(id);
  }

  const evictable = all
    .filter((email) => !referenced.has(email.id))
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  let toRemove = all.length - MAX_CACHED_EMAILS;
  for (const email of evictable) {
    if (toRemove <= 0) break;
    await mailDatabase.delete(STORE_EMAILS, email.id);
    toRemove -= 1;
  }
}
