// ============================================================================
// IMAP4rev1 Daemon - Protocol Types & State Machine (RFC 3501)
// ============================================================================

export type ImapState = 'NOT_AUTHENTICATED' | 'AUTHENTICATED' | 'SELECTED' | 'LOGOUT';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
}

export interface MailboxItem {
  id: string;
  uid: number;
  seq: number;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  date: Date;
  size: number;
  isRead: boolean;
  isStarred: boolean;
  isDeleted: boolean;
  isDraft: boolean;
  isAnswered: boolean;
  messageId: string;
  inReplyTo?: string | null;
  bodyPlain?: string | null;
  bodyHtml?: string | null;
  rawMime?: string;
}

export interface SelectedFolder {
  id: string;
  name: string;
  type: string;
  uidvalidity: number;
  uidnext: number;
  readOnly: boolean;
  items: MailboxItem[];
}

export interface ParsedCommand {
  tag: string;
  command: string;
  args: string[];
  rawLine: string;
}

export interface ImapSessionState {
  id: string;
  state: ImapState;
  user?: AuthenticatedUser;
  selectedFolder?: SelectedFolder;
  isTls: boolean;
  isIdling: boolean;
  idleTag?: string;
  createdAt: Date;
}
