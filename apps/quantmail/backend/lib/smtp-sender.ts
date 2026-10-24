// ============================================================================
// QuantMail — SMTP submission transport (Nodemailer).
//
// Relays prepared raw MIME to a submission server (port 587 STARTTLS, or 465
// implicit TLS) such as OCI Email Delivery. Pooled connections, authentication,
// bounded timeouts. STARTTLS is REQUIRED by default (SMTP_REQUIRE_TLS=true):
// if the server does not offer it the send fails instead of falling back to
// plaintext, so credentials and mail never cross the network unencrypted.
//
// Env:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS,
//   SMTP_REQUIRE_TLS (default true), SMTP_FROM_DEFAULT
//
// Credentials are never logged and never put in error messages.
// ============================================================================

import { createTransport, type Transporter } from 'nodemailer';
import { isIP } from 'node:net';
import type { ConnectionOptions } from 'node:tls';
import {
  MailTransportError,
  assertNoBccHeader,
  domainOfAddress,
  ensureMessageId,
  validateEnvelope,
  type MailSendResult,
  type MailTransport,
  type RawMailMessage,
} from './mail-transport-types';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  requireTls: boolean;
  fromDefault?: string;
  poolMaxConnections: number;
  poolMaxMessages: number;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  /** Idle-socket timeout. Generous: a large attachment is one long DATA write. */
  socketTimeoutMs: number;
  /** TLS tuning for tests only (self-signed certs); never read from env. */
  tlsOptions?: ConnectionOptions;
}

type Env = Record<string, string | undefined>;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read the SMTP settings from the environment; null when no host is set. */
export function readSmtpConfig(env: Env = process.env): SmtpConfig | null {
  const host = env['SMTP_HOST']?.trim();
  if (!host) return null;
  return {
    host,
    port: parsePositiveInt(env['SMTP_PORT'], 587),
    user: env['SMTP_USER'] || undefined,
    pass: env['SMTP_PASS'] || undefined,
    requireTls: parseBool(env['SMTP_REQUIRE_TLS'], true),
    fromDefault: env['SMTP_FROM_DEFAULT']?.trim() || undefined,
    poolMaxConnections: parsePositiveInt(env['SMTP_POOL_MAX_CONNECTIONS'], 3),
    poolMaxMessages: 100,
    connectionTimeoutMs: 15_000,
    greetingTimeoutMs: 15_000,
    socketTimeoutMs: 120_000,
  };
}

/**
 * Usable config: a host, plus credentials (both or neither). Credentials may
 * be omitted only when TLS is not required (local dev against MailHog), never
 * for a production-style TLS-required relay.
 */
export function isUsableSmtpConfig(cfg: SmtpConfig): boolean {
  const hasUser = Boolean(cfg.user);
  const hasPass = Boolean(cfg.pass);
  if (hasUser !== hasPass) return false;
  return hasUser || !cfg.requireTls;
}

export function isSmtpConfigured(env: Env = process.env): boolean {
  const cfg = readSmtpConfig(env);
  return cfg !== null && isUsableSmtpConfig(cfg);
}

/**
 * Managed relays sign DKIM themselves, so the worker's own signer stays OFF
 * for the SMTP transport unless SMTP_DKIM_SIGN=true (e.g. a plain relay that
 * does not sign). Signing twice would produce a second, unaligned signature.
 */
