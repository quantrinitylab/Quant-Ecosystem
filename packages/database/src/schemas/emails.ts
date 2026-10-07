// ============================================================================
// Database Schema - Emails (QuantMail)
// ============================================================================

/** Email message schema */
export interface EmailSchema {
  id: string;
  userId: string;
  threadId: string;
  folderId: string;
  fromAddress: string;
  fromName: string;
  toAddresses: EmailRecipient[];
  ccAddresses: EmailRecipient[];
  bccAddresses: EmailRecipient[];
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isDraft: boolean;
  isSent: boolean;
  isSpam: boolean;
  isTrash: boolean;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  labels: string[];
  inReplyTo: string | null;
  references: string[];
  priority: 'high' | 'normal' | 'low';
  aiSummary: string | null;
  aiCategory: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Email recipient */
export interface EmailRecipient {
  address: string;
  name: string | null;
}

/** Email attachment */
export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  contentId: string | null;
  isInline: boolean;
}

/** Email thread (conversation) */
export interface EmailThreadSchema {
  id: string;
  userId: string;
  subject: string;
  participantAddresses: string[];
  messageCount: number;
  unreadCount: number;
  lastMessageAt: string;
  snippet: string;
  isStarred: boolean;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

/** Email folder */
export interface EmailFolderSchema {
  id: string;
  userId: string;
  name: string;
  type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom';
  parentId: string | null;
  color: string | null;
  icon: string | null;
  unreadCount: number;
  totalCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Email filter/rule */
export interface EmailFilterSchema {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  conditions: EmailFilterCondition[];
  actions: EmailFilterAction[];
  priority: number;
  createdAt: string;
  updatedAt: string;
}

/** Email filter condition */
export interface EmailFilterCondition {
  field: 'from' | 'to' | 'subject' | 'body' | 'has_attachment';
  operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  value: string;
}

/** Email filter action */
export interface EmailFilterAction {
  type: 'move_to_folder' | 'add_label' | 'mark_read' | 'star' | 'archive' | 'delete' | 'forward';
  value: string;
}

/** Email signature */
export interface EmailSignatureSchema {
  id: string;
  userId: string;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** OAuth2 client registration for QuantMail as provider */
export interface OAuthClientSchema {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
  description: string;
  logoUrl: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** OAuth2 authorization code */
export interface OAuthAuthorizationCodeSchema {
  id: string;
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export const EMAILS_TABLE = {
  tableName: 'emails',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'user_id', type: 'UUID', nullable: false, references: 'users(id)' },
    { name: 'thread_id', type: 'UUID', nullable: false, references: 'email_threads(id)' },
    { name: 'folder_id', type: 'UUID', nullable: false, references: 'email_folders(id)' },
    { name: 'from_address', type: 'VARCHAR(254)', nullable: false },
    { name: 'from_name', type: 'VARCHAR(100)', nullable: false },
    { name: 'to_addresses', type: 'JSONB', nullable: false },
    { name: 'cc_addresses', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'bcc_addresses', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'subject', type: 'TEXT', nullable: false },
    { name: 'body_html', type: 'TEXT', nullable: false },
    { name: 'body_plain', type: 'TEXT', nullable: false },
    { name: 'snippet', type: 'VARCHAR(200)', nullable: false },
    { name: 'is_read', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'is_starred', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'is_important', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'is_draft', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'has_attachments', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'attachments', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'labels', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'priority', type: "VARCHAR(10) DEFAULT 'normal'", nullable: false },
    { name: 'ai_summary', type: 'TEXT', nullable: true },
    { name: 'ai_category', type: 'VARCHAR(50)', nullable: true },
    { name: 'received_at', type: 'TIMESTAMPTZ', nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'deleted_at', type: 'TIMESTAMPTZ', nullable: true },
  ],
  indexes: [
    { name: 'idx_emails_user_folder', columns: ['user_id', 'folder_id'] },
    { name: 'idx_emails_thread', columns: ['thread_id'] },
    { name: 'idx_emails_received', columns: ['received_at'] },
    { name: 'idx_emails_from', columns: ['from_address'] },
  ],
} as const;
