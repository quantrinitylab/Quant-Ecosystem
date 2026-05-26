import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  share: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
}

export type SharePermission = 'read' | 'write';
export type ShareStatus = 'pending' | 'accepted' | 'revoked';

export interface ShareRecord {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerUserId: string;
  sharedWithUserId: string;
  encryptedFileKey: string;
  permission: SharePermission;
  status: ShareStatus;
  createdAt: Date;
}

export interface ShareFileInput {
  fileId: string;
  ownerUserId: string;
  sharedWithUserId: string;
  encryptedFileKey: string;
  permission: SharePermission;
}

export interface ShareFolderInput {
  folderId: string;
  ownerUserId: string;
  sharedWithUserId: string;
  encryptedFileKey: string;
  permission: SharePermission;
}

export class ShareService {
  constructor(private readonly prisma: PrismaClient) {}

  async shareFile(input: ShareFileInput): Promise<ShareRecord> {
    const recipient = await this.prisma.user.findUnique({
      where: { id: input.sharedWithUserId },
    });

    if (!recipient) {
      throw createAppError('Recipient user not found', 404, 'USER_NOT_FOUND');
    }

    const share = await this.prisma.share.create({
      data: {
        fileId: input.fileId,
        folderId: null,
        ownerUserId: input.ownerUserId,
        sharedWithUserId: input.sharedWithUserId,
        encryptedFileKey: input.encryptedFileKey,
        permission: input.permission,
        status: 'pending',
        createdAt: new Date(),
      },
    });

    return share as unknown as ShareRecord;
  }

  async shareFolder(input: ShareFolderInput): Promise<ShareRecord> {
    const recipient = await this.prisma.user.findUnique({
      where: { id: input.sharedWithUserId },
    });

    if (!recipient) {
      throw createAppError('Recipient user not found', 404, 'USER_NOT_FOUND');
    }

    const share = await this.prisma.share.create({
      data: {
        fileId: null,
        folderId: input.folderId,
        ownerUserId: input.ownerUserId,
        sharedWithUserId: input.sharedWithUserId,
        encryptedFileKey: input.encryptedFileKey,
        permission: input.permission,
        status: 'pending',
        createdAt: new Date(),
      },
    });

    return share as unknown as ShareRecord;
  }

  async acceptShare(shareId: string, userId: string): Promise<ShareRecord> {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });

    if (!share) {
      throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    }

    const record = share as unknown as ShareRecord;

    if (record.sharedWithUserId !== userId) {
      throw createAppError('Not authorized to accept this share', 403, 'UNAUTHORIZED');
    }

    if (record.status !== 'pending') {
      throw createAppError('Share is not in pending state', 400, 'INVALID_SHARE_STATUS');
    }

    const updated = await this.prisma.share.update({
      where: { id: shareId },
      data: { status: 'accepted' },
    });

    return updated as unknown as ShareRecord;
  }

  async revokeShare(shareId: string, userId: string): Promise<ShareRecord> {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });

    if (!share) {
      throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    }

    const record = share as unknown as ShareRecord;

    if (record.ownerUserId !== userId) {
      throw createAppError('Not authorized to revoke this share', 403, 'UNAUTHORIZED');
    }

    const updated = await this.prisma.share.update({
      where: { id: shareId },
      data: { status: 'revoked' },
    });

    return updated as unknown as ShareRecord;
  }

  async listShares(userId: string): Promise<ShareRecord[]> {
    const shares = await this.prisma.share.findMany({
      where: {
        OR: [{ ownerUserId: userId }, { sharedWithUserId: userId }],
      },
    });

    return shares as unknown as ShareRecord[];
  }

  async getShare(shareId: string, userId: string): Promise<ShareRecord> {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });

    if (!share) {
      throw createAppError('Share not found', 404, 'SHARE_NOT_FOUND');
    }

    const record = share as unknown as ShareRecord;

    if (record.ownerUserId !== userId && record.sharedWithUserId !== userId) {
      throw createAppError('Not authorized to access this share', 403, 'UNAUTHORIZED');
    }

    return record;
  }
}
