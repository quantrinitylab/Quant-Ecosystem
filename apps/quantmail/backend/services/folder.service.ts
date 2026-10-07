import type { PrismaClient, EmailFolder } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export type FolderType = 'INBOX' | 'SENT' | 'DRAFTS' | 'SPAM' | 'TRASH' | 'ARCHIVE' | 'CUSTOM';

export interface CreateFolderInput {
  userId: string;
  name: string;
  type?: FolderType;
  color?: string;
  icon?: string;
}

export interface FolderStats {
  emailCount: number;
  unreadCount: number;
}

const DEFAULT_FOLDERS: Array<{ name: string; type: FolderType }> = [
  { name: 'Inbox', type: 'INBOX' },
  { name: 'Sent', type: 'SENT' },
  { name: 'Drafts', type: 'DRAFTS' },
  { name: 'Trash', type: 'TRASH' },
  { name: 'Spam', type: 'SPAM' },
  { name: 'Archive', type: 'ARCHIVE' },
];

export class FolderService {
  constructor(private readonly prisma: PrismaClient) {}

  async createFolder(input: CreateFolderInput): Promise<EmailFolder> {
    // Check for duplicate folder name for this user
    const existing = await this.prisma.emailFolder.findFirst({
      where: { userId: input.userId, name: input.name },
    });

    if (existing) {
      throw createAppError(
        `Folder with name "${input.name}" already exists`,
        409,
        'FOLDER_NAME_DUPLICATE',
      );
    }

    return this.prisma.emailFolder.create({
      data: {
        userId: input.userId,
        name: input.name,
        type: input.type ?? 'CUSTOM',
        color: input.color ?? null,
        icon: input.icon ?? null,
        emailCount: 0,
        unreadCount: 0,
      },
    });
  }

  async listFolders(userId: string): Promise<EmailFolder[]> {
    return this.prisma.emailFolder.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateFolder(
    folderId: string,
    userId: string,
    data: { name?: string; color?: string; icon?: string },
  ): Promise<EmailFolder> {
    const folder = await this.prisma.emailFolder.findUnique({ where: { id: folderId } });

    if (!folder) {
      throw createAppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    if (folder.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    // If renaming, check for duplicates
    if (data.name && data.name !== folder.name) {
      const existing = await this.prisma.emailFolder.findFirst({
        where: { userId, name: data.name },
      });

      if (existing) {
        throw createAppError(
          `Folder with name "${data.name}" already exists`,
          409,
          'FOLDER_NAME_DUPLICATE',
        );
      }
    }

    return this.prisma.emailFolder.update({
      where: { id: folderId },
      data,
    });
  }

  async deleteFolder(folderId: string, userId: string): Promise<EmailFolder> {
    const folder = await this.prisma.emailFolder.findUnique({ where: { id: folderId } });

    if (!folder) {
      throw createAppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    if (folder.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    if (folder.type !== 'CUSTOM') {
      throw createAppError('Cannot delete system folders', 400, 'SYSTEM_FOLDER');
    }

    return this.prisma.emailFolder.delete({ where: { id: folderId } });
  }

  async getFolderStats(folderId: string, userId: string): Promise<FolderStats> {
    const folder = await this.prisma.emailFolder.findUnique({ where: { id: folderId } });

    if (!folder) {
      throw createAppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    if (folder.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const [emailCount, unreadCount] = await Promise.all([
      this.prisma.email.count({ where: { folderId, userId, deletedAt: null } }),
      this.prisma.email.count({ where: { folderId, userId, deletedAt: null, isRead: false } }),
    ]);

    return { emailCount, unreadCount };
  }

  async initializeDefaultFolders(userId: string): Promise<EmailFolder[]> {
    const existing = await this.prisma.emailFolder.findMany({ where: { userId } });

    if (existing.length > 0) {
      return existing;
    }

    const folders: EmailFolder[] = [];
    for (const def of DEFAULT_FOLDERS) {
      const folder = await this.prisma.emailFolder.create({
        data: {
          userId,
          name: def.name,
          type: def.type,
          emailCount: 0,
          unreadCount: 0,
        },
      });
      folders.push(folder);
    }

    return folders;
  }
}
