import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { OutboundDeliveryPipeline } from './outbound-delivery.service';

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
  ) {}

  async compose(input: ComposeEmailInput): Promise<Email> {
    // Stamp the sender's own QuantMail address on the message so the Sent copy
    // (and internal delivery) shows a correct From instead of an empty string.
    const sender = await (
      this.prisma as unknown as {
        user: {
          findUnique(a: unknown): Promise<{ email: string; displayName: string | null } | null>;
        };
      }
    ).user.findUnique({
      where: { id: input.userId },
      select: { email: true, displayName: true },
    });

    const email = await this.prisma.email.create({
      data: {
        userId: input.userId,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses ?? [],
        bccAddresses: input.bccAddresses ?? [],
        subject: input.subject,
        bodyHtml: input.bodyHtml ?? '',
        bodyPlain: input.bodyPlain ?? '',
        fromAddress: sender?.email ?? '',
        fromName: sender?.displayName ?? null,
        isDraft: true,
        threadId: input.threadId ?? null,
        inReplyTo: input.inReplyTo ?? null,
        attachments: input.attachments ?? [],
      },
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
        findUnique(a: unknown): Promise<{ email: string; displayName: string | null } | null>;
        findMany(a: unknown): Promise<Array<{ id: string; email: string }>>;
      };
    };

    const sender = await userModel.user.findUnique({
      where: { id: input.fromUserId },
      select: { email: true, displayName: true },
    });
    const matches = await userModel.user.findMany({
      where: { email: { in: recipients } },
      select: { id: true, email: true },
    });

    const snippet = (input.bodyPlain ?? input.bodyHtml ?? '').replace(/<[^>]+>/g, '').slice(0, 140);

    let delivered = 0;
    for (const recipient of matches) {
      await this.prisma.email.create({
        data: {
          userId: recipient.id,
          folderId: null,
          fromAddress: sender?.email ?? '',
          fromName: sender?.displayName ?? null,
          toAddresses: input.toAddresses,
          ccAddresses: input.ccAddresses ?? [],
          bccAddresses: [],
          subject: input.subject,
          bodyHtml: input.bodyHtml ?? '',
          bodyPlain: input.bodyPlain ?? '',
          snippet,
          threadId: input.threadId ?? null,
          inReplyTo: input.inReplyTo ?? null,
          isRead: false,
          isSent: false,
          isDraft: false,
          receivedAt: new Date(),
          deliveryStatus: 'delivered',
        } as never,
      });
      delivered++;
    }
    return delivered;
  }

  async send(userId: string, emailId: string, sentFolderId: string): Promise<Email> {
    // When a durable delivery pipeline is wired in, sending a draft enqueues a
    // real BullMQ delivery job and advances deliveryStatus to `queued`
    // (Requirements 4.1/4.2). The pipeline enforces ownership and draft validity.
    if (this.pipeline) {
      await this.pipeline.enqueueSend(userId, emailId, { sentFolderId });
      const queued = await this.prisma.email.findUnique({ where: { id: emailId } });
      if (!queued) {
        throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
      }
      return queued;
    }

    // Backward-compatible fallback (no pipeline injected): legacy flag-flip send.
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized to send this email', 403, 'FORBIDDEN');
    }

    const updated = await this.prisma.email.update({
      where: { id: emailId },
      data: {
        isDraft: false,
        isSent: true,
        folderId: sentFolderId,
        sentAt: new Date(),
      },
    });

    return updated;
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

    if (hard) {
      return this.prisma.email.delete({ where: { id: emailId } });
    }

    return this.prisma.email.update({
      where: { id: emailId },
      data: { deletedAt: new Date(), isTrash: true },
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

  async search(
    userId: string,
    query: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Email>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = {
      userId,
      deletedAt: null,
      OR: [
        { subject: { contains: query, mode: 'insensitive' as const } },
        { bodyPlain: { contains: query, mode: 'insensitive' as const } },
        { fromAddress: { contains: query, mode: 'insensitive' as const } },
        { fromName: { contains: query, mode: 'insensitive' as const } },
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
