// ============================================================================
// QuantMail — outbound mail transport contract.
//
// A transport takes a PREPARED raw RFC 5322 message plus an explicit SMTP
// envelope (MAIL FROM / RCPT TO) and returns the provider message id. The
// envelope is the only place Bcc recipients exist: the MIME headers never name
// them (MAIL-03/MAIL-06 invariant), and `assertNoBccHeader` enforces it.
//
// Errors are classified so the delivery worker and BullMQ retry behave
// correctly: `transient` (4xx, network, configuration that an operator can fix)
// is retried/deferred, `permanent` (5xx) is a bounce.
// ============================================================================

import { randomUUID } from 'node:crypto';

export type MailErrorKind = 'transient' | 'permanent';

export interface MailTransportErrorOptions {
  kind: MailErrorKind;
  /** Stable machine code, e.g. SMTP_TLS_REQUIRED, SMTP_REJECTED, SMTP_NETWORK. */
  code: string;
  transport: string;
  /** SMTP reply code when the provider returned one. */
  smtpCode?: number;
  cause?: unknown;
}

export class MailTransportError extends Error {
  readonly kind: MailErrorKind;
  readonly code: string;
  readonly transport: string;
  readonly smtpCode?: number;

  constructor(message: string, opts: MailTransportErrorOptions) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'MailTransportError';
    this.kind = opts.kind;
    this.code = opts.code;
    this.transport = opts.transport;
    this.smtpCode = opts.smtpCode;
  }
}

/** True only for a classified permanent failure (a bounce, never retried). */
export function isPermanentMailError(err: unknown): err is MailTransportError {
  return err instanceof MailTransportError && err.kind === 'permanent';
}

export interface MailEnvelope {
  /** Bare return-path address (no display name). */
  from: string;
  /** Every recipient: To + Cc + Bcc, bare addresses. */
  to: string[];
}

export interface RawMailMessage {
  /** Complete RFC 5322 message (headers + body). Must not carry a Bcc header. */
  raw: Buffer;
  envelope: MailEnvelope;
}

export interface MailSendResult {
  /** The Message-ID header value the message was sent with (angle brackets included). */
  messageId: string;
  /** Provider reply line (SMTP) or id (SES), for logs and delivery attempts. */
  response?: string;
  accepted: string[];
  rejected: string[];
}

export interface MailTransport {
  readonly name: 'ses' | 'smtp';
  /** From address used when a caller supplies none (SMTP_FROM_DEFAULT). */
  readonly defaultFrom?: string;
  isConfigured(): boolean;
  sendRaw(message: RawMailMessage): Promise<MailSendResult>;
}

// ---------------------------------------------------------------------------
// Envelope / message helpers
// ---------------------------------------------------------------------------

const ENVELOPE_ADDRESS = /^[^\s<>@,;:"\\]+@[^\s<>@,;:"\\]+$/;

/** `"Name" <a@b.c>` -> `a@b.c`; a bare address passes through. */
export function extractAddress(mailbox: string): string {
  const trimmed = mailbox.trim();
  const m = trimmed.match(/<([^<>]*)>\s*$/);
  return (m ? m[1] : trimmed).trim();
}

export function isValidEnvelopeAddress(address: string): boolean {
  return ENVELOPE_ADDRESS.test(address);
}

export function domainOfAddress(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at >= 0 && at < address.length - 1 ? address.slice(at + 1).toLowerCase() : null;
}

function headerBlock(raw: Buffer): string {
  const end = raw.indexOf('\r\n\r\n');
  return raw.subarray(0, end === -1 ? raw.length : end).toString('latin1');
}

/** Throws a permanent error when the message carries a Bcc header. */
export function assertNoBccHeader(raw: Buffer, transport: string): void {
  if (/^bcc:/im.test(headerBlock(raw))) {
    throw new MailTransportError(
      'Refusing to send: the message carries a Bcc header (Bcc belongs in the envelope only)',
      { kind: 'permanent', code: 'BCC_HEADER_PRESENT', transport },
    );
  }
}

const MESSAGE_ID_HEADER = /^message-id:[ \t]*(?:\r\n[ \t]+)?(<[^<>\r\n]+>)/im;

export function readMessageId(raw: Buffer): string | null {
  const m = headerBlock(raw).match(MESSAGE_ID_HEADER);
  return m ? m[1] : null;
}

/**
 * Return the message with a Message-ID header and that id. An existing header
 * is kept untouched (it may be DKIM-signed); a missing one is prepended.
 */
export function ensureMessageId(
  raw: Buffer,
  domain: string,
): { raw: Buffer; messageId: string } {
  const existing = readMessageId(raw);
  if (existing) return { raw, messageId: existing };
  const messageId = `<${randomUUID()}@${domain}>`;
  return {
    raw: Buffer.concat([Buffer.from(`Message-ID: ${messageId}\r\n`, 'latin1'), raw]),
    messageId,
  };
}

export function validateEnvelope(envelope: MailEnvelope, transport: string): void {
  if (!isValidEnvelopeAddress(envelope.from)) {
    throw new MailTransportError('Invalid envelope sender address', {
      kind: 'permanent',
      code: 'INVALID_ENVELOPE',
      transport,
    });
  }
  if (envelope.to.length === 0 || !envelope.to.every(isValidEnvelopeAddress)) {
    throw new MailTransportError('Missing or invalid envelope recipient address', {
      kind: 'permanent',
      code: 'INVALID_ENVELOPE',
      transport,
    });
  }
}
