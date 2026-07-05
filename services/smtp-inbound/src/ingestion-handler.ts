// ============================================================================
// SMTP Inbound - Ingestion Handler
// ============================================================================
//
// Turns a parsed inbound email into a durable ingestion request forwarded to
// the mail pipeline (QuantMail ingestion endpoint / SES-style webhook). This is
// the seam between the raw SMTP protocol layer (`SmtpInboundServer`) and the
// rest of the ecosystem.
//
// FAIL-CLOSED by design: if no ingestion target is configured, or the target
// rejects the delivery, the handler THROWS. `SmtpInboundServer` turns a thrown
// handler into an SMTP error reply, so the sending MTA retries later rather
// than the message being silently dropped. Inbound mail must never be lost.

import type { EmailHandler, ParsedEmail } from './smtp-server.js';

/** Minimal logger contract (pino-compatible). */
export interface Logger {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Subset of the global `fetch` used here, so tests can inject a fake. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface IngestionHandlerOptions {
  /** Ingestion webhook URL. When absent the handler fails closed. */
  webhookUrl?: string | undefined;
  /** Optional shared-secret sent as `Authorization: Bearer <token>`. */
  authToken?: string | undefined;
  /** Injected fetch (defaults to global fetch). */
  fetchImpl?: FetchLike;
  /** Per-request timeout in ms (default 15s). */
  timeoutMs?: number;
  logger?: Logger;
}

/** JSON-safe shape of a forwarded inbound email (attachments base64-encoded). */
export interface IngestionPayload {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  date: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    contentBase64: string;
  }>;
}

/** Convert a ParsedEmail into a JSON-serializable ingestion payload. */
export function toIngestionPayload(email: ParsedEmail): IngestionPayload {
  return {
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    date: email.date ? email.date.toISOString() : null,
    attachments: email.attachments.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      contentBase64: att.content.toString('base64'),
    })),
  };
}

const noopLogger: Logger = { info: () => {}, error: () => {} };

/**
 * Build an {@link EmailHandler} that forwards parsed inbound email to the
 * configured ingestion webhook. Throws (fail-closed) when unconfigured or when
 * the downstream rejects the delivery.
 */
export function createIngestionHandler(options: IngestionHandlerOptions): EmailHandler {
  const {
    webhookUrl,
    authToken,
    fetchImpl = globalThis.fetch as unknown as FetchLike,
    timeoutMs = 15_000,
    logger = noopLogger,
  } = options;

  return async function handle(email: ParsedEmail): Promise<void> {
    if (!webhookUrl) {
      // Fail closed: never accept mail we cannot durably hand off.
      throw new Error('INBOUND_WEBHOOK_NOT_CONFIGURED');
    }

    const payload = toIngestionPayload(email);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (authToken) {
      headers['authorization'] = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.error(
          { status: res.status, messageId: email.messageId },
          'inbound ingestion rejected',
        );
        throw new Error(`INBOUND_INGESTION_FAILED status=${res.status} ${body}`.trim());
      }
      logger.info(
        { messageId: email.messageId, to: email.to, attachments: payload.attachments.length },
        'inbound email forwarded',
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
