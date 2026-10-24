// ============================================================================
// QuantMail — outbound mail transport selection.
//
//   MAIL_TRANSPORT=ses   (default) AWS SES v2, behaviour unchanged
//   MAIL_TRANSPORT=smtp  SMTP submission relay (lib/smtp-sender.ts)
//
// Call sites use `sendMail` / `isMailTransportConfigured` instead of talking
// to a provider directly. With the default (ses) `sendMail` is exactly
// `sendViaSes`, so nothing changes until MAIL_TRANSPORT is set.
//
// DKIM: SES and managed SMTP relays sign DKIM themselves, so this layer never
// signs. The delivery worker's own DKIM signer is only used for the direct-MX
// fallback, or for the SMTP relay when SMTP_DKIM_SIGN=true is set explicitly.
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  buildRawMimeMessage,
  isSesConfigured,
  sendRawViaSes,
  sendViaSes,
  type SesSendOptions,
} from './ses-sender';
import {
  SmtpMailTransport,
  isSmtpConfigured,
  isSmtpDkimSignEnabled,
  readSmtpConfig,
} from './smtp-sender';
import {
  MailTransportError,
  assertNoBccHeader,
  domainOfAddress,
  extractAddress,
  isValidEnvelopeAddress,
  type MailSendResult,
  type MailTransport,
  type RawMailMessage,
} from './mail-transport-types';

export * from './mail-transport-types';

/** Same shape the SES sender takes, plus an optional stable Message-ID. */
export interface MailSendOptions extends SesSendOptions {
  /** RFC 5322 Message-ID (with angle brackets). Generated when omitted (SMTP only). */
  messageId?: string;
}

// ---------------------------------------------------------------------------
// SES implementation (behaviour unchanged)
// ---------------------------------------------------------------------------

/** SES error names that are retryable even though they arrive as 4xx/5xx. */
const SES_TRANSIENT_NAMES = new Set([
  'ThrottlingException',
  'Throttling',
  'TooManyRequestsException',
  'ServiceUnavailable',
  'InternalFailure',
  'RequestTimeout',
  'TimeoutError',
]);

export function classifySesError(err: unknown): MailTransportError {
  if (err instanceof MailTransportError) return err;
  const e = (err && typeof err === 'object' ? err : {}) as {
    name?: string;
    message?: string;
    statusCode?: number;
    $metadata?: { httpStatusCode?: number };
  };
  const status = e.$metadata?.httpStatusCode ?? e.statusCode;
  const message = String(e.message ?? 'SES error').slice(0, 300);
  // 401/403 are credential or account problems an operator fixes: keep the mail.
  const credentialProblem = status === 401 || status === 403;
  const permanent =
    !credentialProblem &&
    !SES_TRANSIENT_NAMES.has(e.name ?? '') &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429;
  return new MailTransportError(`SES error: ${message}`, {
    kind: permanent ? 'permanent' : 'transient',
    code: permanent ? 'SES_REJECTED' : 'SES_ERROR',
    transport: 'ses',
    cause: err,
  });
}

class SesMailTransport implements MailTransport {
  readonly name = 'ses' as const;

  isConfigured(): boolean {
    return isSesConfigured();
  }

  async sendRaw(message: RawMailMessage): Promise<MailSendResult> {
    assertNoBccHeader(message.raw, this.name);
    try {
      const id = await sendRawViaSes(message.raw, message.envelope);
      return { messageId: id, response: id, accepted: [...message.envelope.to], rejected: [] };
    } catch (err) {
      throw classifySesError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type MailTransportName = 'ses' | 'smtp';

let warnedUnknownTransport = false;

export function resolveMailTransportName(): MailTransportName {
  const raw = (process.env['MAIL_TRANSPORT'] ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'ses') return 'ses';
  if (raw === 'smtp') return 'smtp';
  if (!warnedUnknownTransport) {
    warnedUnknownTransport = true;
    // eslint-disable-next-line no-console
    console.warn(`[mail-transport] Unknown MAIL_TRANSPORT "${raw}"; using ses`);
  }
  return 'ses';
}

const sesTransport = new SesMailTransport();
let smtpCache: { key: string; transport: SmtpMailTransport } | null = null;

export function getMailTransport(): MailTransport {
  if (resolveMailTransportName() === 'ses') return sesTransport;
  const config = readSmtpConfig();
  if (!config) {
    throw new MailTransportError('MAIL_TRANSPORT=smtp but SMTP_HOST is not set', {
      kind: 'transient',
      code: 'SMTP_NOT_CONFIGURED',
      transport: 'smtp',
    });
  }
  const key = JSON.stringify(config);
  if (!smtpCache || smtpCache.key !== key) {
    smtpCache?.transport.close();
    smtpCache = { key, transport: new SmtpMailTransport(config) };
  }
  return smtpCache.transport;
}

/** Close pooled SMTP connections (graceful shutdown, tests). */
export function closeMailTransport(): void {
  smtpCache?.transport.close();
  smtpCache = null;
}

/** True when the worker must DKIM-sign itself and hand the signed message to the SMTP relay. */
export function isRelayDkimSigningEnabled(): boolean {
  return resolveMailTransportName() === 'smtp' && isSmtpDkimSignEnabled();
}

/** True when the selected transport has what it needs to send. */
export function isMailTransportConfigured(): boolean {
  return resolveMailTransportName() === 'smtp' ? isSmtpConfigured() : isSesConfigured();
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function envelopeRecipients(opts: SesSendOptions): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const mailbox of [...opts.to, ...(opts.cc ?? []), ...(opts.bcc ?? [])]) {
    const address = extractAddress(mailbox);
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}

/**
 * Build the raw MIME plus explicit envelope for a structured send. Bcc
 * recipients go into the envelope only; `buildRawMimeMessage` never renders a
 * Bcc header and `assertNoBccHeader` double-checks the result.
 */
export function prepareRawMessage(opts: MailSendOptions, fallbackFrom?: string): RawMailMessage {
  const from = opts.from?.trim() || fallbackFrom?.trim() || '';
  const envelopeFrom = extractAddress(from);
  if (!isValidEnvelopeAddress(envelopeFrom)) {
    throw new MailTransportError('Invalid or missing sender address', {
      kind: 'permanent',
      code: 'INVALID_ENVELOPE',
      transport: 'smtp',
    });
  }
  const messageId =
    opts.messageId ?? `<${randomUUID()}@${domainOfAddress(envelopeFrom) ?? 'localhost'}>`;
  const raw = buildRawMimeMessage({
    from,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    replyTo: opts.replyTo,
    attachments: opts.attachments ?? [],
    messageId,
  });
  assertNoBccHeader(raw, 'smtp');
  return { raw, envelope: { from: envelopeFrom, to: envelopeRecipients(opts) } };
}

/**
 * Send through the selected transport and return the provider details. SES
 * goes through `sendViaSes` untouched (Simple content without attachments,
 * Raw with them); SMTP builds the MIME and submits it with an explicit envelope.
 */
export async function sendMailDetailed(opts: MailSendOptions): Promise<MailSendResult> {
  const transport = getMailTransport();
  if (transport.name === 'ses') {
    const { messageId: _ignored, ...sesOpts } = opts;
    const id = await sendViaSes(sesOpts);
    return { messageId: id, response: id, accepted: envelopeRecipients(opts), rejected: [] };
  }
  return transport.sendRaw(prepareRawMessage(opts, transport.defaultFrom));
}

/** Drop-in for `sendViaSes`: resolves to the provider message id. */
export async function sendMail(opts: MailSendOptions): Promise<string> {
  return (await sendMailDetailed(opts)).messageId;
}
