import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { OutboundDeliveryPipeline } from './outbound-delivery.service';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';
import { QUANT_INTERNAL_DOMAINS, isInternalDomain, getSenderDomain } from '../lib/domains';
import { suppressionService, SuppressionService } from './suppression.service';
import { MailFilterService } from './mail-filter.service';
import { emitOutbox, MailOutboxEvents } from '../lib/outbox-events';
import { MutationOptions, resolveRequestId } from '../lib/mutation-context';
import { versionedUpdate, VersionedTx } from '../lib/optimistic-update';

export type { MutationOptions };

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/**
 * Advanced search refinements for `EmailService.search`.
 *
 * These are the server-side half of the /search page's filter chips
 * (From / To / Has attachment / Label / Since). The search route's zod schema
 * used to silently strip every one of them, so the chips were cosmetic —
 * applying `From:kundan` left the result count unchanged. They are ANDed with
 * the free-text `q` match.
 *
 * `to` is exact-element-only on the server: `toAddresses` is a Postgres Json
 * array and Prisma can only ask it for an exact element (`array_contains`).
 * A full address (`someone@example.com`) matches server-side; a bare fragment
 * (`kumar`) is matched client-side by the frontend hook on the returned set,
 * which is the same split the free-text path already documents for recipient
 * substrings.
 */
export interface EmailSearchFilters {
  /** Substring of sender address or name (case-insensitive). */
  from?: string;
  /**
   * Recipient filter. A full address containing `@` is matched exactly against
   * `toAddresses`/`ccAddresses`/`bccAddresses` elements; a fragment without
   * `@` is left for client-side substring matching.
   */
  to?: string;
  /** When true, only emails with attachments. */
  hasAttachment?: boolean;
  /** Label *name* (as the UI chip collects it); resolved to the label id. */
  label?: string;
  /** ISO date (YYYY-MM-DD): only mail received on/after this day. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD): only mail received on/before this day. */
  dateTo?: string;
  /** Substring of the subject line (case-insensitive). */
  subject?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Parses a `YYYY-MM-DD` search filter into a Date. Returns undefined for
 * anything unparseable so a bad filter value can never 500 a search —
 * the filter is simply not applied. `endOfDay` shifts a `dateTo` bound to the
 * end of that day so "since 2026-10-01" style filters behave inclusively.
 */
function parseSearchDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const d = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface ComposeEmailInput {
  userId: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  bodyHtml?: string;
  bodyPlain?: string;
  threadId?: string;
  inReplyTo?: string;
  attachments?: unknown[];
  /**
   * How the message was written: a full letter (`MAIL`) or a line typed into the
   * conversation (`CHAT`). Recorded so the thread can mark each message and show
   * both kinds in one timeline. Omitted means `MAIL`, matching the column default
   * and the behaviour of every caller that predates the chat composer.
   */
  messageKind?: MessageKind;
  /**
   * Message priority level. Mirrors `EmailPriority` in schema.prisma.
   * Case-insensitive, defaults to `NORMAL`.
   */
  priority?: EmailPriority | string;
  /**
   * QM-BACK-002: correlation id for the whole mutation path. Recorded in the
   * `draftCreated` outbox payload (doc 23 correlationId) so downstream
   * consumers can tie the event back to the originating HTTP request.
   */
  requestId?: string;
}

/**
 * The two ways a message can be written. Mirrors the `EmailMessageKind` enum in
 * `packages/database/prisma/schema.prisma`; spelled out here so this module does
 * not depend on the generated client having been regenerated.
 */
export type MessageKind = 'MAIL' | 'CHAT';

/** Normalize whatever a caller passed into a storable kind, defaulting to a letter. */
export function toMessageKind(value: unknown): MessageKind {
  return String(value ?? '').toUpperCase() === 'CHAT' ? 'CHAT' : 'MAIL';
}

/**
 * The priority of an email message. Mirrors the `EmailPriority` enum in
 * `packages/database/prisma/schema.prisma`.
 */
export type EmailPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

/** Normalize whatever a caller passed into a storable priority, defaulting to NORMAL. */
export function toPriority(value: unknown): EmailPriority {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'LOW') return 'LOW';
  if (upper === 'HIGH') return 'HIGH';
  if (upper === 'URGENT') return 'URGENT';
  return 'NORMAL';
}

export interface ReceiveEmailInput {
  userId: string;
  folderId: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  bodyHtml?: string;
  bodyPlain?: string;
  snippet?: string;
  threadId?: string;
  inReplyTo?: string;
  hasAttachments?: boolean;
  attachments?: unknown[];
  receivedAt?: Date;
  /** Combined SPF/DKIM/DMARC verdict recorded by the InboundIngestAdapter (Req 5.1). */
  authResults?: unknown;
  /** Quarantine flag — set when the message fails DMARC alignment (Req 5.3). */
  isSpam?: boolean;
  /** Inbound delivery lifecycle state (inbound mail is `delivered`). */
  deliveryStatus?: string;
  /**
   * Smart-inbox partition (`primary` | `social` | `promotions` | `updates` |
   * `forums`), written by the InboundIngestAdapter's SmartInboxService pass so
   * the inbox category tabs read a column that is actually populated. Absent =>
   * the column stays null and the message falls into Primary, which is the same
   * behaviour every message had before categorization was wired.
   */
  aiCategory?: string;
}

export interface Label {
  id: string;
  userId: string;
  name: string;
  color?: string;
}

