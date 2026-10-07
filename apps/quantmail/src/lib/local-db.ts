/**
 * QuantMail Local Database & Superhuman SQLite FTS5 Search Facade
 * Task M15 / Gate 3 Parity
 */

import { isIndexedDbAvailable } from './offline/database';
import {
  mailDatabase,
  DATABASE_NAME,
  SCHEMA_VERSION,
  STORE_EMAILS,
  STORE_MAILBOXES,
  STORE_OUTBOX,
  STORE_DRAFTS,
} from './offline/client';
import { SqliteFts5Indexer, getFts5Indexer } from './sqlite-fts5';
import type { EmailItem, Fts5SearchResult, Fts5SearchOptions } from './sqlite-fts5';

export {
  mailDatabase,
  isIndexedDbAvailable,
  DATABASE_NAME,
  SCHEMA_VERSION,
  STORE_EMAILS,
  STORE_MAILBOXES,
  STORE_OUTBOX,
  STORE_DRAFTS,
  SqliteFts5Indexer,
  getFts5Indexer,
};

export type { EmailItem, Fts5SearchResult, Fts5SearchOptions };

/**
 * Synchronous / instant search wrapper using local SQLite FTS5 indexer.
 */
export function searchLocalEmails(query: string, options?: Fts5SearchOptions): Fts5SearchResult[] {
  return getFts5Indexer().search(query, options);
}

/**
 * Indexes a batch of emails into the local SQLite FTS5 index.
 */
export function indexLocalEmails(emails: EmailItem[]): void {
  getFts5Indexer().indexEmails(emails);
}
