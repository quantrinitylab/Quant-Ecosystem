/**
 * QuantMail Open-Source Mail Engine Abstraction Interface.
 *
 * Provides a unified adapter contract across:
 * - Stalwart Mail Server (Rust JMAP RFC 8620/8621, REST principal provisioning, SMTP submission)
 * - AWS SES (Cloud transactional/marketing MTA)
 * - Authenticated SMTP Relay (RFC 6409 submission via NetSmtpTransport)
 */

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer | Uint8Array;
}

export interface OutboundMailPayload {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[] | string;
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
  emailId?: string;
}

export interface TransactionalMailPayload {
  to: string | string[];
  from?: string;
  fromName?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  attachments?: MailAttachment[];
  headers?: Record<string, string>;
  messageId?: string;
}

export interface RecipientReceipt {
  recipient: string;
  status: 'accepted' | 'sent' | 'deferred' | 'bounced' | 'failed';
  smtpResponse?: string;
}

export interface DeliveryReceipt {
  messageId: string;
  emailId?: string;
  deliveryStatus: 'accepted' | 'sent' | 'deferred' | 'bounced' | 'failed' | 'draft';
  recipients: RecipientReceipt[];
  rawResponse?: unknown;
}

export interface MailboxAccount {
  email: string;
  name?: string;
  secret?: string;
  quota?: number; // Quota in bytes
  roles?: string[];
  type?: 'individual' | 'group' | string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MailEnginePingResult {
  ok: boolean;
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface IMailEngineAdapter {
  readonly name: string;
  send(payload: OutboundMailPayload): Promise<DeliveryReceipt>;
  sendTransactional(payload: TransactionalMailPayload): Promise<DeliveryReceipt>;
  provisionMailbox(account: MailboxAccount): Promise<{ success: boolean; principalId?: string; error?: string }>;
  ping(): Promise<MailEnginePingResult>;
}
