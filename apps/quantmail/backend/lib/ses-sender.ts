// ============================================================================
// QuantMail — SES direct email sender (fallback for when the BullMQ outbound
// worker isn't reachable, e.g. sandbox/dev or Redis not provisioned for queues).
// Uses @aws-sdk/client-sesv2 SendEmail API. Credentials from env:
//   SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY / SES_REGION (defaults to the
//   global AWS creds if these are unset).
// ============================================================================

import { randomBytes } from 'node:crypto';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { createAppError, withDependencyTimeout } from '@quant/server-core';

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!client) {
    const region = process.env['SES_REGION'] ?? process.env['AWS_REGION'] ?? 'us-east-1';
    const accessKeyId = process.env['SES_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['SES_SECRET_ACCESS_KEY'];

    if (accessKeyId && secretAccessKey) {
      client = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
    } else {
      // Falls back to default AWS credential chain (e.g. IRSA on EKS)
      client = new SESv2Client({ region });
    }
  }
  return client;
}

export interface SesSendOptions {
  from: string; // e.g. "User Name <user@quantmail.in>"
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  /**
   * Attachments to carry on the external send. When present (non-empty) the
   * message is transmitted as a raw RFC 5322 MIME message
   * (multipart/mixed) so external recipients actually receive the files —
   * previously they were silently dropped by the `Simple` content path.
   * Empty/undefined keeps the original `Simple` behaviour.
   */
  attachments?: SesAttachment[];
}

/**
 * A fully-resolved attachment for outbound sending: filename + content type +
 * the real bytes. Callers resolve composer/drive references into this shape
 * via `resolveOutboundAttachments` (lib/outbound-attachments.ts) before
 * calling `sendViaSes`.
 */
export interface SesAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

/** SESv2 `SendEmail` hard cap for a `Raw` message: 10 MB, enforced pre-send. */
export const SES_RAW_MESSAGE_LIMIT_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// MIME construction (multipart/mixed, RFC 2045/2046/2047/2231)
// ---------------------------------------------------------------------------

function randomBoundary(): string {
  return `----=_QuantMail_${randomBytes(12).toString('hex')}`;
}

/** Fold base64 output to 76-char lines (RFC 2045 §6.8). */
function foldBase64(b64: string): string {
  return b64.replace(/.{76}(?=.)/g, '$&\r\n');
}

/**
 * Strip CR/LF from anything that lands in a MIME header — user-controlled
 * filenames, subjects and display names must never inject header lines.
 */
function safeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim();
}

/**
 * RFC 2047 encode a header value when it carries non-ASCII. ASCII-safe values
 * (no quotes/CRLF) pass through untouched.
 */
function encodeHeaderWord(value: string): string {
  const clean = safeHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(clean) && !clean.includes('"')) return clean;
  // Long subjects: split the encoded output into multiple encoded-words so no
  // header line grows unbounded. Each chunk is a valid encoded-word.
  const b64 = Buffer.from(clean, 'utf8').toString('base64');
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += 60) {
    chunks.push(`=?UTF-8?B?${b64.slice(i, i + 60)}?=`);
  }
  return chunks.join(' ');
}

/**
 * Encode a possibly `"Display Name" <addr>` mailbox for a header line. Bare
 * addresses pass through; display names get RFC 2047 treatment.
 */
function encodeMailbox(value: string): string {
  const clean = safeHeaderValue(value);
  const m = clean.match(/^(.*)<([^<>]*)>$/);
  if (!m) return clean;
  const name = m[1].trim().replace(/^"|"$/g, '').trim();
  const addr = m[2].trim();
  if (!name) return addr;
  return `${encodeHeaderWord(name)} <${addr}>`;
}

/**
 * Sanitize a filename for a MIME `filename`/`name` parameter: no CR/LF,
 * quotes, backslashes, slashes or control characters; path segments
 * collapsed. Dots are kept so extensions survive.
 */
