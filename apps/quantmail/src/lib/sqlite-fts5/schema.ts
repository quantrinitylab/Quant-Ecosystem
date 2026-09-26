/**
 * SQLite FTS5 Schema & SQL Constants for QuantMail Local-First Search (Task M15)
 *
 * Implements the canonical Superhuman-class SQLite FTS5 virtual table schema:
 * CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
 *   id UNINDEXED,
 *   threadId UNINDEXED,
 *   subject,
 *   snippet,
 *   bodyText,
 *   fromAddress,
 *   toAddress,
 *   receivedAt UNINDEXED,
 *   tokenize='porter unicode61'
 * );
 */

export const FTS5_TABLE_NAME = 'emails_fts';

export const FTS5_SCHEMA_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
  id UNINDEXED,
  threadId UNINDEXED,
  subject,
  snippet,
  bodyText,
  fromAddress,
  toAddress,
  receivedAt UNINDEXED,
  tokenize='porter unicode61'
);
`.trim();

export const FTS5_INSERT_OR_REPLACE_SQL = `
INSERT OR REPLACE INTO emails_fts(
  id,
  threadId,
  subject,
  snippet,
  bodyText,
  fromAddress,
  toAddress,
  receivedAt
) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`.trim();

export const FTS5_SEARCH_SQL = `
SELECT 
  id, 
  threadId, 
  subject, 
  snippet, 
  snippet(emails_fts, 2, '<mark>', '</mark>', '...', 12) as matchSnippet, 
  bm25(emails_fts) as rank 
FROM emails_fts 
WHERE emails_fts MATCH ? 
ORDER BY rank 
LIMIT ? OFFSET ?;
`.trim();

export const FTS5_DEFAULT_LIMIT = 50;
export const FTS5_DEFAULT_OFFSET = 0;
export const FTS5_SNIPPET_MAX_TOKENS = 12;

export const FTS5_FIELD_WEIGHTS = {
  subject: 10.0,
  snippet: 5.0,
  bodyText: 3.0,
  fromAddress: 2.0,
  toAddress: 1.0,
};
