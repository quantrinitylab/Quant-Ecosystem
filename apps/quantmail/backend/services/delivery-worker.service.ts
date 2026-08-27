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
import { sendViaSes, isSesConfigured } from '../lib/ses-sender';

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
    this.fallbackDomain = deps.senderDomain ?? process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.app';
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

    const recipients = uniqueAddresses(
      toAddressList((email as { toAddresses: unknown }).toAddresses),
      toAddressList((email as { ccAddresses: unknown }).ccAddresses),
      toAddressList((email as { bccAddresses: unknown }).bccAddresses),
    );
    if (recipients.length === 0) {
      throw createAppError('Email has no recipients', 400, 'NO_RECIPIENTS');
    }

    // Ensure a stable RFC 5322 Message-ID exists before signing.
    const emailDelivery = email as unknown as EmailDeliveryFields;
    const messageId = emailDelivery.messageId ?? `<${randomUUID()}@${fromDomain}>`;
    if (!emailDelivery.messageId) {
      await this.prisma.email.update({ where: { id: email.id }, data: { messageId } as never });
    }

    // When AWS SES is configured (production EKS with IRSA/IAM), transmit directly
    // through SES for maximum deliverability and automatic DKIM/SPF alignment.
    if (isSesConfigured()) {
      const receipts: RecipientReceipt[] = [];
      for (const recipient of recipients) {
        let status: AttemptStatus = 'sent';
        let response = '250 2.0.0 OK (AWS SES)';
        try {
          await sendViaSes({
            from: fromAddress,
            to: [recipient],
            subject: email.subject ?? '',
            bodyHtml: email.bodyHtml ?? undefined,
            bodyText: email.bodyPlain ?? undefined,
          });
        } catch (sesErr) {
          status = 'deferred';
          response = `451 AWS SES delivery error: ${(sesErr as Error).message}`;
        }
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
      const deliveryStatus = await this.finalizeEmailState(
        email,
        receipts.map((r) => r.status),
      );
      return { emailId: email.id, deliveryStatus, recipients: receipts };
    }

    // DKIM-sign once: the signed header set (From/To/Subject/Date/Message-ID) is
    // identical for every recipient of this message.
    const headers: Record<string, string> = {
      from: fromAddress,
      to: recipients.join(', '),
      subject: email.subject ?? '',
      date: this.now().toUTCString(),
      'message-id': messageId,
    };
    const body = email.bodyHtml ?? email.bodyPlain ?? data.body ?? '';

    let signer: DkimSigner;
    let rawMessage: string;
    try {
      signer = await this.auth.getDkimSigner(fromDomain);
      rawMessage = signer.signMessage(headers, body);
    } catch (err) {
      // Fail closed: if the message cannot be DKIM-signed, defer every recipient
      // for retry rather than transmitting unsigned mail.
      const response = `451 DKIM signing unavailable: ${(err as Error).message}`;
      const receipts = await Promise.all(
        recipients.map((r) => this.recordAttempt(email.id, r, 'deferred', response, true)),
      );
      const status = await this.finalizeEmailState(
        email,
        receipts.map((x) => x.status),
      );
      return {
        emailId: email.id,
        deliveryStatus: status,
        recipients: receipts.map((x) => ({
          recipient: x.recipient,
          status: x.status,
          smtpResponse: x.smtpResponse ?? response,
        })),
      };
    }

    const receipts: RecipientReceipt[] = [];
    for (const recipient of recipients) {
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

    const deliveryStatus = await this.finalizeEmailState(
      email,
      receipts.map((r) => r.status),
    );

    return { emailId: email.id, deliveryStatus, recipients: receipts };
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

    await this.prisma.email.update({ where: { id: email.id }, data: data as never });
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
