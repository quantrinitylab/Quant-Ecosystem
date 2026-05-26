import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  file: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
}

interface FileRecord {
  id: string;
  userId: string;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export class TrashService {
  constructor(private readonly prisma: PrismaClient) {}

  async moveToTrash(fileId: string, userId: string): Promise<unknown> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });

    if (!file) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const record = file as unknown as FileRecord;

    if (record.userId !== userId) {
      throw createAppError('Not authorized to access this file', 403, 'UNAUTHORIZED');
    }

    if (record.isDeleted) {
      throw createAppError('File is already in trash', 400, 'ALREADY_TRASHED');
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return updated;
  }

  async restoreFromTrash(fileId: string, userId: string): Promise<unknown> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });

    if (!file) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const record = file as unknown as FileRecord;

    if (record.userId !== userId) {
      throw createAppError('Not authorized to access this file', 403, 'UNAUTHORIZED');
    }

    if (!record.isDeleted) {
      throw createAppError('File is not in trash', 400, 'NOT_TRASHED');
    }

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: { isDeleted: false, deletedAt: null },
    });

    return updated;
  }

  async listTrash(userId: string): Promise<unknown[]> {
    const files = await this.prisma.file.findMany({
      where: { userId, isDeleted: true },
      orderBy: { deletedAt: 'desc' },
    });

    return files;
  }

  async emptyTrash(userId: string): Promise<number> {
    const result = await this.prisma.file.deleteMany({
      where: { userId, isDeleted: true },
    });

    return result.count;
  }

  async purgeExpired(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.file.deleteMany({
      where: {
        isDeleted: true,
        deletedAt: { lt: thirtyDaysAgo },
      },
    });

    return result.count;
  }
}
