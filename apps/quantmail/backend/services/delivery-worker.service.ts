import { randomUUID } from 'node:crypto';
import { resolveMx as dnsResolveMx } from 'node:dns/promises';
import { createConnection } from 'node:net';
import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import {
  createTypedWorker,
  SendEmailJobSchema,
  type SendEmailJob,
  type TypedJob,
  type TypedWorkerOptions,
} from '@quant/queue';
import { OUTBOUND_DELIVERY_QUEUE } from './outbound-delivery.service';
import type { DeliverabilityAuthService, DkimSigner } from './deliverability-auth.service';
import { sendViaSes, isSesConfigured, buildMultipartBody } from '../lib/ses-sender';
import { resolveOutboundAttachments, type OutboundAttachmentDb } from '../lib/outbound-attachments';
import { QUANT_INTERNAL_DOMAINS } from '../lib/domains';
import { EmailService } from './email.service';
import { withOpenTrackingPixel, trackingHtmlAlternative } from './open-tracking.service';
import { MailOutboxEvents, emitOutbox } from '../lib/outbox-events';

/**
 * Delivery worker `processDelivery` (QuantMail SuperHub — Pillar 1, Phase 2, task 6.2).
 *
 * Consumes the durable `outbound-delivery` queue produced by
 * `OutboundDeliveryPipeline.enqueueSend` (task 6.1). For each recipient it:
 *   1. DKIM-signs the message via `DeliverabilityAuthService.getDkimSigner(domain)`,
 *   2. resolves the recipient's MX records,
 *   3. attempts SMTP transmission, and
 *   4. records a per-recipient `DeliveryAttempt` with a terminal-or-deferred state.
 * On completion it sets the email's overall `deliveryStatus`.
 *
 * Network I/O (SMTP transmission and DNS MX resolution) is abstracted behind the
 * injectable `SmtpTransport` and `MxResolver` ports, so the worker is fully
 * testable without a real network (the production wiring uses the default real
 * implementations; tests inject fakes).
 *
 * Per-recipient `Delivery_State` only ever advances toward a terminal state via
 * the monotonic {@link advanceDeliveryState} guard and never regresses
 * (Requirement 4.5 — supports the 6.3 property test).
 *
 * Requirements: 4.3 (DKIM-sign + MX resolve + SMTP attempt), 4.4 (record a
 * terminal-or-deferred state per recipient).
 */

// ---------------------------------------------------------------------------
// Delivery-state ordering (monotonic, never-regress) — Requirement 4.5
// ---------------------------------------------------------------------------

/** Full email-level delivery lifecycle literals (matches EmailDeliveryStatus). */
export type DeliveryState = 'draft' | 'queued' | 'deferred' | 'sent' | 'bounced' | 'delivered';

/** Per-recipient attempt status literals (matches DeliveryAttemptStatus). */
export type AttemptStatus = 'queued' | 'sent' | 'deferred' | 'bounced';

/**
 * Monotonic rank of each delivery state. A transition is permitted only when it
 * does not decrease rank: `draft → queued → deferred → sent → {bounced,delivered}`.
 * `deferred` ranks below `sent` so a deferred recipient may still progress to
 * `sent`; `bounced` and `delivered` are both terminal (equal rank), so a recipient
 * never flips between them.
 */
export const DELIVERY_STATE_RANK: Record<DeliveryState, number> = {
  draft: 0,
  queued: 1,
  deferred: 2,
  sent: 4,
  bounced: 5,
  delivered: 5,
};

/**
 * Return the state to persist given the current and candidate states, never
 * regressing: the candidate wins only when it has a strictly higher rank,
 * otherwise the current state is kept. This is the single monotonic guard used
 * for both per-recipient attempts and the email-level status.
 */
export function advanceDeliveryState<T extends DeliveryState>(current: T, candidate: T): T {
  return DELIVERY_STATE_RANK[candidate] > DELIVERY_STATE_RANK[current] ? candidate : current;
}

/**
 * Summarize per-recipient outcomes into an email-level delivery state
 * ("weakest link" first): any still-retrying recipient keeps the email
 * `deferred`; an all-bounced send is `bounced`; otherwise (at least one accepted)
 * it is `sent`.
 */
export function summarizeEmailDeliveryState(states: AttemptStatus[]): DeliveryState {
  if (states.length === 0) {
    return 'queued';
  }
  if (states.some((s) => s === 'queued')) {
    return 'queued';
  }
  if (states.some((s) => s === 'deferred')) {
    return 'deferred';
  }
  if (states.every((s) => s === 'bounced')) {
    return 'bounced';
  }
  return 'sent';
}

