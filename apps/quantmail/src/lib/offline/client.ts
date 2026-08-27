/**
 * The shared QuantMail offline database.
 *
 * Three stores, one connection:
 *
 * - `emails`    every email the client has seen, keyed by id. Deduplicated, so a
 *               message appearing in both the inbox and a search result is
 *               patched once.
 * - `mailboxes` an ordered list of email ids per mailbox view, keyed by the same
 *               string used for the React Query key. This is what makes a cold
 *               start on a dead connection show real mail instead of a spinner.
 * - `outbox`    mutations the user performed that the server has not yet
 *               acknowledged.
 *
 * Bumping `SCHEMA_VERSION` runs `onupgradeneeded`; stores and indexes are created
 * idempotently, so adding one is additive and needs no migration code.
 */

import { Database } from './database';

export const DATABASE_NAME = 'quantmail-offline';
export const SCHEMA_VERSION = 1;

export const STORE_EMAILS = 'emails';
export const STORE_MAILBOXES = 'mailboxes';
export const STORE_OUTBOX = 'outbox';

export const mailDatabase = new Database(DATABASE_NAME, SCHEMA_VERSION, [
  { name: STORE_EMAILS, keyPath: 'id' },
  { name: STORE_MAILBOXES, keyPath: 'key' },
  {
    name: STORE_OUTBOX,
    keyPath: 'id',
    indexes: [{ name: 'byCreatedAt', keyPath: 'createdAt' }],
  },
]);

/** Collision-resistant id that works without `crypto.randomUUID`. */
export function createId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the counter-based form below.
  }
  fallbackCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

let fallbackCounter = 0;
