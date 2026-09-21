import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { OutboundDeliveryPipeline } from './outbound-delivery.service';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';
import { QUANT_INTERNAL_DOMAINS, isInternalDomain, getSenderDomain } from '../lib/domains';
import { SuppressionService } from './suppression.service';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
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

  /** Memoized suppression gate derived from the INJECTED prisma (see getter below). */
  private derivedSuppression?: SuppressionService;

  /**
   * Resolve the suppression gate for this instance.
   *
   * An explicitly injected `suppression` always wins. Otherwise we build a
   * `SuppressionService` over **this instance's own `prisma`** rather than falling back to the
   * module-level `suppressionService` singleton. That singleton is constructed with no client,
   * so it resolves `@quant/database`'s default `PrismaClient` — which meant a caller who
   * injected a mock or tenant-scoped client still had send-path suppression checks hit the
   * process-wide database and require `DATABASE_URL`. Deriving from `this.prisma` keeps the
   * injection seam honest end to end.
   */
  private get suppressionGate(): {
    filterAllowedRecipients(
      recipients: string[],
    ): Promise<{ allowed: string[]; suppressed: string[] }>;
  } {
    if (this.suppression) return this.suppression;
    this.derivedSuppression ??= new SuppressionService(
      this.prisma as unknown as ConstructorParameters<typeof SuppressionService>[0],
    );
    return this.derivedSuppression;
  }

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
    const email = await this.prisma.email.create({
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

      await this.prisma.email.create({
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
          messageKind: toMessageKind(input.messageKind),
          deliveryStatus: 'delivered',
        } as never,
      });
      delivered++;
    }
    return delivered;
  }

  async send(
    userId: string,
    emailId: string,
    sentFolderId: string,
    options?: { delayMs?: number; sendAt?: Date },
  ): Promise<Email> {
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
      const { allowed, suppressed } = await this.suppressionGate.filterAllowedRecipients(external);
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
          deliveryStatus = 'failed';
          // eslint-disable-next-line no-console
          console.error(
            `[EmailService.send: SES delivery failed] emailId=${emailId} userId=${userId}: ${deliveryError}`,
          );
        }
      } else if (!enqueued) {
        deliveryStatus = 'failed';
        deliveryError =
          deliveryError ?? 'No outbound transport configured (queue unavailable, SES env missing)';
        // eslint-disable-next-line no-console
        console.error(
          `[EmailService.send: No outbound transport] emailId=${emailId} userId=${userId}: ${deliveryError}`,
        );
      }
    }

    const sentAt = options?.sendAt ?? new Date();
    const updated = await this.prisma.email.update({
      where: { id: emailId },
      data: {
        isDraft: false,
        isSent: true,
        folderId: sentFolderId,
        sentAt,
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
      } as never,
    });

    return updated;
  }

  async undoSend(userId: string, emailId: string): Promise<Email> {
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

    return this.prisma.email.update({
      where: { id: emailId },
      data: {
        isDraft: true,
        isSent: false,
        sentAt: null,
        deliveryStatus: 'draft',
        folderId: draftsFolder?.id ?? null,
      } as never,
    });
  }

  async receive(input: ReceiveEmailInput): Promise<Email> {
    const email = await this.prisma.email.create({
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

    return email;
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

  async moveToFolder(emailId: string, folderId: string, userId: string): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return this.prisma.email.update({
      where: { id: emailId },
      data: { folderId },
    });
  }

  async archive(emailId: string, archiveFolderId: string, userId: string): Promise<Email> {
    return this.moveToFolder(emailId, archiveFolderId, userId);
  }

  async delete(emailId: string, userId: string, hard = false): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // Preserve history: deleting from the inbox moves the message to trash;
    // deleting an already-trashed message records a logical permanent deletion.
    return this.prisma.email.update({
      where: { id: emailId },
      data: email.isTrash || hard ? { deletedAt: new Date() } : { deletedAt: null, isTrash: true },
    });
  }

  async markRead(emailId: string, userId: string): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return this.prisma.email.update({
      where: { id: emailId },
      data: { isRead: true },
    });
  }

  async markStarred(emailId: string, userId: string): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return this.prisma.email.update({
      where: { id: emailId },
      data: { isStarred: !email.isStarred },
    });
  }

  /**
   * Reassign an owned email's inbox partition (`aiCategory`). Returns the
   * updated row so the caller can record the sender-keyed correction into the
   * user's learned-category memory. Ownership is enforced: a user can only
   * recategorize their own mail.
   */
  async setCategory(emailId: string, userId: string, category: string): Promise<Email> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });
    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }
    return this.prisma.email.update({
      where: { id: emailId },
      data: { aiCategory: category } as never,
    });
  }

  async batchMarkRead(
    emailIds: string[],
    userId: string,
    isRead = true,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        userId,
        deletedAt: null,
      },
      data: { isRead },
    });
    return { count: result.count };
  }

  async batchArchive(
    emailIds: string[],
    archiveFolderId: string,
    userId: string,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        userId,
        deletedAt: null,
      },
      data: { folderId: archiveFolderId },
    });
    return { count: result.count };
  }

  async batchDelete(emailIds: string[], userId: string, hard = false): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    if (hard) {
      const result = await this.prisma.email.updateMany({
        where: { id: { in: emailIds }, userId },
        data: { deletedAt: new Date() },
      });
      return { count: result.count };
    }
    const result = await this.prisma.email.updateMany({
      where: { id: { in: emailIds }, userId, deletedAt: null },
      data: { isTrash: true },
    });
    return { count: result.count };
  }

  async batchStar(
    emailIds: string[],
    userId: string,
    isStarred = true,
  ): Promise<{ count: number }> {
    if (emailIds.length === 0) return { count: 0 };
    const result = await this.prisma.email.updateMany({
      where: { id: { in: emailIds }, userId, deletedAt: null },
      data: { isStarred },
    });
    return { count: result.count };
  }

  async search(
    userId: string,
    query: string,
    options: PaginationOptions = {},
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
    const where = {
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

    const [data, total] = await Promise.all([
      this.prisma.email.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.email.count({ where }),
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
  ): Promise<PaginatedResult<Email>> {
    return this.search(userId, query, options);
  }

  async getLabels(userId: string): Promise<Label[]> {
    return (
      this.prisma as never as { label: { findMany: (args: unknown) => Promise<Label[]> } }
    ).label.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async applyLabel(emailId: string, labelId: string, userId: string): Promise<Email> {
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

    return this.prisma.email.update({
      where: { id: emailId },
      data: { labels: [...currentLabels, labelId] } as never,
    });
  }
}
