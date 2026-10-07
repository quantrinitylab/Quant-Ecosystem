/**
 * SQLite FTS5 Search Indexer Types
 */

import type { Email } from '../../types';

export interface EmailItem {
  id: string;
  threadId: string;
  subject: string;
  snippet?: string;
  bodyText?: string;
  body?: string;
  fromAddress?: string;
  from?: string | { email: string; name?: string };
  toAddress?: string;
  to?: string | string[] | Array<{ email: string; name?: string }>;
  receivedAt?: string | number | Date;
  date?: string | number | Date;
}

export type EmailInputItem = EmailItem | Email;

export interface Fts5SearchResult {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  matchSnippet: string;
  rank: number;
  fromAddress?: string;
  toAddress?: string;
  receivedAt?: string;
  bodyText?: string;
}

export interface Fts5SearchOptions {
  limit?: number;
  offset?: number;
  prefixFallback?: boolean;
}

export interface Fts5SearchResponse {
  results: Fts5SearchResult[];
  totalCount: number;
  durationMs: number;
  query: string;
  usedFallback: boolean;
}

/**
 * Normalizes any Email or EmailItem variant into standard FTS5 indexed document record
 */
export function normalizeEmailItem(item: EmailItem | Email): {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  bodyText: string;
  fromAddress: string;
  toAddress: string;
  receivedAt: string;
} {
  const id = String(item.id || '');
  const threadId = String(item.threadId || item.id || '');
  const subject = String(item.subject || '');
  const snippet = String(item.snippet || '');
  const raw = item as any;
  const bodyText = String(item.bodyText || raw.body || snippet || '');

  let fromAddress = '';
  if (typeof raw.fromAddress === 'string') {
    fromAddress = raw.fromAddress;
  } else if (typeof raw.from === 'string') {
    fromAddress = raw.from;
  } else if (raw.from && typeof raw.from === 'object') {
    fromAddress = raw.from.email || raw.from.name || '';
  }

  let toAddress = '';
  if (typeof raw.toAddress === 'string') {
    toAddress = raw.toAddress;
  } else if (typeof raw.to === 'string') {
    toAddress = raw.to;
  } else if (Array.isArray(raw.to)) {
    toAddress = raw.to
      .map((entry: any) => (typeof entry === 'string' ? entry : entry.email || entry.name || ''))
      .filter(Boolean)
      .join(', ');
  }

  let receivedAt = '';
  if (raw.receivedAt) {
    receivedAt =
      raw.receivedAt instanceof Date ? raw.receivedAt.toISOString() : String(raw.receivedAt);
  } else if (raw.date) {
    receivedAt = raw.date instanceof Date ? raw.date.toISOString() : String(raw.date);
  } else {
    receivedAt = new Date().toISOString();
  }

  return {
    id,
    threadId,
    subject,
    snippet,
    bodyText,
    fromAddress,
    toAddress,
    receivedAt,
  };
}