export function sanitizeMimeFilename(name: string): string {
  if (!name || typeof name !== 'string') return 'attachment';
  const clean = name
    .replace(/[\\<>:"|?*\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[\r\n]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/^[./\\]+/, '')
    .trim();
  return clean.slice(0, 255) || 'attachment';
}

/**
 * Build the `filename` parameter for a MIME part. ASCII-safe filenames use
 * the classic quoted form; anything else uses RFC 2231 `filename*`.
 */
function mimeFilenameParam(filename: string): string {
  const safe = sanitizeMimeFilename(filename);
  if (/^[\x20-\x7e]*$/.test(safe) && !safe.includes('"')) {
    return `filename="${safe}"`;
  }
  const encoded = encodeURIComponent(safe).replace(/'/g, '%27');
  return `filename*=UTF-8''${encoded}`;
}

function mimeNameParam(contentType: string, filename: string): string {
  const safe = sanitizeMimeFilename(filename);
  const base = contentType.split(';')[0].trim() || 'application/octet-stream';
  if (/^[\x20-\x7e]*$/.test(safe) && !safe.includes('"')) {
    return `${base}; name="${safe}"`;
  }
  return `${base}; name*=UTF-8''${encodeURIComponent(safe).replace(/'/g, '%27')}`;
}

export interface MimeBodyInput {
  bodyText?: string;
  bodyHtml?: string;
  attachments: SesAttachment[];
}

export interface BuiltMimeBody {
  /** Value for the `Content-Type` header of the message. */
  contentTypeHeader: string;
  /** The multipart body (CRLF-joined), ready to follow a header block. */
  body: string;
}

export interface AlternativeBodyInput {
  bodyText?: string;
  bodyHtml?: string;
}

/**
 * Build a standalone `multipart/alternative` body: a text/plain part followed
 * by the text/html part (RFC 2046 §5.1.4 — the last alternative is the
 * "richest"). Bodies are base64 encoded so arbitrary UTF-8 survives transport
 * without quoted-printable.
 *
 * Used by the DKIM-signed direct-SMTP fallback so the SMTP path carries the
 * same text+html pair the SES Simple `Body {Html, Text}` shape carries;
 * `buildMultipartBody` nests this as its inner part when attachments are
 * present (identical bytes to the previous inline construction).
 */
export function buildAlternativeBody(input: AlternativeBodyInput): BuiltMimeBody {
  const inner = randomBoundary();
  const altParts: string[] = [];

  if (input.bodyText && input.bodyText.length > 0) {
    altParts.push(
      [
        `--${inner}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        foldBase64(Buffer.from(input.bodyText, 'utf8').toString('base64')),
      ].join('\r\n'),
    );
  }
  if (input.bodyHtml && input.bodyHtml.length > 0) {
    altParts.push(
      [
        `--${inner}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        foldBase64(Buffer.from(input.bodyHtml, 'utf8').toString('base64')),
      ].join('\r\n'),
    );
  }
  if (altParts.length === 0) {
    // A MIME message with no body part is legal but hostile to clients;
    // keep an empty plain-text part so the message always renders.
    altParts.push(
      [
        `--${inner}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        '',
      ].join('\r\n'),
    );
  }

  return {
    /** Value for the `Content-Type` header of the message (`multipart/alternative`). */
    contentTypeHeader: `multipart/alternative; boundary="${inner}"`,
    /** The multipart body (CRLF-joined), ready to follow a header block. */
    body: [...altParts, `--${inner}--`].join('\r\n'),
  };
}

/**
 * Build a `multipart/mixed` body: a `multipart/alternative` wrapper for the
 * text/html bodies plus one base64 part per attachment. Bodies are base64
 * encoded so arbitrary UTF-8 survives transport without quoted-printable.
 */
export function buildMultipartBody(input: MimeBodyInput): BuiltMimeBody {
  const outer = randomBoundary();
  const alt = buildAlternativeBody({ bodyText: input.bodyText, bodyHtml: input.bodyHtml });
  const lines: string[] = [];

  lines.push(
    `--${outer}`,
    `Content-Type: ${alt.contentTypeHeader}`,
    '',
    alt.body,
  );

  for (const att of input.attachments) {
    const filename = sanitizeMimeFilename(att.filename);
    lines.push(
      `--${outer}`,
      `Content-Type: ${mimeNameParam(att.contentType, filename)}`,
      `Content-Disposition: attachment; ${mimeFilenameParam(filename)}`,
      'Content-Transfer-Encoding: base64',
      '',
      foldBase64(att.content.toString('base64')),
    );
  }
  lines.push(`--${outer}--`, '');

  return {
    contentTypeHeader: `multipart/mixed; boundary="${outer}"`,
    body: lines.join('\r\n'),
  };
}

export interface RawMimeMessageInput extends MimeBodyInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  replyTo?: string;
  messageId?: string;
  date?: Date;
}

/**
 * Build a complete RFC 5322 message (headers + multipart body) for SESv2
 * `SendEmail` `Raw` content.
 *
 * MAIL-03/MAIL-06 invariant: Bcc is NEVER rendered into the MIME headers —
 * Bcc envelope routing happens via `Destination.BccAddresses` on the
 * `SendEmailCommand`, which SES keeps out of the delivered headers.
 */
export function buildRawMimeMessage(input: RawMimeMessageInput): Buffer {
  const mime = buildMultipartBody(input);
  const headers: string[] = [
    `From: ${encodeMailbox(input.from)}`,
    // A Bcc-only send has no visible To. An empty `To:` header is malformed;
    // the RFC 5322 empty group keeps the message well-formed without ever
    // naming a Bcc recipient.
    `To: ${
      input.to.length > 0
        ? input.to.map((a) => encodeMailbox(a)).join(', ')
        : 'undisclosed-recipients:;'
    }`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: ${mime.contentTypeHeader}`,
  ];
  if (input.cc && input.cc.length > 0) {
    headers.splice(2, 0, `Cc: ${input.cc.map((a) => encodeMailbox(a)).join(', ')}`);
  }
  if (input.replyTo) {
    headers.push(`Reply-To: ${encodeMailbox(input.replyTo)}`);
  }
  if (input.messageId) {
    headers.push(`Message-ID: ${safeHeaderValue(input.messageId)}`);
  }
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${mime.body}`, 'utf8');
}

/**
 * Send an email via SES directly. Returns the SES MessageId on success,
 * or throws on failure (caller should catch and degrade gracefully).
 */
export async function sendViaSes(opts: SesSendOptions): Promise<string> {
  const ses = getClient();
  // QM-BACK-009: route sends through the `quantmail-sending` configuration set
  // so SES publishes bounce/complaint/delivery events to SNS, which the
  // backend's /webhook/inbound turns into suppression-list entries. Without
  // the set, a bounce is silent and the UI can never learn the truth.
  const configurationSet = process.env['SES_CONFIGURATION_SET'] ?? 'quantmail-sending';

  const attachments = Array.isArray(opts.attachments) ? opts.attachments : [];
  let content: { Simple: unknown } | { Raw: { Data: Buffer } };
  if (attachments.length > 0) {
    // P0 fix (QM-SCREEN-006 R2): external recipients must actually receive
    // attachments. `Simple` content has no attachment surface, so build a
    // full RFC 5322 MIME envelope and transmit it as `Raw`. Bcc stays out of
    // the MIME headers (envelope only) to preserve the MAIL-03 invariant.
    const raw = buildRawMimeMessage({
      from: opts.from,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      bodyText: opts.bodyText,
      bodyHtml: opts.bodyHtml,
      replyTo: opts.replyTo,
      attachments,
    });
    if (raw.byteLength > SES_RAW_MESSAGE_LIMIT_BYTES) {
      // Fail LOUD, never silently truncate: the caller marks the send
      // deferred with this reason so the user can drop an attachment and
      // retry instead of believing a file went out that never did.
      throw createAppError(
        `Attachments too large: the message is ${(raw.byteLength / 1024 / 1024).toFixed(1)}MB, ` +
          `over the 10 MB SES raw-message limit. Remove an attachment and try again.`,
        413,
        'ATTACHMENT_PAYLOAD_TOO_LARGE',
      );
    }
    content = { Raw: { Data: raw } };
  } else {
    content = {
      Simple: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: {
          ...(opts.bodyHtml ? { Html: { Data: opts.bodyHtml, Charset: 'UTF-8' } } : {}),
          ...(opts.bodyText ? { Text: { Data: opts.bodyText, Charset: 'UTF-8' } } : {}),
        },
      },
    };
  }

  const command = new SendEmailCommand({
    FromEmailAddress: opts.from,
    ConfigurationSetName: configurationSet,
    Destination: {
      ToAddresses: opts.to,
      CcAddresses: opts.cc ?? [],
      BccAddresses: opts.bcc ?? [],
    },
    ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
    Content: content as never,
  });
  // K13: SES transmits are remote calls — bound them with the central timeout
  // policy so a hung SES endpoint fails fast with a typed RemoteCallTimeoutError
  // (label 'ses') instead of stalling the delivery worker. The error message
  // carries the label and is recorded in the delivery attempt log by callers.
  const response = await withDependencyTimeout('ses', () => ses.send(command));
  return response.MessageId ?? 'unknown';
}

/**
 * Send an already-built RFC 5322 message through SES `Raw` content. The
 * recipients are the explicit envelope (SES does not read them from the
 * headers), so Bcc recipients are routed without ever appearing in the MIME.
 * Used by the `MailTransport` interface (lib/mail-transport.ts); the
 * high-level `sendViaSes` above is unchanged.
 */
export async function sendRawViaSes(raw: Buffer, envelope: { from: string; to: string[] }): Promise<string> {
  const ses = getClient();
  const configurationSet = process.env['SES_CONFIGURATION_SET'] ?? 'quantmail-sending';
  if (raw.byteLength > SES_RAW_MESSAGE_LIMIT_BYTES) {
    throw createAppError(
      `Message is ${(raw.byteLength / 1024 / 1024).toFixed(1)}MB, over the 10 MB SES raw-message limit.`,
      413,
      'ATTACHMENT_PAYLOAD_TOO_LARGE',
    );
  }
  const command = new SendEmailCommand({
    FromEmailAddress: envelope.from,
    ConfigurationSetName: configurationSet,
    Destination: { ToAddresses: envelope.to },
    Content: { Raw: { Data: raw } },
  });
  const response = await withDependencyTimeout('ses', () => ses.send(command));
  return response.MessageId ?? 'unknown';
}

/**
 * Check if the SES sender is actually configured with usable credentials.
 *
 * A bare region is NOT a credential: a deployment that only sets `AWS_REGION`
 * (common — it is injected into most AWS runtimes by default) must fall back to
 * the SMTP transport rather than route mail to SES and fail at transmit. We
 * therefore gate on the two credential paths `getClient()` can actually use:
 *   1. Explicit static SES credentials (`SES_ACCESS_KEY_ID` + `SES_SECRET_ACCESS_KEY`).
 *   2. Ambient credentials resolvable by the AWS SDK default provider chain that
 *      `getClient()` falls back to — IRSA on EKS (`AWS_WEB_IDENTITY_TOKEN_FILE`
 *      + `AWS_ROLE_ARN`), an ECS task role (`AWS_CONTAINER_CREDENTIALS_*`), or a
 *      shared `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` pair.
 */
export function isSesConfigured(): boolean {
  const hasStaticSesCredentials = Boolean(
    process.env['SES_ACCESS_KEY_ID'] && process.env['SES_SECRET_ACCESS_KEY'],
  );
  const hasAmbientAwsCredentials = Boolean(
    (process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY']) ||
      (process.env['AWS_WEB_IDENTITY_TOKEN_FILE'] && process.env['AWS_ROLE_ARN']) ||
      process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] ||
      process.env['AWS_CONTAINER_CREDENTIALS_FULL_URI'],
  );
  return hasStaticSesCredentials || hasAmbientAwsCredentials;
}
