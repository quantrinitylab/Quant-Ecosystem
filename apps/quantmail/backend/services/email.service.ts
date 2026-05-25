import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';

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
}

export class EmailService {
  constructor(private readonly prisma: PrismaClient) {}

  async compose(input: ComposeEmailInput): Promise<Email> {
    const email = await this.prisma.email.create({
      data: {
        userId: input.userId,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses ?? [],
        bccAddresses: input.bccAddresses ?? [],
        subject: input.subject,
        bodyHtml: input.bodyHtml ?? '',
        bodyPlain: input.bodyPlain ?? '',
        fromAddress: '',
        isDraft: true,
        threadId: input.threadId ?? null,
        inReplyTo: input.inReplyTo ?? null,
        attachments: input.attachments ?? [],
      },
    });

    return email;
  }

  async send(userId: string, emailId: string, sentFolderId: string): Promise<Email> {
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
      },
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
}
