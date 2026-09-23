/**
 * External Content FTS5 Schema Definition & Migration Engine
 *
 * Uses SQLite FTS5 external content tables to decouple raw email storage
 * from the inverted index, maximizing cache locality and minimizing write overhead.
 */

export interface EmailRecord {
  id: string;
  thread_id: string;
  sender: string;
  recipient: string;
  subject: string;
  snippet: string;
  date: number; // Unix timestamp in ms
  folder: string;
  read: number; // 0 or 1
  starred: number; // 0 or 1
}

export const EMAIL_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT NOT NULL,
  date INTEGER NOT NULL,
  folder TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder, date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
`;

export const FTS5_TABLE_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
  subject,
  snippet,
  sender,
  recipient,
  content='emails',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2 prefix "2 3 4"'
);
`;

export const FTS5_TRIGGERS_DDL = `
CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts(rowid, subject, snippet, sender, recipient)
  VALUES (new.rowid, new.subject, new.snippet, new.sender, new.recipient);
END;

CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, snippet, sender, recipient)
  VALUES('delete', old.rowid, old.subject, old.snippet, old.sender, old.recipient);
END;

CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, snippet, sender, recipient)
  VALUES('delete', old.rowid, old.subject, old.snippet, old.sender, old.recipient);
  INSERT INTO emails_fts(rowid, subject, snippet, sender, recipient)
  VALUES (new.rowid, new.subject, new.snippet, new.sender, new.recipient);
END;
`;

export const FTS5_OPTIMIZE_SQL = `INSERT INTO emails_fts(emails_fts) VALUES('optimize');`;
export const FTS5_REBUILD_SQL = `INSERT INTO emails_fts(emails_fts) VALUES('rebuild');`;

export interface SQLiteDbInterface {
  exec(sql: string, params?: unknown[]): void | unknown[];
}

/**
 * Initializes the full email schema and FTS5 external content triggers.
 */
export function initFtsSchema(db: SQLiteDbInterface): void {
  db.exec(EMAIL_TABLE_DDL);
  db.exec(FTS5_TABLE_DDL);
  db.exec(FTS5_TRIGGERS_DDL);
}