export function isSmtpDkimSignEnabled(env: Env = process.env): boolean {
  return parseBool(env['SMTP_DKIM_SIGN'], false);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const NETWORK_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

function safeMessage(err: { message?: unknown }): string {
  const text = typeof err.message === 'string' ? err.message : 'SMTP error';
  return text.replace(/[\r\n]+/g, ' ').slice(0, 300);
}

/**
 * Map a Nodemailer/SMTP failure to a MailTransportError.
 *   - 5xx reply            -> permanent (bounce)
 *   - 4xx reply, network   -> transient (retry)
 *   - missing STARTTLS     -> transient SMTP_TLS_REQUIRED: the message is fine,
 *                             an operator has to fix the server or the setting
 *   - authentication error -> transient SMTP_AUTH_FAILED: credentials are an
 *                             operator problem, so the mail is kept, not bounced
 */
export function classifySmtpError(err: unknown): MailTransportError {
  if (err instanceof MailTransportError) return err;
  const e = (err && typeof err === 'object' ? err : {}) as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : '';
  const smtpCode = typeof e.responseCode === 'number' ? e.responseCode : undefined;
  const message = safeMessage(e);
  const base = { transport: 'smtp', cause: err } as const;

  if (code === 'ETLS' || /starttls/i.test(message)) {
    return new MailTransportError(`SMTP server did not provide required STARTTLS: ${message}`, {
      ...base,
      kind: 'transient',
      code: 'SMTP_TLS_REQUIRED',
      smtpCode,
    });
  }
  if (code === 'EAUTH') {
    return new MailTransportError(`SMTP authentication failed: ${message}`, {
      ...base,
      kind: 'transient',
      code: 'SMTP_AUTH_FAILED',
      smtpCode,
    });
  }
  if (smtpCode !== undefined && smtpCode >= 500 && smtpCode < 600) {
    return new MailTransportError(`SMTP ${smtpCode}: ${message}`, {
      ...base,
      kind: 'permanent',
      code: 'SMTP_REJECTED',
      smtpCode,
    });
  }
  if (smtpCode !== undefined && smtpCode >= 400 && smtpCode < 500) {
    return new MailTransportError(`SMTP ${smtpCode}: ${message}`, {
      ...base,
      kind: 'transient',
      code: 'SMTP_DEFERRED',
      smtpCode,
    });
  }
  if (NETWORK_CODES.has(code)) {
    return new MailTransportError(`SMTP network error (${code}): ${message}`, {
      ...base,
      kind: 'transient',
      code: 'SMTP_NETWORK',
    });
  }
  return new MailTransportError(`SMTP error: ${message}`, {
    ...base,
    kind: 'transient',
    code: 'SMTP_ERROR',
    smtpCode,
  });
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp' as const;
  private transporter: Transporter | null = null;

  constructor(private readonly config: SmtpConfig) {}

  get defaultFrom(): string | undefined {
    return this.config.fromDefault;
  }

  isConfigured(): boolean {
    return isUsableSmtpConfig(this.config);
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const c = this.config;
      this.transporter = createTransport({
        pool: true,
        maxConnections: c.poolMaxConnections,
        maxMessages: c.poolMaxMessages,
        host: c.host,
        port: c.port,
        // 465 is implicit TLS; everything else upgrades with STARTTLS.
        secure: c.port === 465,
        requireTLS: c.requireTls,
        ...(c.user && c.pass ? { auth: { user: c.user, pass: c.pass } } : {}),
        connectionTimeout: c.connectionTimeoutMs,
        greetingTimeout: c.greetingTimeoutMs,
        socketTimeout: c.socketTimeoutMs,
        tls: {
          minVersion: 'TLSv1.2',
          // SNI must be a hostname; Node rejects an IP literal here.
          ...(isIP(c.host) === 0 ? { servername: c.host } : {}),
          ...c.tlsOptions,
        },
        logger: false,
        debug: false,
      });
    }
    return this.transporter;
  }

  async sendRaw(message: RawMailMessage): Promise<MailSendResult> {
    assertNoBccHeader(message.raw, this.name);
    validateEnvelope(message.envelope, this.name);
    const { from, to } = message.envelope;
    const { raw, messageId } = ensureMessageId(message.raw, domainOfAddress(from) ?? 'localhost');

    try {
      const info = await this.getTransporter().sendMail({ envelope: { from, to }, raw });
      return {
        messageId,
        response: typeof info.response === 'string' ? info.response : undefined,
        accepted: (info.accepted ?? []).map(String),
        rejected: (info.rejected ?? []).map(String),
      };
    } catch (err) {
      throw classifySmtpError(err);
    }
  }

  /** Close pooled connections (graceful shutdown, tests). */
  close(): void {
    this.transporter?.close();
    this.transporter = null;
  }
}