// ---------------------------------------------------------------------------
// Injectable ports (network boundary) — keep the worker testable offline
// ---------------------------------------------------------------------------

export interface MxRecord {
  exchange: string;
  priority: number;
}

/** Port for resolving a domain's MX records. */
export interface MxResolver {
  resolveMx(domain: string): Promise<MxRecord[]>;
}

/** SMTP transmission outcome → maps to a per-recipient attempt status. */
export type SmtpOutcome = 'accepted' | 'deferred' | 'bounced';

export interface SmtpResult {
  outcome: SmtpOutcome;
  /** Raw SMTP response line (e.g. "250 OK", "451 try again", "550 no such user"). */
  response: string;
}

export interface SmtpDeliveryParams {
  mxHost: string;
  port?: number;
  from: string;
  recipient: string;
  rawMessage: string;
}

/** Port for transmitting a message to a recipient's MX host over SMTP. */
export interface SmtpTransport {
  send(params: SmtpDeliveryParams): Promise<SmtpResult>;
}

/**
 * Default MX resolver backed by Node's `dns.resolveMx`. Sorted by ascending
 * priority so the worker tries the most-preferred exchange first.
 */
export class DnsMxResolver implements MxResolver {
  async resolveMx(domain: string): Promise<MxRecord[]> {
    const records = await dnsResolveMx(domain);
    return [...records].sort((a, b) => a.priority - b.priority);
  }
}

/** Classify a leading SMTP status code into a delivery outcome. */
function classifySmtpCode(code: number): SmtpOutcome {
  if (code >= 200 && code < 400) {
    return 'accepted';
  }
  if (code >= 400 && code < 500) {
    return 'deferred'; // transient — retry later
  }
  return 'bounced'; // 5xx permanent failure
}

/**
 * Minimal real SMTP transport over a raw TCP socket (EHLO → MAIL FROM → RCPT TO
 * → DATA). Maps the final 2xx/4xx/5xx reply to accepted/deferred/bounced. This
 * is the production default; tests inject a fake transport instead so no network
 * is required.
 */
export class NetSmtpTransport implements SmtpTransport {
  constructor(
    private readonly heloName = process.env['SMTP_HELO_NAME'] ?? 'quantmail.local',
    private readonly timeoutMs = 30_000,
  ) {}