export class EmailService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pipeline?: OutboundDeliveryPipeline,
    private readonly suppression?: {
      filterAllowedRecipients(
        recipients: string[],
      ): Promise<{ allowed: string[]; suppressed: string[] }>;
    },
  ) {}

  async compose(input: ComposeEmailInput): Promise<Email> {
    // Stamp the sender's own QuantMail address on the message so the Sent copy
    // (and internal delivery) shows a correct From instead of an empty string.
    const sender = await (
      this.prisma as unknown as {
        user: {
          findUnique(
            a: unknown,
          ): Promise<{ email: string; displayName: string | null; username: string | null } | null>;
        };
      }
    ).user.findUnique({
      where: { id: input.userId },
      select: { email: true, displayName: true, username: true },
    });

    const hasValidSender = Boolean(sender?.email?.includes('@') || sender?.username);
    if (!hasValidSender) {
      throw createAppError(
        'User has no valid sender identity configured',
        400,
        'INVALID_SENDER_IDENTITY',
      );
    }

    const senderEmail = sender?.email?.includes('@')
      ? sender.email
      : `${sender!.username}@${getSenderDomain()}`;
    const senderName =
      sender?.displayName || sender?.username || senderEmail.split('@')[0] || 'QuantMail User';

    const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
    // K1: draft row + outbox row in ONE transaction (doc 05 data-and-event-architecture).
    const email = await this.prisma.$transaction(async (tx) => {
      const created = await tx.email.create({
        data: {
          userId: input.userId,
          toAddresses: input.toAddresses,
          ccAddresses: input.ccAddresses ?? [],
          bccAddresses: input.bccAddresses ?? [],
          subject: input.subject,
          bodyHtml: input.bodyHtml ?? '',
          bodyPlain: input.bodyPlain ?? '',
          fromAddress: senderEmail,
          fromName: senderName,
          isDraft: true,
          threadId: input.threadId ?? null,
          inReplyTo: input.inReplyTo ?? null,
          hasAttachments,
          attachments: input.attachments ?? [],
          messageKind: toMessageKind(input.messageKind),
          priority: toPriority(input.priority),
        } as never,
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.draftCreated,
        aggregateType: 'Email',
        aggregateId: created.id,
        payload: {
          userId: input.userId,
          threadId: (created as { threadId?: string | null }).threadId ?? null,
          requestId: input.requestId ?? null,
        },
      });
      return created;
    });

    return email;
  }

  /**
   * Deliver a message to any recipients that are QuantMail users, by creating a
   * received copy in each recipient's mailbox (inbox = no folder). This makes
   * mail between QuantMail addresses work end-to-end without any external SMTP
   * provider. External (non-QuantMail) recipients are handled by the outbound
   * delivery pipeline. Returns the number of internal recipients delivered to.
   */
  async deliverInternally(input: {
    fromUserId: string;
    subject: string;
    bodyHtml?: string;
    bodyPlain?: string;
    toAddresses: string[];
    ccAddresses?: string[];
    bccAddresses?: string[];
    threadId?: string;
    inReplyTo?: string;
    attachments?: unknown[];
    /**
     * The sender's sent copy's Message-ID, stamped on every recipient copy so
     * read receipts can be propagated back to the sender when a recipient opens
     * the thread (ThreadService.markThreadRead). The sender's copy gets this
     * value in EmailService.send; routes pass `sent.messageId` through.
     */
    messageId?: string;
    /**
     * Stamped on the recipient's copy so both sides of the conversation mark the
     * message the same way. Without it a line typed into the thread would arrive
     * badged as a letter in the recipient's inbox.
     */
    messageKind?: MessageKind;
  }): Promise<number> {
    const recipients = Array.from(
      new Set(
        [...input.toAddresses, ...(input.ccAddresses ?? []), ...(input.bccAddresses ?? [])].map(
          (a) => a.trim().toLowerCase(),
        ),
      ),
    );
    if (recipients.length === 0) return 0;

    const userModel = this.prisma as unknown as {
      user: {
        findUnique(
          a: unknown,
        ): Promise<{ email: string; displayName: string | null; username: string | null } | null>;
        findMany(
          a: unknown,
        ): Promise<Array<{ id: string; email: string; username: string | null }>>;
      };
      folder?: {
        findFirst(a: unknown): Promise<{ id: string } | null>;
      };
      emailFolder?: {
        findFirst(a: unknown): Promise<{ id: string } | null>;
      };
    };

    const sender = await userModel.user.findUnique({
      where: { id: input.fromUserId },
      select: { email: true, displayName: true, username: true },
    });

    // MAIL-04: Only derive handle matches for explicitly internal domains or bare handles.
    // External domain addresses (@gmail.com, etc.) must NEVER match unrelated internal accounts by local-part.
    const internalRecipients = recipients.filter((r) => !r.includes('@') || isInternalDomain(r));
    const targetHandles = internalRecipients.map((r) => r.split('@')[0].toLowerCase());

    const orConditions: any[] = [{ email: { in: recipients, mode: 'insensitive' } }];
    if (targetHandles.length > 0) {
      orConditions.push({ username: { in: targetHandles, mode: 'insensitive' } });
      orConditions.push(
        ...targetHandles.flatMap((h) =>
          QUANT_INTERNAL_DOMAINS.map((domain) => ({
            email: { equals: `${h}@${domain}`, mode: 'insensitive' as const },
          })),
        ),
      );
    }

    const matches = await userModel.user.findMany({
      where: { OR: orConditions },
      select: { id: true, email: true, username: true },
    });

    const snippet = (input.bodyPlain ?? input.bodyHtml ?? '').replace(/<[^>]+>/g, '').slice(0, 140);
    const hasValidSender = Boolean(sender?.email?.includes('@') || sender?.username);
    if (!hasValidSender) {
      throw createAppError(
        'User has no valid sender identity configured',
        400,
        'INVALID_SENDER_IDENTITY',
      );
    }

    const senderEmail = sender?.email?.includes('@')
      ? sender.email
      : `${sender!.username}@${getSenderDomain()}`;
    const senderName =
      sender?.displayName || sender?.username || senderEmail.split('@')[0] || 'QuantMail User';

    const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
    let delivered = 0;
    const folderDelegate = userModel.emailFolder || userModel.folder;
    for (const recipient of matches) {
      const inboxFolder = folderDelegate
        ? await folderDelegate
            .findFirst({
              where: { userId: recipient.id, type: 'INBOX' },
            })
            .catch(() => null)
        : null;

      let recipientThreadId: string | null = null;
      try {
        const { ThreadService } = await import('./thread.service');
        const threadService = new ThreadService(this.prisma);
        recipientThreadId = await threadService.stitchInbound({
          userId: recipient.id,
          subject: input.subject,
          inReplyTo: input.inReplyTo,
          participants: [senderEmail, ...input.toAddresses],
          at: new Date(),
        });
      } catch {
        recipientThreadId = null;
      }

      // K1: recipient copy + outbox row in ONE transaction (doc 05).
      const created = await this.prisma.$transaction(async (tx) => {
        const copy = await tx.email.create({
          data: {
            userId: recipient.id,
            folderId: inboxFolder?.id ?? null,
            fromAddress: senderEmail,
            fromName: senderName,
            toAddresses: input.toAddresses,
            ccAddresses: input.ccAddresses ?? [],
            bccAddresses: [],
            subject: input.subject,
            bodyHtml: input.bodyHtml ?? '',
            bodyPlain: input.bodyPlain ?? '',
            snippet,
            threadId: recipientThreadId ?? input.threadId ?? null,
            inReplyTo: input.inReplyTo ?? null,
            hasAttachments,
            attachments: input.attachments ?? [],
            isRead: false,
            isSent: false,
            isDraft: false,
            receivedAt: new Date(),
            messageId: input.messageId ?? null,
            messageKind: toMessageKind(input.messageKind),
            deliveryStatus: 'delivered',
            // Internal delivery is immediate: the copy lands in the recipient's
            // mailbox the moment it is created. (Ticks only render on the
            // sender's outbound copy; this keeps the recipient's own record
            // honest if it is ever surfaced.)
            deliveredAt: new Date(),
          } as never,
        });
        await emitOutbox(tx, {
          event: MailOutboxEvents.messageReceived,
          aggregateType: 'Email',
          aggregateId: copy.id,
          payload: {
            userId: recipient.id,
            threadId: (copy as { threadId?: string | null }).threadId ?? null,
            messageId: input.messageId ?? null,
            deliveryStatus: 'delivered',
          },
        });
        return copy;
      });
      // P0 fix: run the recipient's filters on internally delivered mail.
      // Previously filters only ran (when wired at all) on the external
      // inbound path, so a QuantMail-to-QuantMail message — including a
      // self-send — never got starred/labeled/moved automatically.
      await this.applyRecipientFilters(recipient.id, created.id, {
        fromAddress: senderEmail,
        toAddresses: input.toAddresses,
        subject: input.subject,
        bodyPlain: input.bodyPlain ?? null,
        bodyHtml: input.bodyHtml ?? null,
        hasAttachments,
      });
      delivered++;
    }
    return delivered;
  }

  /**
   * Evaluate the recipient's enabled mail filters against a newly delivered
   * internal message and apply the resolved actions. Best-effort: a filter
   * failure must never break delivery of the (already persisted) message.
   */
  private async applyRecipientFilters(
    recipientId: string,
    emailId: string,
    email: {
      fromAddress: string;
      toAddresses: string[];
      subject: string;
      bodyPlain?: string | null;
      bodyHtml?: string | null;
      hasAttachments: boolean;
    },
  ): Promise<void> {
    try {
      const filters = new MailFilterService(this.prisma);
      const actions = await filters.computeActions(recipientId, email);
      if (actions.matchedFilterIds.length === 0) return;

      const data: Record<string, unknown> = {};
      if (actions.markRead) data['isRead'] = true;
      if (actions.star) data['isStarred'] = true;
      if (actions.addLabelIds.length > 0) data['labels'] = actions.addLabelIds;

      const folderDelegate = (
        this.prisma as unknown as {
          emailFolder?: { findFirst(a: unknown): Promise<{ id: string } | null> };
          folder?: { findFirst(a: unknown): Promise<{ id: string } | null> };
        }
      ).emailFolder ?? (this.prisma as unknown as {
        folder?: { findFirst(a: unknown): Promise<{ id: string } | null> };
      }).folder;
      const folderIdFor = async (type: string): Promise<string | null> => {
        if (!folderDelegate) return null;
        return (
          (await folderDelegate.findFirst({ where: { userId: recipientId, type } }).catch(() => null))
            ?.id ?? null
        );
      };

      // Routing — highest-precedence destination wins (mirrors inbound ingest).
      if (actions.delete) {
        data['isTrash'] = true;
        const trashId = await folderIdFor('TRASH');
        if (trashId) data['folderId'] = trashId;
      } else if (actions.markSpam) {
        data['isSpam'] = true;
        const spamId = await folderIdFor('SPAM');
        if (spamId) data['folderId'] = spamId;
      } else if (actions.archive) {
        const archiveId = await folderIdFor('ARCHIVE');
        if (archiveId) data['folderId'] = archiveId;
      } else if (actions.moveToFolderId) {
        data['folderId'] = actions.moveToFolderId;
      }

      if (Object.keys(data).length === 0) return;
      await this.prisma.email.update({ where: { id: emailId }, data: data as never });
    } catch {
      // Swallow: filters are best-effort on top of completed delivery.
    }
  }

  async send(
    userId: string,
    emailId: string,
    sentFolderId: string,
    options?: { delayMs?: number; sendAt?: Date } & MutationOptions,
  ): Promise<Email> {
    // QM-BACK-002: requestId correlates this send across logs + outbox events.
    const sendRequestId = options?.requestId ?? resolveRequestId();
    // Sending has to do three things for the message to actually reach a human:
    //   1. Recipients that are QuantMail users get an internal mailbox copy
    //      (the route calls `deliverInternally` for that).
    //   2. External recipients (Gmail, Outlook, ...) are handed to the durable
    //      BullMQ pipeline when it is wired, AND transmitted immediately via SES
    //      so mail leaves even when no outbound worker process is running.
    //   3. The draft is always flipped into a real Sent message, otherwise the
    //      UI keeps showing a "sent" mail as an unsent draft.
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized to send this email', 403, 'FORBIDDEN');
    }

    const sender = await (
      this.prisma as unknown as {
        user: {
          findUnique(
            a: unknown,
          ): Promise<{ email: string; displayName: string | null; username: string | null } | null>;
        };
      }
    ).user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, username: true },
    });

    const hasValidSender = Boolean(sender?.email?.includes('@') || sender?.username);
    if (!hasValidSender) {
      throw createAppError(
        'User has no valid sender identity configured',
        400,
        'INVALID_SENDER_IDENTITY',
      );
    }

    const asAddressList = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      }
      if (typeof value === 'string' && value.trim().length > 0) return [value];
      return [];
    };

    const recipients = Array.from(
      new Set(
        [
          ...asAddressList((email as { toAddresses?: unknown }).toAddresses),
          ...asAddressList((email as { ccAddresses?: unknown }).ccAddresses),
          ...asAddressList((email as { bccAddresses?: unknown }).bccAddresses),
        ].map((a) => a.trim().toLowerCase()),
      ),
    );

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
        internal = [];
      }
    }
    const toList = asAddressList((email as { toAddresses?: unknown }).toAddresses).map((a) =>
      a.trim().toLowerCase(),
    );
    const ccList = asAddressList((email as { ccAddresses?: unknown }).ccAddresses).map((a) =>
      a.trim().toLowerCase(),
    );
    const bccList = asAddressList((email as { bccAddresses?: unknown }).bccAddresses).map((a) =>
      a.trim().toLowerCase(),
    );

    let externalTo = toList.filter((address) => !internal.includes(address));
    let externalCc = ccList.filter((address) => !internal.includes(address));
    let externalBcc = bccList.filter((address) => !internal.includes(address));
    let external = [...externalTo, ...externalCc, ...externalBcc];

    // Gate 4: Hard-block outbound delivery if all recipients are suppressed.
    // Prune suppressed addresses to protect AWS SES reputation (< 5% bounce / 0.1% complaint).
    if (external.length > 0) {
      const activeSuppression = this.suppression ?? suppressionService;
      const { allowed, suppressed } = await activeSuppression.filterAllowedRecipients(external);
      if (suppressed.length > 0) {
        if (allowed.length === 0 && internal.length === 0) {
          throw createAppError(
            `Delivery blocked: all recipients are on the suppression list due to previous bounces or complaints (${suppressed.join(', ')})`,
            422,
            'RECIPIENT_SUPPRESSED',
          );
        }
        externalTo = externalTo.filter((addr) => allowed.includes(addr));
        externalCc = externalCc.filter((addr) => allowed.includes(addr));
        externalBcc = externalBcc.filter((addr) => allowed.includes(addr));
        external = [...externalTo, ...externalCc, ...externalBcc];
      }
    }

    let deliveryStatus = 'delivered';
    let deliveryError: string | undefined;

    if (external.length > 0 || (options?.delayMs && options.delayMs > 0)) {
      deliveryStatus = 'queued';

      // MAIL-01: Single authoritative delivery owner. When the durable BullMQ pipeline
      // is available, delegate delivery to the worker. Do NOT also submit via SES directly.
      let enqueued = false;
      if (this.pipeline) {
        try {
          await this.pipeline.enqueueSend(userId, emailId, {
            sentFolderId,
            delayMs: options?.delayMs,
          });
          enqueued = true;
        } catch (error) {
          deliveryError = error instanceof Error ? error.message : String(error);
        }
      }

      // Direct SES fallback ONLY when no queue pipeline is running and NOT delayed
      if (!enqueued && !options?.delayMs && isSesConfigured()) {
        try {
          const fromDomain = process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.in';
          let fromAddress = email.fromAddress;
          if (!fromAddress || !fromAddress.includes('@')) {
            fromAddress = `${fromAddress || 'noreply'}@${fromDomain}`;
          }
          const from = email.fromName ? `${email.fromName} <${fromAddress}>` : fromAddress;

          const bodyHtmlClean =
            email.bodyHtml && email.bodyHtml.trim().length > 0 ? email.bodyHtml : undefined;
          const bodyPlainClean =
            email.bodyPlain && email.bodyPlain.trim().length > 0 ? email.bodyPlain : undefined;

          // MAIL-03: Separate envelope Bcc from visible To/Cc headers.
          // MAIL-06: Support plain text fallback when HTML is empty.
          await sendViaSes({
            from,
            /*
             * SESv2 SendEmail takes real addresses in Destination.ToAddresses.
             * `undisclosed-recipients:;` is RFC 5322 header-group syntax, not an
             * address, and the API rejects the whole call when it appears here —
             * which is why a Bcc-only external send failed on this path while the
             * route-level helper (removed in M01) got it right. An empty To with a
             * populated Bcc is valid and is exactly what a Bcc-only send needs.
             */
            to: externalTo,
            cc: externalCc.length > 0 ? externalCc : undefined,
            bcc: externalBcc.length > 0 ? externalBcc : undefined,
            subject: email.subject,
            ...(bodyHtmlClean ? { bodyHtml: bodyHtmlClean } : {}),
            ...(bodyPlainClean ? { bodyText: bodyPlainClean } : {}),
            replyTo: fromAddress,
          });
          deliveryStatus = 'delivered';
          deliveryError = undefined;
        } catch (error) {
          deliveryError = error instanceof Error ? error.message : String(error);
          /*
           * 'deferred', not 'failed': 'failed' is not a member of the
           * EmailDeliveryStatus enum (draft | queued | sent | deferred |
           * bounced | delivered), so Prisma rejects the final update below and
           * the draft is never flipped into a Sent message. 'deferred' is the
           * design's transient-failure state and keeps the undo window open
           * for a manual retry. (Matches main's fix from Muse's QA round.)
           */
          deliveryStatus = 'deferred';
          // eslint-disable-next-line no-console
          console.error(
            `[EmailService.send: SES delivery failed] emailId=${emailId} userId=${userId}: ${deliveryError}`,
          );
        }
      } else if (!enqueued) {
        // CUST-P0-2: never fake a successful send. No queue job was created
        // and no immediate SES fallback applies here (delayed sends must not
        // fire SES directly, or the undo window becomes a lie), so nothing
        // will ever deliver this message. Flipping it to Sent with a
        // 'deferred' status was a silent failure: the UI announced
        // "Message sent" while the mail sat undeliverable with no transport.
        // Throw a real, retryable error instead — the draft stays a draft
        // and the client surfaces the actual reason to the user.
        const reason =
          deliveryError ?? 'No outbound transport configured (queue unavailable, SES env missing)';
        // eslint-disable-next-line no-console
        console.error(
          `[EmailService.send: No outbound transport] emailId=${emailId} userId=${userId}: ${reason}`,
        );
        throw createAppError(
          `Email could not be sent: ${reason}. It remains a draft — please try again.`,
          503,
          'DELIVERY_QUEUE_UNAVAILABLE',
        );
      }
    }

    const sentAt = options?.sendAt ?? new Date();
    /*
     * Cross-mailbox read receipts need one stable identity for the message that
     * both the sender's Sent copy and every recipient's inbox copy share.
     * `deliverInternally` stamps this same value on the recipient copies, and
     * `ThreadService.markThreadRead` uses it to propagate `readAt` back to the
     * sender's copy when a recipient opens the thread. Generated once here so a
     * re-send keeps the same identity.
     */
    const messageId =
      (email as { messageId?: string | null }).messageId ?? `<${emailId}@quantmail.in>`;
    // K1: sent-flip + outbox row in ONE transaction (doc 05). The event mirrors
    // the deliveryStatus recorded here: queued (durable pipeline), submitted
    // (handed to the provider / delivered immediately), deferred (transient
    // provider failure, retryable). Spec: delivery-events.md.
    const updated = await this.prisma.$transaction(async (tx) => {
      // QM-BACK-002: atomic conditional update — a concurrent writer loses
      // with VERSION_CONFLICT instead of silently overwriting the send flip.
      const flipped = await versionedUpdate<Email>(tx as unknown as VersionedTx, {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: options?.expectedVersion,
        data: {
          isDraft: false,
          isSent: true,
          folderId: sentFolderId,
          sentAt,
          messageId,
          /*
           * A sent copy needs a timeline position, not just a send time.
           *
           * The unified inbox is one list ordered by `receivedAt`, and this column
           * was left null on every message the user sent — so their own messages had
           * no place in that order at all and never appeared beside the conversation
           * they belong to. `sentAt` is when the message entered this mailbox, so it
           * is the honest value. An existing `receivedAt` is never overwritten,
           * which keeps a scheduled or re-sent message on its original timeline.
           */
          receivedAt: (email as { receivedAt?: Date | null }).receivedAt ?? sentAt,
          deliveryStatus,
          /*
           * Read-receipt pipeline: the message is delivered the moment this send
           * completes (internal recipients get their copies below; external SES
           * delivery succeeded above). A queued/deferred send leaves
           * `deliveredAt` null until the delivery worker's finalizeEmailState
           * stamps it on completion.
           */
          ...(deliveryStatus === 'delivered' ? { deliveredAt: sentAt } : {}),
        },
      });
      await emitOutbox(tx, {
        event:
          deliveryStatus === 'queued'
            ? MailOutboxEvents.outboundQueued
            : deliveryStatus === 'deferred'
              ? MailOutboxEvents.outboundDeferred
              : MailOutboxEvents.outboundSubmitted,
        aggregateType: 'Email',
        aggregateId: emailId,
        payload: {
          userId,
          threadId: (flipped as { threadId?: string | null }).threadId ?? null,
          messageId,
          deliveryStatus,
          requestId: sendRequestId,
        },
      });
      return flipped;
    });

    return updated;
  }

  async undoSend(
    userId: string,
    emailId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    // QM-BACK-002: requestId correlates the undo across logs + outbox events.
    const requestId = opts?.requestId ?? resolveRequestId();
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    const isQueuedOrSending =
      email.deliveryStatus === 'queued' || email.deliveryStatus === 'sending';
    const isWithinUndoWindow =
      Boolean(email.sentAt) &&
      Date.now() - new Date(email.sentAt!).getTime() <= 30_000 &&
      email.deliveryStatus !== 'delivered' &&
      email.deliveryStatus !== 'failed';

    if (!isQueuedOrSending && !isWithinUndoWindow) {
      throw createAppError(
        'Email cannot be undone (not queued or undo window expired)',
        400,
        'CANNOT_UNDO_SEND',
      );
    }

    if (this.pipeline) {
      await this.pipeline.cancelSend(userId, emailId).catch(() => {});
    }

    const draftsFolder = await (this.prisma as any).emailFolder?.findFirst({
      where: { userId, OR: [{ name: 'Drafts' }, { type: 'DRAFTS' }] },
    });

    // K1: undo flip + outbox row in ONE transaction (doc 05).
    // QM-BACK-002: atomic conditional update — concurrent undo/send races
    // surface as VERSION_CONFLICT instead of a silent lost update.
    return this.prisma.$transaction(async (tx) => {
      const undone = await versionedUpdate<Email>(tx as unknown as VersionedTx, {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: opts?.expectedVersion,
        data: {
          isDraft: true,
          isSent: false,
          sentAt: null,
          deliveryStatus: 'draft',
          folderId: draftsFolder?.id ?? null,
        },
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.outboundCancelled,
        aggregateType: 'Email',
        aggregateId: emailId,
        payload: {
          userId,
          threadId: (undone as { threadId?: string | null }).threadId ?? null,
          requestId,
        },
      });
      return undone;
    });
  }

  async receive(input: ReceiveEmailInput): Promise<Email> {
    // K1: inbound message row + outbox row in ONE transaction (doc 05).
    // Called by the InboundIngestAdapter for every accepted inbound message.
    return this.prisma.$transaction(async (tx) => {
      const email = await tx.email.create({
        data: {
          userId: input.userId,
          folderId: input.folderId,
          fromAddress: input.fromAddress,
          fromName: input.fromName ?? null,
          toAddresses: input.toAddresses,
          ccAddresses: input.ccAddresses ?? [],
          bccAddresses: input.bccAddresses ?? [],
          subject: input.subject,
          bodyHtml: input.bodyHtml ?? '',
          bodyPlain: input.bodyPlain ?? '',
          snippet: input.snippet ?? '',
          threadId: input.threadId ?? null,
          inReplyTo: input.inReplyTo ?? null,
          hasAttachments: input.hasAttachments ?? false,
          attachments: input.attachments ?? [],
          receivedAt: input.receivedAt ?? new Date(),
          isRead: false,
          // Additive inbound fields (QuantMail SuperHub Pillar 1, Reqs 5.1/5.3).
          ...(input.authResults !== undefined ? { authResults: input.authResults } : {}),
          ...(input.isSpam !== undefined ? { isSpam: input.isSpam } : {}),
          ...(input.deliveryStatus !== undefined ? { deliveryStatus: input.deliveryStatus } : {}),
          ...(input.aiCategory !== undefined ? { aiCategory: input.aiCategory } : {}),
        } as never,
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.messageReceived,
        aggregateType: 'Email',
        aggregateId: email.id,
        payload: {
          userId: input.userId,
          threadId: input.threadId ?? null,
          folderId: input.folderId,
          deliveryStatus: input.deliveryStatus ?? 'delivered',
          isSpam: input.isSpam ?? false,
        },
      });
      return email;
    });
  }

  async getEmail(emailId: string, userId: string): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized to access this email', 403, 'FORBIDDEN');
    }

    return email;
  }

  async listByFolder(
    userId: string,
    folderId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Email>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.email.findMany({
        where: { userId, folderId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.email.count({ where: { userId, folderId, deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async moveToFolder(
    emailId: string,
    folderId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // QM-BACK-002: atomic conditional update; concurrent movers get
    // VERSION_CONFLICT instead of a silent lost update.
    return versionedUpdate<Email>(this.prisma as unknown as VersionedTx, {
      id: emailId,
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      expectedVersion: opts?.expectedVersion,
      data: { folderId },
    });
  }

  async archive(
    emailId: string,
    archiveFolderId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // QM-BACK-002: requestId correlates the archive across logs + outbox.
    const requestId = opts?.requestId ?? resolveRequestId();
    // K1: archive move + outbox row in ONE transaction (doc 05).
    // QM-BACK-002: atomic conditional update (VERSION_CONFLICT on races).
    return this.prisma.$transaction(async (tx) => {
      const archived = await versionedUpdate<Email>(tx as unknown as VersionedTx, {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: opts?.expectedVersion,
        data: { folderId: archiveFolderId },
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.threadArchived,
        aggregateType: 'EmailThread',
        aggregateId:
          (archived as { threadId?: string | null }).threadId ?? archived.id,
        payload: {
          userId,
          emailId,
          folderId: archiveFolderId,
          requestId,
        },
      });
      return archived as Email;
    });
  }

  async delete(
    emailId: string,
    userId: string,
    hard = false,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // Preserve history: deleting from the inbox moves the message to trash;
    // deleting an already-trashed message records a logical permanent deletion.
    // K1: delete/trash + outbox row in ONE transaction (doc 05).
    const permanent = Boolean(email.isTrash || hard);
    // QM-BACK-002: requestId correlates the delete across logs + outbox.
    const requestId = opts?.requestId ?? resolveRequestId();
    // QM-BACK-002: atomic conditional update (VERSION_CONFLICT on races).
    return this.prisma.$transaction(async (tx) => {
      const deleted = await versionedUpdate<Email>(tx as unknown as VersionedTx, {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: opts?.expectedVersion,
        data: permanent ? { deletedAt: new Date() } : { deletedAt: null, isTrash: true },
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.messageDeleted,
        aggregateType: 'Email',
        aggregateId: emailId,
        payload: {
          userId,
          threadId: (email as { threadId?: string | null }).threadId ?? null,
          hard: permanent,
          requestId,
        },
      });
      return deleted as Email;
    });
  }

  async markRead(
    emailId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const now = new Date();
    // QM-BACK-002: atomic conditional update; the version bump keeps the
    // column truthful for later guarded writes.
    const updated = await versionedUpdate<Email>(
      this.prisma as unknown as VersionedTx,
      {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: opts?.expectedVersion,
        data: { isRead: true, readAt: now },
      },
    );

    // Read-receipt pipeline: a received message being read flips the sender's
    // ticks to double-green. The sender's sent copy shares this messageId
    // (stamped by send()/deliverInternally).
    const messageId = (email as { messageId?: string | null }).messageId;
    const isReceived = !(email as { isSent?: boolean }).isSent;
    if (messageId && isReceived) {
      await this.prisma.email
        .updateMany({
          where: { messageId, isSent: true, readAt: null, deletedAt: null },
          data: { readAt: now, version: { increment: 1 } },
        })
        .catch(() => {
          // Best-effort: the read itself already succeeded.
        });
    }

    return updated;
  }

  async markStarred(
    emailId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // QM-BACK-002: atomic conditional update (VERSION_CONFLICT on races).
    return versionedUpdate<Email>(this.prisma as unknown as VersionedTx, {
      id: emailId,
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      expectedVersion: opts?.expectedVersion,
      data: { isStarred: !email.isStarred },
    });
  }

  /**
   * Toggle pin-to-top for an email. Pin is independent from star: starring
   * marks importance, pinning holds the conversation at the top of the list.
   */
  async togglePin(
    emailId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // QM-BACK-002: atomic conditional update (VERSION_CONFLICT on races).
    return versionedUpdate<Email>(this.prisma as unknown as VersionedTx, {
      id: emailId,
      resource: 'Email',
      notFoundCode: 'EMAIL_NOT_FOUND',
      notFoundMessage: 'Email not found',
      expectedVersion: opts?.expectedVersion,
      data: { isPinned: !(email as { isPinned?: boolean }).isPinned },
    });
  }

  /**
   * Reassign every owner-local row represented by one UI conversation. The
   * anchor must be present in the request and every requested row must belong to
   * the same caller; the transaction rejects the whole correction otherwise.
   */
  async setCategory(
    anchorEmailId: string,
    emailIds: string[],
    userId: string,
    category: string,
    opts?: MutationOptions,
  ): Promise<{ updated: number; emails: Email[] }> {
    const ids = Array.from(new Set(emailIds.filter(Boolean)));
    if (!ids.includes(anchorEmailId) || ids.length === 0) {
      throw createAppError('Conversation email ids are invalid', 400, 'INVALID_EMAIL_IDS');
    }

    // QM-BACK-002: per-id optimistic guards when the caller supplies
    // expectedVersions. Ownership is verified up front (same as the bulk
    // path); the first VERSION_CONFLICT aborts the whole batch.
    if (opts?.expectedVersions) {
      const versions = opts.expectedVersions;
      return this.prisma.$transaction(async (transaction) => {
        const owned = await transaction.email.findMany({
          where: { id: { in: ids }, userId, deletedAt: null },
        });
        if (owned.length !== ids.length) {
          throw createAppError('Email conversation not found', 404, 'EMAIL_NOT_FOUND');
        }
        const rows: Email[] = [];
        for (const id of ids) {
          const row = await versionedUpdate<Email>(transaction as unknown as VersionedTx, {
            id,
            resource: 'Email',
            notFoundCode: 'EMAIL_NOT_FOUND',
            notFoundMessage: 'Email conversation not found',
            expectedVersion: versions[id],
            data: { aiCategory: category, updatedAt: new Date() },
          });
          rows.push(row);
        }
        return { updated: rows.length, emails: rows };
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const emails = await transaction.email.findMany({
        where: { id: { in: ids }, userId, deletedAt: null },
      });
      if (emails.length !== ids.length) {
        // One generic answer for absent and other-tenant rows: no id oracle.
        throw createAppError('Email conversation not found', 404, 'EMAIL_NOT_FOUND');
      }

      const result = await transaction.email.updateMany({
        where: { id: { in: ids }, userId, deletedAt: null },
        // QM-BACK-002: keep the version column truthful on batch writes.
        data: { aiCategory: category, updatedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== ids.length) {
        throw createAppError(
          'Email conversation changed while it was being categorized',
          409,
          'CATEGORY_CONFLICT',
        );
      }

      return {
        updated: result.count,
        emails: emails.map((email) => ({ ...email, aiCategory: category })),
      };
    });
  }

  /**
   * QM-BACK-002: run a per-item guarded mutation for every id inside ONE
   * transaction. Ids with an entry in `expectedVersions` are guarded with the
   * atomic conditional update; ids without are written unguarded. The first
   * VERSION_CONFLICT aborts the whole batch so the caller can re-read and
   * retry — a partial batch would leave the client unable to reconcile.
   */
  private async guardedBatch(
    emailIds: string[],
    opts: MutationOptions,
    mutate: (
      tx: VersionedTx,
      id: string,
      expectedVersion: number | undefined,
    ) => Promise<unknown>,
  ): Promise<{ count: number }> {
    const ids = Array.from(new Set(emailIds.filter(Boolean)));
    const versions = opts.expectedVersions ?? {};
    await this.prisma.$transaction(async (tx) => {
      for (const id of ids) {
        await mutate(tx as unknown as VersionedTx, id, versions[id]);
      }
    });
    return { count: ids.length };
  }

  async batchMarkRead(
    emailIds: string[],
    userId: string,
    isRead = true,
    opts?: MutationOptions,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    // QM-BACK-002: per-id guards when the caller supplies expectedVersions;
    // the fast path still bumps versions so the column stays truthful.
    if (opts?.expectedVersions) {
      return this.guardedBatch(emailIds, opts, (tx, id, expectedVersion) =>
        versionedUpdate<Email>(tx, {
          id,
          resource: 'Email',
          notFoundCode: 'EMAIL_NOT_FOUND',
          notFoundMessage: 'Email not found',
          expectedVersion,
          data: { isRead },
        }),
      );
    }
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        userId,
        deletedAt: null,
      },
      data: { isRead, updatedAt: new Date(), version: { increment: 1 } },
    });
    return { count: result.count };
  }

  async batchArchive(
    emailIds: string[],
    archiveFolderId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    // QM-BACK-002: per-id guards when the caller supplies expectedVersions.
    if (opts?.expectedVersions) {
      return this.guardedBatch(emailIds, opts, (tx, id, expectedVersion) =>
        versionedUpdate<Email>(tx, {
          id,
          resource: 'Email',
          notFoundCode: 'EMAIL_NOT_FOUND',
          notFoundMessage: 'Email not found',
          expectedVersion,
          data: { folderId: archiveFolderId },
        }),
      );
    }
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        userId,
        deletedAt: null,
      },
      data: { folderId: archiveFolderId, updatedAt: new Date(), version: { increment: 1 } },
    });
    return { count: result.count };
  }

  async batchDelete(
    emailIds: string[],
    userId: string,
    hard = false,
    opts?: MutationOptions,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    // QM-BACK-002: per-id guards when the caller supplies expectedVersions.
    if (opts?.expectedVersions) {
      return this.guardedBatch(emailIds, opts, (tx, id, expectedVersion) =>
        versionedUpdate<Email>(tx, {
          id,
          resource: 'Email',
          notFoundCode: 'EMAIL_NOT_FOUND',
          notFoundMessage: 'Email not found',
          expectedVersion,
          data: hard ? { deletedAt: new Date() } : { isTrash: true },
        }),
      );
    }
    if (hard) {
      const result = await this.prisma.email.updateMany({
        where: { id: { in: emailIds }, userId },
        data: { deletedAt: new Date(), updatedAt: new Date(), version: { increment: 1 } },
      });
      return { count: result.count };
    }
    const result = await this.prisma.email.updateMany({
      where: { id: { in: emailIds }, userId, deletedAt: null },
      data: { isTrash: true, updatedAt: new Date(), version: { increment: 1 } },
    });
    return { count: result.count };
  }

  async batchStar(
    emailIds: string[],
    userId: string,
    isStarred = true,
    opts?: MutationOptions,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    // QM-BACK-002: per-id guards when the caller supplies expectedVersions.
    if (opts?.expectedVersions) {
      return this.guardedBatch(emailIds, opts, (tx, id, expectedVersion) =>
        versionedUpdate<Email>(tx, {
          id,
          resource: 'Email',
          notFoundCode: 'EMAIL_NOT_FOUND',
          notFoundMessage: 'Email not found',
          expectedVersion,
          data: { isStarred },
        }),
      );
    }
    const result = await this.prisma.email.updateMany({
      where: { id: { in: emailIds }, userId, deletedAt: null },
      data: { isStarred, updatedAt: new Date(), version: { increment: 1 } },
    });
    return { count: result.count };
  }

  async search(
    userId: string,
    query: string,
    options: PaginationOptions = {},
    filters: EmailSearchFilters = {},
  ): Promise<PaginatedResult<Email>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Trash and spam stay out. A search is a way of finding mail you filed, not of
    // exhuming mail you threw away — the same line the thread view draws when it
    // resolves a conversation over INBOX ∪ ARCHIVE.
    //
    // `toAddresses` is a `Json` array, so Postgres can only be asked for an exact
    // element (`array_contains`, the pattern `search-query.service.ts` already uses for
    // `to:`): pasting a full address finds what you sent them. A substring of a
    // recipient — typing `kundan` to find the thread you wrote to
    // `kundansinghrajput…@gmail.com` — is matched client-side by
    // `filterThreadsByQuery`, which reads the recipients the loaded corpus already has.
    const where: Record<string, unknown> = {
      userId,
      deletedAt: null,
      isTrash: false,
      isSpam: false,
      OR: [
        { subject: { contains: query, mode: 'insensitive' as const } },
        { bodyPlain: { contains: query, mode: 'insensitive' as const } },
        { fromAddress: { contains: query, mode: 'insensitive' as const } },
        { fromName: { contains: query, mode: 'insensitive' as const } },
        { toAddresses: { array_contains: query } },
        { ccAddresses: { array_contains: query } },
      ],
    };

    // --- Advanced search filters (ANDed with the free-text match) ------------
    // These are the server-side half of the /search page's filter chips
    // (From / To / Has attachment / Label / Since). The search route used to
    // strip every one of them, so the chips were cosmetic — applying
    // `From:kundan` left the result count unchanged.
    const andClauses: Record<string, unknown>[] = [];

    const from = filters.from?.trim();
    if (from) {
      andClauses.push({
        OR: [
          { fromAddress: { contains: from, mode: 'insensitive' as const } },
          { fromName: { contains: from, mode: 'insensitive' as const } },
        ],
      });
    }

    const to = filters.to?.trim();
    if (to && to.includes('@')) {
      // A full address: exact element match is all Postgres can do on the Json
      // array, and it is exactly right here. A bare fragment (`kundan`) is
      // deliberately NOT filtered server-side — exact matching would return
      // zero rows — the frontend hook applies substring matching on the
      // returned set instead.
      andClauses.push({
        OR: [
          { toAddresses: { array_contains: to } },
          { ccAddresses: { array_contains: to } },
          { bccAddresses: { array_contains: to } },
        ],
      });
    }

    if (filters.hasAttachment === true) {
      where.hasAttachments = true;
    }

    const subjectFilter = filters.subject?.trim();
    if (subjectFilter) {
      andClauses.push({
        subject: { contains: subjectFilter, mode: 'insensitive' as const },
      });
    }

    const dateFrom = parseSearchDate(filters.dateFrom);
    const dateTo = parseSearchDate(filters.dateTo, true);
    if (dateFrom || dateTo) {
      where.receivedAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    if (filters.label?.trim()) {
      const labelId = await this.resolveLabelId(userId, filters.label.trim());
      // An unresolvable label name matches nothing: the sentinel can never be
      // a real label id, so the filter correctly yields zero rows.
      where.labels = { array_contains: labelId ?? ' ' };
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const [data, total] = await Promise.all([
      this.prisma.email.findMany({
        where: where as never,
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.email.count({ where: where as never }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async sendEmail(
    userId: string,
    data: Omit<ComposeEmailInput, 'userId'>,
    sentFolderId: string,
  ): Promise<Email> {
    const draft = await this.compose({ ...data, userId });
    return this.send(userId, draft.id, sentFolderId);
  }

  async getInbox(
    userId: string,
    inboxFolderId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Email>> {
    return this.listByFolder(userId, inboxFolderId, options);
  }

  async trashEmail(emailId: string, userId: string): Promise<Email> {
    return this.delete(emailId, userId, false);
  }

  async starEmail(emailId: string, userId: string): Promise<Email> {
    return this.markStarred(emailId, userId);
  }

  async searchEmails(
    userId: string,
    query: string,
    options: PaginationOptions = {},
    filters: EmailSearchFilters = {},
  ): Promise<PaginatedResult<Email>> {
    return this.search(userId, query, options, filters);
  }

  async getLabels(userId: string): Promise<Label[]> {
    return (
      this.prisma as never as { label: { findMany: (args: unknown) => Promise<Label[]> } }
    ).label.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Resolves a label *name* (what the search UI's Label chip collects) to its
   * id, because emails store label ids in their `labels` Json array. Name
   * matching is case-insensitive so "Work" finds the "work" label. Returns
   * undefined when no label matches, and the search then matches zero rows
   * rather than silently ignoring the filter.
   */
  private async resolveLabelId(userId: string, name: string): Promise<string | undefined> {
    const labels = await this.getLabels(userId);
    const match =
      labels.find((l) => l.name === name) ??
      labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    return match?.id;
  }

  async applyLabel(
    emailId: string,
    labelId: string,
    userId: string,
    opts?: MutationOptions,
  ): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const currentLabels = (email as unknown as { labels: string[] }).labels ?? [];
    if (currentLabels.includes(labelId)) {
      return email;
    }

    // K1: label change + outbox row in ONE transaction (doc 05).
    const nextLabels = [...currentLabels, labelId];
    // QM-BACK-002: requestId correlates the label change across logs + outbox.
    const requestId = opts?.requestId ?? resolveRequestId();
    // QM-BACK-002: atomic conditional update (VERSION_CONFLICT on races).
    return this.prisma.$transaction(async (tx) => {
      const updated = await versionedUpdate<Email>(tx as unknown as VersionedTx, {
        id: emailId,
        resource: 'Email',
        notFoundCode: 'EMAIL_NOT_FOUND',
        notFoundMessage: 'Email not found',
        expectedVersion: opts?.expectedVersion,
        data: { labels: nextLabels },
      });
      await emitOutbox(tx, {
        event: MailOutboxEvents.threadLabelChanged,
        aggregateType: 'EmailThread',
        aggregateId: (email as { threadId?: string | null }).threadId ?? emailId,
        payload: {
          userId,
          emailId,
          labelId,
          labels: nextLabels,
          requestId,
        },
      });
      return updated as Email;
    });
  }
}
