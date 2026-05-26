import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  fileVersion: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    deleteMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
  file: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  size: number;
  createdAt: Date;
}

export interface CreateVersionInput {
  fileId: string;
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  size: number;
  userId: string;
}

interface FileRecord {
  id: string;
  userId: string;
  isDeleted: boolean;
}

export class VersionService {
  constructor(private readonly prisma: PrismaClient) {}

  async createVersion(input: CreateVersionInput): Promise<FileVersion> {
    const file = await this.prisma.file.findUnique({ where: { id: input.fileId } });

    if (!file) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const record = file as unknown as FileRecord;

    if (record.userId !== input.userId) {
      throw createAppError('Not authorized to access this file', 403, 'UNAUTHORIZED');
    }

    // Get the latest version number
    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId: input.fileId },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    });

    const latestVersion = versions[0] as unknown as FileVersion | undefined;
    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    const version = await this.prisma.fileVersion.create({
      data: {
        fileId: input.fileId,
        versionNumber: nextVersionNumber,
        encryptedContent: input.encryptedContent,
        encryptionIV: input.encryptionIV,
        encryptionAuthTag: input.encryptionAuthTag,
        size: input.size,
        createdAt: new Date(),
      },
    });

    return version as unknown as FileVersion;
  }

  async listVersions(fileId: string, userId: string): Promise<FileVersion[]> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });

    if (!file) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const record = file as unknown as FileRecord;

    if (record.userId !== userId) {
      throw createAppError('Not authorized to access this file', 403, 'UNAUTHORIZED');
    }

    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });

    return versions as unknown as FileVersion[];
  }

  async getVersion(versionId: string, userId: string): Promise<FileVersion> {
    const version = await this.prisma.fileVersion.findUnique({ where: { id: versionId } });

    if (!version) {
      throw createAppError('Version not found', 404, 'VERSION_NOT_FOUND');
    }

    const versionRecord = version as unknown as FileVersion;

    const file = await this.prisma.file.findUnique({ where: { id: versionRecord.fileId } });

    if (!file) {
      throw createAppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const fileRecord = file as unknown as FileRecord;

    if (fileRecord.userId !== userId) {
      throw createAppError('Not authorized to access this version', 403, 'UNAUTHORIZED');
    }

    return versionRecord;
  }

  async restoreVersion(versionId: string, userId: string): Promise<FileVersion> {
    const version = await this.getVersion(versionId, userId);

    await this.prisma.file.update({
      where: { id: version.fileId },
      data: {
        encryptedContent: version.encryptedContent,
        encryptionIV: version.encryptionIV,
        encryptionAuthTag: version.encryptionAuthTag,
        size: version.size,
        updatedAt: new Date(),
      },
    });

    return version;
  }

  async purgeExpiredVersions(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.fileVersion.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    return result.count;
  }
}