  send(params: SmtpDeliveryParams): Promise<SmtpResult> {
    const port = params.port ?? 25;
    return new Promise<SmtpResult>((resolve) => {
      const socket = createConnection({ host: params.mxHost, port });
      const steps = [
        `EHLO ${this.heloName}`,
        `MAIL FROM:<${params.from}>`,
        `RCPT TO:<${params.recipient}>`,
        'DATA',
        `${params.rawMessage}\r\n.`,
        'QUIT',
      ];
      let step = -1;
      let lastResponse = '';

      const finish = (result: SmtpResult): void => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(this.timeoutMs);
      socket.setEncoding('utf-8');

      socket.on('timeout', () =>
        finish({ outcome: 'deferred', response: '451 connection timeout' }),
      );
      socket.on('error', (err) => finish({ outcome: 'deferred', response: `451 ${err.message}` }));

      socket.on('data', (chunk: string) => {
        lastResponse = chunk.trim();
        const code = Number.parseInt(lastResponse.slice(0, 3), 10);
        if (Number.isNaN(code)) {
          return;
        }
        if (code >= 500) {
          finish({ outcome: 'bounced', response: lastResponse });
          return;
        }
        if (code >= 400) {
          finish({ outcome: 'deferred', response: lastResponse });
          return;
        }
        step += 1;
        if (step >= steps.length) {
          finish({ outcome: classifySmtpCode(code), response: lastResponse });
          return;
        }
        socket.write(`${steps[step]}\r\n`);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export interface RecipientReceipt {
  recipient: string;
  status: AttemptStatus;
  smtpResponse: string;
}

export interface DeliveryReceipt {
  emailId: string;
  deliveryStatus: DeliveryState;
  recipients: RecipientReceipt[];
}

export interface DeliveryWorkerDeps {
  smtp: SmtpTransport;
  mx: MxResolver;
  /** Fallback sender domain when an email's from-address has no domain. */
  senderDomain?: string;
  /** Injectable clock for deterministic retry timestamps in tests. */
  now?: () => Date;
  /** Backoff applied to `nextRetryAt` for deferred recipients (ms). */
  retryBackoffMs?: number;
}

function recipientDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at >= 0 && at < address.length - 1 ? address.slice(at + 1).toLowerCase() : null;
}

function senderDomainOf(from: string, fallback: string): string {
  return recipientDomain(from) ?? fallback;
}

function uniqueAddresses(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const addr of list) {
      const clean = addr.trim();
      if (clean.length > 0 && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        out.push(clean);
      }
    }
  }
  return out;
}

function toAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/** Structural view of the new delivery fields on an email row (task 6.1 additive). */
interface EmailDeliveryFields {
  messageId: string | null;
  deliveryStatus: DeliveryState | null;
}

/** Structural row + delegate for `DeliveryAttempt` (avoids coupling to the generated client). */
interface DeliveryAttemptRow {
  recipient: string;
  status: AttemptStatus;
  smtpResponse: string | null;
}

type DeliveryAttemptWhere = { emailId_recipient: { emailId: string; recipient: string } };

/**
 * Minimal structural accessors for the delegates this worker touches. Mirrors
 * the structural-cast pattern used by the OutboundDeliveryPipeline (task 6.1).
 */
interface DeliveryPrisma {
  deliveryAttempt: {
    findUnique(args: { where: DeliveryAttemptWhere }): Promise<DeliveryAttemptRow | null>;
    upsert(args: {
      where: DeliveryAttemptWhere;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<DeliveryAttemptRow>;
  };
}

/** Structural row for an inbound reply candidate (reply-arrival suppression). */
interface InboundReplyRow {
  id: string;
  fromAddress: string;
  receivedAt: Date | null;
}

/** Structural delegates for reply-arrival suppression (avoids the generated client). */
interface SuppressionPrisma {
  email: {
    findFirst(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<InboundReplyRow | null>;
  };
  emailFolder: {
    findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export class DeliveryWorker {
  private readonly now: () => Date;
  private readonly retryBackoffMs: number;
  private readonly fallbackDomain: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auth: DeliverabilityAuthService,
    private readonly deps: DeliveryWorkerDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.retryBackoffMs = deps.retryBackoffMs ?? 5 * 60_000;
    // Canonical sender domain (merge-gate G2): DKIM alignment is measured against
    // the From domain, so this must match the API path default (emails.ts).
    // See imap-smtp/deploy/MAIL_SENDER_DOMAIN_DECISION.md.
    this.fallbackDomain = deps.senderDomain ?? process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.in';
  }

  /**
   * Process one queued send: DKIM-sign, resolve MX, attempt SMTP, and record a
   * per-recipient terminal-or-deferred Delivery_State.
   */
  async processDelivery(
    job: TypedJob<SendEmailJob> | { data: SendEmailJob },
  ): Promise<DeliveryReceipt> {
    const data = job.data;
    if (!data.emailId) {
      throw createAppError('Delivery job is missing emailId', 400, 'INVALID_DELIVERY_JOB');
    }

    const email = await this.prisma.email.findUnique({ where: { id: data.emailId } });
    if (!email) {
      throw createAppError('Email not found for delivery', 404, 'EMAIL_NOT_FOUND');
    }

    const fromAddress =
      email.fromAddress && email.fromAddress.length > 0
        ? email.fromAddress
        : data.userId
          ? `${data.userId}@${this.fallbackDomain}`
          : `noreply@${this.fallbackDomain}`;
    const fromDomain = senderDomainOf(fromAddress, this.fallbackDomain);

    const toAddrs = toAddressList((email as { toAddresses: unknown }).toAddresses);
    const ccAddrs = toAddressList((email as { ccAddresses: unknown }).ccAddresses);
    const bccAddrs = toAddressList((email as { bccAddresses: unknown }).bccAddresses);
    const recipients = uniqueAddresses(toAddrs, ccAddrs, bccAddrs);
    if (recipients.length === 0) {
      throw createAppError('Email has no recipients', 400, 'NO_RECIPIENTS');
    }

    // Fire-gate: a queued job can outlive its send. The user may have cancelled
    // via POST /emails/:id/cancel-send (which swallows queue-remove failures, so
    // the job can still fire), the job may be a manual BullMQ retry, or a
    // crash-retry may run after the row already reached a terminal state.
    // Firing then would transmit a message the user cancelled — or double-send.
    // Only a still-`queued` row may fire; `deferred` stays allowed so BullMQ
    // backoff retries keep working.
    const fireStatus = (email as unknown as EmailDeliveryFields).deliveryStatus ?? 'queued';
    if (
      fireStatus === 'draft' ||
      fireStatus === 'sent' ||
      fireStatus === 'delivered' ||
      fireStatus === 'bounced'
    ) {
      return { emailId: email.id, deliveryStatus: fireStatus, recipients: [] };
    }

    // Reply-arrival suppression for scheduled sends (Superhuman parity): if an
    // inbound reply from the conversation landed after the send was scheduled,
    // hold the message — firing a "just following up!" after the recipient
    // already replied is the exact awkwardness this prevents. The send is
    // returned to Drafts (mirroring cancel-send) and `mail.outbound.cancelled.v1`
    // is emitted. Only jobs carrying `scheduledFor` are scheduled sends;
    // immediate and undo-window sends are untouched.
    if (data.scheduledFor) {
      const reply = await this.findSuppressingReply(email, recipients, data.scheduledAt);
      if (reply) {
        const suppressUserId = data.userId ?? (email as { userId?: string }).userId ?? '';
        return this.suppressScheduledSend(email, suppressUserId, reply, data.scheduledFor);
      }
    }

    // Ensure a stable RFC 5322 Message-ID exists before signing.
    const emailDelivery = email as unknown as EmailDeliveryFields;
    const messageId = emailDelivery.messageId ?? `<${randomUUID()}@${fromDomain}>`;
    if (!emailDelivery.messageId) {
      await this.prisma.email.update({
        where: { id: email.id },
        // QM-BACK-002: keep the version column truthful on system writes.
        data: { messageId, version: { increment: 1 } } as never,
      });
    }

    // Split recipients: QuantMail users get a direct internal mailbox copy;
    // only truly external addresses go through SES/SMTP. The delayed-send
    // path (e.g. /compose's 10s undo window) skips the route-level
    // deliverInternally, so the worker OWNS internal delivery — without this,
    // delayed sends to @quantmail.in addresses are queued, never delivered,
    // and vanish (not in Sent, not in the recipient's inbox).
    const { internal: internalAddrs, external: externalAddrs } =
      await this.splitInternalExternal(recipients);
    const internalSet = new Set(internalAddrs);
    const extTo = toAddrs.filter((a) => !internalSet.has(a));
    const extCc = ccAddrs.filter((a) => !internalSet.has(a));
    const extBcc = bccAddrs.filter((a) => !internalSet.has(a));
    const extRecipients = externalAddrs;

    const receipts: RecipientReceipt[] = [];

    // Internal delivery: direct inbox copies, no SES/SMTP involved.
    // fromUserId falls back to the email's owner when the job payload lacks it.
    const senderUserId = data.userId ?? (email as { userId?: string }).userId;
    if (internalAddrs.length > 0 && senderUserId) {
      try {
        const emailService = new EmailService(this.prisma);
        await emailService.deliverInternally({
          fromUserId: senderUserId,
          subject: email.subject ?? '',
          bodyHtml: email.bodyHtml ?? undefined,
          bodyPlain: email.bodyPlain ?? undefined,
          toAddresses: toAddrs.filter((a) => internalSet.has(a)),
          ccAddresses: ccAddrs.filter((a) => internalSet.has(a)),
          bccAddresses: bccAddrs.filter((a) => internalSet.has(a)),
          threadId: (email as { threadId?: string | null }).threadId ?? undefined,
          inReplyTo: (email as { inReplyTo?: string | null }).inReplyTo ?? undefined,
          attachments: ((email as { attachments?: unknown }).attachments as unknown[]) ?? [],
          messageId,
          messageKind: (email as { messageKind?: string }).messageKind as 'MAIL' | 'CHAT' | undefined,
        });
        for (const r of internalAddrs) {
          const persisted = await this.recordAttempt(
            email.id,
            r,
            'sent',
            '250 2.0.0 OK (internal delivery)',
            false,
          );
          receipts.push({
            recipient: r,
            status: persisted.status,
            smtpResponse: persisted.smtpResponse ?? '250 2.0.0 OK (internal delivery)',
          });
        }
      } catch (err) {
        const response = `451 internal delivery failed: ${(err as Error).message}`;
        for (const r of internalAddrs) {
          const persisted = await this.recordAttempt(email.id, r, 'deferred', response, true);
          receipts.push({
            recipient: r,
            status: persisted.status,
            smtpResponse: persisted.smtpResponse ?? response,
          });
        }
      }
    }

    // When AWS SES is configured (production EKS with IRSA/IAM), transmit directly
    // through SES for maximum deliverability and automatic DKIM/SPF alignment.
    // M-F16: Transmit authoritative message preserving To, Cc, Bcc, replyTo, and fromName.
    // In AWS SESv2, sending to, cc, and bcc together delivers to all recipients while
    // preserving To/Cc headers for Reply-All and hiding Bcc recipients from To/Cc headers.
    // fix/qm-composer-open-tracking: the beacon is injected into the OUTBOUND
    // mime only — never into the stored bodyHtml — so the sender's own
    // Sent/thread views can never self-trigger a count. Computed once here so
    // the SES, multipart, and direct-SMTP transmit shapes below all carry the
    // identical pixel. Token presence implies tracking was enabled at send
    // time (minted in EmailService.send's flip); withOpenTrackingPixel is a
    // no-op without it, so untracked mail transmits byte-identically.
    const bodyHtmlClean =
      email.bodyHtml && email.bodyHtml.trim().length > 0 ? email.bodyHtml : undefined;
    const openTokenForTransmit = email.openTrackingEnabled ? email.openToken : null;
    const trackedBodyHtml = withOpenTrackingPixel(bodyHtmlClean, openTokenForTransmit);
    // Plain-text-only tracked mail (e.g. quick replies): the fallback body
    // below keeps preferring text; only the SES multipart path gets the HTML
    // alternative so the beacon can ride it.
    const sesBodyHtml =
      bodyHtmlClean
        ? trackedBodyHtml
        : trackingHtmlAlternative(email.bodyPlain, openTokenForTransmit);

    // NOTE: external recipients only — internal ones are already delivered above.
    if (extRecipients.length > 0 && isSesConfigured()) {
      const from = email.fromName ? `${email.fromName} <${fromAddress}>` : fromAddress;
      let status: AttemptStatus = 'sent';
      let response = '250 2.0.0 OK (AWS SES)';
      try {
        // QM-SCREEN-006 R2: resolve attachments to real bytes so external
        // recipients actually receive them (raw MIME envelope). Unresolvable
        // attachments throw ATTACHMENT_UNRESOLVABLE -> deferred, never silent.
        const attachments = await resolveOutboundAttachments(
          (email as { attachments?: unknown }).attachments,
          senderUserId,
          this.prisma as unknown as OutboundAttachmentDb,
        );
        await sendViaSes({
          from,
          to: extTo,
          cc: extCc.length > 0 ? extCc : undefined,
          bcc: extBcc.length > 0 ? extBcc : undefined,
          subject: email.subject ?? '',
          bodyHtml: sesBodyHtml,
          bodyText:
            email.bodyPlain && email.bodyPlain.trim().length > 0 ? email.bodyPlain : undefined,
          replyTo: fromAddress,
          attachments,
        });
      } catch (sesErr) {
        status = 'deferred';
        response = `451 AWS SES delivery error: ${(sesErr as Error).message}`;
      }
      for (const recipient of extRecipients) {
        const persisted = await this.recordAttempt(
          email.id,
          recipient,
          status,
          response,
          status === 'deferred',
        );
        receipts.push({
          recipient,
          status: persisted.status,
          smtpResponse: persisted.smtpResponse ?? response,
        });
      }
    } else if (extRecipients.length > 0) {
      // DKIM-sign once: the signed header set (From/To/Subject/Date/Message-ID) is
      // identical for every recipient of this message.
      // M-F15: To and Cc must only contain visible recipients. Bcc addresses must NEVER appear in headers!
      const headers: Record<string, string> = {
        from: email.fromName ? `${email.fromName} <${fromAddress}>` : fromAddress,
        to: extTo.join(', '),
        subject: email.subject ?? '',
        date: this.now().toUTCString(),
        'message-id': messageId,
        // SES-parity: both SES paths set Reply-To (to fromAddress); the
        // direct-SMTP fallback must carry the same header so "reply" behaves
        // identically regardless of which transport delivered the message.
        'reply-to': fromAddress,
      };
      if (extCc.length > 0) {
        headers.cc = extCc.join(', ');
      }
      const body = trackedBodyHtml ?? email.bodyPlain ?? data.body ?? '';

      let rawMessage: string | undefined;
      try {
        const signer: DkimSigner = await this.auth.getDkimSigner(fromDomain);
        // QM-SCREEN-006 R2: the direct-SMTP fallback dropped attachments the
        // same silent way SES did — wrap the body in multipart/mixed so the
        // DKIM-signed message carries them too.
        const attachments = await resolveOutboundAttachments(
          (email as { attachments?: unknown }).attachments,
          senderUserId,
          this.prisma as unknown as OutboundAttachmentDb,
        );
        if (attachments.length > 0) {
          const mime = buildMultipartBody({
            bodyText:
              email.bodyPlain && email.bodyPlain.trim().length > 0 ? email.bodyPlain : undefined,
            bodyHtml: trackedBodyHtml,
            attachments,
          });
          headers['mime-version'] = '1.0';
          headers['content-type'] = mime.contentTypeHeader;
          rawMessage = signer.signMessage(headers, mime.body);
        } else {
          rawMessage = signer.signMessage(headers, body);
        }
      } catch (err) {
        // Fail closed: if the message cannot be DKIM-signed, defer every recipient
        // for retry rather than transmitting unsigned mail.
        const response = `451 DKIM signing unavailable: ${(err as Error).message}`;
        for (const r of extRecipients) {
          const persisted = await this.recordAttempt(email.id, r, 'deferred', response, true);
          receipts.push({
            recipient: r,
            status: persisted.status,
            smtpResponse: persisted.smtpResponse ?? response,
          });
        }
      }

      if (rawMessage !== undefined) {
        for (const recipient of extRecipients) {
          const { outcome, response } = await this.attemptRecipient(recipient, fromAddress, rawMessage);
          const status: AttemptStatus =
            outcome === 'accepted' ? 'sent' : outcome === 'deferred' ? 'deferred' : 'bounced';
          const persisted = await this.recordAttempt(
            email.id,
            recipient,
            status,
            response,
            status === 'deferred',
          );
          receipts.push({
            recipient,
            status: persisted.status,
            smtpResponse: persisted.smtpResponse ?? response,
          });
        }
      }
    }

    const deliveryStatus = await this.finalizeEmailState(
      email,
      receipts.map((r) => r.status),
    );

    return { emailId: email.id, deliveryStatus, recipients: receipts };
  }

  /**
   * Split recipients into QuantMail-internal vs external addresses, mirroring
   * the matching logic in EmailService.send: a recipient is internal when it
   * matches a user's email or username (including username@internal-domain
   * variants). Internal recipients get direct mailbox copies; only external
   * ones go through SES/SMTP.
   */
  private async splitInternalExternal(
    recipients: string[],
  ): Promise<{ internal: string[]; external: string[] }> {
    let internal: string[] = [];
    if (recipients.length > 0) {
      try {
        const userModel = this.prisma as unknown as {
          user: {
            findMany(a: unknown): Promise<Array<{ email: string; username: string | null }>>;
          };
        };
        const targetHandles = recipients.map((r) => r.split('@')[0].toLowerCase());
        const matches = await userModel.user.findMany({
          where: {
            OR: [
              { email: { in: recipients, mode: 'insensitive' } },
              { username: { in: targetHandles, mode: 'insensitive' } },
              ...recipients.flatMap((r) => {
                const h = r.split('@')[0].toLowerCase();
                return QUANT_INTERNAL_DOMAINS.map((domain) => ({
                  email: { equals: `${h}@${domain}`, mode: 'insensitive' as const },
                }));
              }),
            ],
          },
          select: { email: true, username: true },
        });
        internal = matches.flatMap((u) => [
          u.email.toLowerCase(),
          ...(u.username
            ? QUANT_INTERNAL_DOMAINS.map((domain) => `${u.username!.toLowerCase()}@${domain}`)
            : []),
        ]);
      } catch {
        // On lookup failure, treat everyone as external — SES/SMTP is the
        // safe fallback, and failures there are recorded per-recipient.
        internal = [];
      }
    }
    const internalSet = new Set(internal);
    return {
      internal: recipients.filter((r) => internalSet.has(r)),
      external: recipients.filter((r) => !internalSet.has(r)),
    };
  }

  /** Resolve MX for a recipient and attempt SMTP transmission to the best host. */
  private async attemptRecipient(
    recipient: string,
    from: string,
    rawMessage: string,
  ): Promise<SmtpResult> {
    const domain = recipientDomain(recipient);
    if (!domain) {
      return { outcome: 'bounced', response: '550 invalid recipient address' };
    }

    let mxRecords: MxRecord[];
    try {
      mxRecords = await this.deps.mx.resolveMx(domain);
    } catch (err) {
      return {
        outcome: 'deferred',
        response: `451 MX resolution failed: ${(err as Error).message}`,
      };
    }
    if (!mxRecords || mxRecords.length === 0) {
      return { outcome: 'deferred', response: '451 no MX records for domain' };
    }

    const best = [...mxRecords].sort((a, b) => a.priority - b.priority)[0]!;
    try {
      return await this.deps.smtp.send({ mxHost: best.exchange, from, recipient, rawMessage });
    } catch (err) {
      return { outcome: 'deferred', response: `451 SMTP error: ${(err as Error).message}` };
    }
  }

  /**
   * Reply-arrival suppression check: find the earliest inbound message from the
   * conversation that arrived AFTER the scheduled send was queued.
   *
   * A scheduled send is normally a follow-up inside a thread, so the check is
   * thread-scoped: any non-self inbound message in the same thread suppresses
   * it (a reply from anyone in the conversation makes a "just following up!"
   * awkward). A scheduled send with no thread (fresh compose) falls back to
   * recipient matching: an inbound message FROM one of the recipients
   * suppresses it — matching Superhuman's described rule ("if you receive a
   * reply from the recipient before your scheduled message is sent").
   *
   * Returns the suppressing reply, or null when the send may fire. Fails OPEN
   * (returns null) when the schedule moment is unknown — suppressing without
   * evidence would silently drop user mail.
   */
  private async findSuppressingReply(
    email: Email,
    recipients: string[],
    scheduledAt: string | undefined,
  ): Promise<InboundReplyRow | null> {
    const scheduleMoment = scheduledAt ? new Date(scheduledAt) : null;
    if (!scheduleMoment || Number.isNaN(scheduleMoment.getTime())) {
      return null;
    }
    const threadId = (email as { threadId?: string | null }).threadId ?? null;
    const db = this.prisma as unknown as SuppressionPrisma;
    // Inbound ingest stamps receivedAt; legacy rows may only carry createdAt —
    // either one past the schedule moment proves the reply arrived in time.
    const arrivedAfterSchedule = {
      OR: [{ receivedAt: { gt: scheduleMoment } }, { createdAt: { gt: scheduleMoment } }],
    };
    const base = {
      userId: email.userId,
      isSent: false,
      isDraft: false,
      isTrash: false,
      id: { not: email.id },
    };
    const where: Record<string, unknown> = threadId
      ? {
          ...base,
          threadId,
          // The user's own messages are outbound (isSent) — this excludes the
          // edge case of an inbound-looking self copy (e.g. a self-sent note)
          // cancelling the user's own scheduled reminder.
          NOT: {
            fromAddress: {
              equals: (email.fromAddress ?? '').toLowerCase(),
              mode: 'insensitive',
            },
          },
          ...arrivedAfterSchedule,
        }
      : {
          ...base,
          fromAddress: { in: recipients, mode: 'insensitive' },
          ...arrivedAfterSchedule,
        };
    return db.email.findFirst({
      where,
      orderBy: { receivedAt: 'asc' },
      select: { id: true, fromAddress: true, receivedAt: true },
    });
  }

  /**
   * Suppress a scheduled send whose recipient already replied: return it to
   * Drafts (mirroring POST /emails/:id/cancel-send) and emit
   * `mail.outbound.cancelled.v1` with the suppressing reply's identity, so
   * consumers (notifications, timeline) can tell the user WHY it did not send.
   * The domain write and the outbox row commit in ONE transaction (K1).
   */
  private async suppressScheduledSend(
    email: Email,
    userId: string,
    reply: InboundReplyRow,
    scheduledFor: string,
  ): Promise<DeliveryReceipt> {
    const db = this.prisma as unknown as SuppressionPrisma;
    let draftsFolder = await db.emailFolder.findFirst({
      where: { userId, OR: [{ name: 'Drafts' }, { type: 'DRAFTS' }] },
    });
    if (!draftsFolder) {
      draftsFolder = await db.emailFolder.create({
        data: { userId, name: 'Drafts', type: 'DRAFTS' },
      });
    }
    const draftsFolderId = draftsFolder.id;

    await this.prisma.$transaction(async (tx) => {
      await tx.email.update({
        where: { id: email.id },
        // QM-BACK-002: keep the version column truthful on system writes.
        data: {
          isDraft: true,
          isSent: false,
          sentAt: null,
          deliveryStatus: 'draft',
          folderId: draftsFolderId,
          version: { increment: 1 },
        } as never,
      });
      await emitOutbox(tx as object, {
        event: MailOutboxEvents.outboundCancelled,
        aggregateType: 'Email',
        aggregateId: email.id,
        payload: {
          userId,
          scheduledFor,
          reason: 'inbound_reply',
          suppressedByReplyId: reply.id,
          replyFrom: reply.fromAddress,
        },
      });
    });

    return { emailId: email.id, deliveryStatus: 'draft', recipients: [] };
  }

  /**
   * Upsert the recipient's single authoritative DeliveryAttempt row, advancing
   * its status monotonically (never regressing) — Requirement 4.5.
   */
  private async recordAttempt(
    emailId: string,
    recipient: string,
    candidate: AttemptStatus,
    smtpResponse: string,
    scheduleRetry: boolean,
  ): Promise<{ recipient: string; status: AttemptStatus; smtpResponse: string | null }> {
    const db = this.prisma as unknown as DeliveryPrisma;
    const existing = await db.deliveryAttempt.findUnique({
      where: { emailId_recipient: { emailId, recipient } },
    });
    const current: AttemptStatus = (existing?.status as AttemptStatus | undefined) ?? 'queued';
    const status = advanceDeliveryState<DeliveryState>(current, candidate) as AttemptStatus;
    const attemptedAt = this.now();
    const nextRetryAt =
      scheduleRetry && status === 'deferred'
        ? new Date(attemptedAt.getTime() + this.retryBackoffMs)
        : null;

    const row = await db.deliveryAttempt.upsert({
      where: { emailId_recipient: { emailId, recipient } },
      create: { emailId, recipient, status, smtpResponse, attemptedAt, nextRetryAt },
      update: { status, smtpResponse, attemptedAt, nextRetryAt },
    });

    return {
      recipient,
      status: row.status as AttemptStatus,
      smtpResponse: row.smtpResponse,
    };
  }

  /**
   * Compute the email-level Delivery_State from per-recipient outcomes and persist
   * it monotonically. Marks the email sent (isSent/sentAt) once it reaches a
   * `sent`/`delivered` state.
   */
  private async finalizeEmailState(email: Email, states: AttemptStatus[]): Promise<DeliveryState> {
    const summary = summarizeEmailDeliveryState(states);
    const current = (email as unknown as EmailDeliveryFields).deliveryStatus ?? 'queued';
    const next = advanceDeliveryState<DeliveryState>(current, summary);

    const data: Record<string, unknown> = { deliveryStatus: next };
    if ((next === 'sent' || next === 'delivered') && !email.isSent) {
      data['isSent'] = true;
      data['isDraft'] = false;
      data['sentAt'] = this.now();
    }
    if (next === 'delivered') {
      // Read-receipt pipeline: the outbound transport accepted the message, so
      // the sender's ticks move from single grey to double grey. Only fills in
      // blanks — a direct-SES send already stamped it in EmailService.send.
      const deliveredAt = (email as unknown as { deliveredAt?: Date | null }).deliveredAt;
      if (!deliveredAt) data['deliveredAt'] = this.now();
    }

    await this.prisma.email.update({
      where: { id: email.id },
      // QM-BACK-002: keep the version column truthful on system writes.
      data: { ...(data as Record<string, unknown>), version: { increment: 1 } } as never,
    });
    return next;
  }
}

/**
 * Build a BullMQ worker bound to the `outbound-delivery` queue that runs
 * `DeliveryWorker.processDelivery` for each job. Mirrors the producer wiring in
 * `OutboundDeliveryPipeline.createQueue` (task 6.1).
 */
export function createDeliveryWorker(
  prisma: PrismaClient,
  auth: DeliverabilityAuthService,
  deps: DeliveryWorkerDeps,
  opts?: TypedWorkerOptions,
): ReturnType<typeof createTypedWorker> {
  const worker = new DeliveryWorker(prisma, auth, deps);
  return createTypedWorker<SendEmailJob>(
    OUTBOUND_DELIVERY_QUEUE,
    SendEmailJobSchema,
    async (job) => {
      await worker.processDelivery(job);
    },
    opts,
  );
}
