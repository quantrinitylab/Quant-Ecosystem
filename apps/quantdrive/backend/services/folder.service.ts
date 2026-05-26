import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  folder: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    delete: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
}

export interface FolderRecord {
  id: string;
  name: string;
  userId: string;
  parentId: string | null;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFolderInput {
  name: string;
  userId: string;
  parentId?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export class FolderService {
  constructor(private readonly prisma: PrismaClient) {}

  async createFolder(input: CreateFolderInput): Promise<FolderRecord> {
    let path = `/${input.name}`;

    if (input.parentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: input.parentId } });

      if (!parent) {
        throw createAppError('Parent folder not found', 404, 'PARENT_NOT_FOUND');
      }

      const parentRecord = parent as unknown as FolderRecord;

      if (parentRecord.userId !== input.userId) {
        throw createAppError('Not authorized to access parent folder', 403, 'UNAUTHORIZED');
      }

      path = `${parentRecord.path}/${input.name}`;
    }

    const folder = await this.prisma.folder.create({
      data: {
        name: input.name,
        userId: input.userId,
        parentId: input.parentId ?? null,
        path,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return folder as unknown as FolderRecord;
  }

  async getFolder(folderId: string, userId: string): Promise<FolderRecord> {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });

    if (!folder) {
      throw createAppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    }

    const record = folder as unknown as FolderRecord;

    if (record.userId !== userId) {
      throw createAppError('Not authorized to access this folder', 403, 'UNAUTHORIZED');
    }

    return record;
  }

  async listFolders(userId: string, parentId?: string): Promise<FolderRecord[]> {
    const where: Record<string, unknown> = { userId };

    if (parentId !== undefined) {
      where['parentId'] = parentId;
    }

    const folders = await this.prisma.folder.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return folders as unknown as FolderRecord[];
  }

  async moveFolder(folderId: string, userId: string, newParentId: string): Promise<FolderRecord> {
    const folder = await this.getFolder(folderId, userId);

    const newParent = await this.prisma.folder.findUnique({ where: { id: newParentId } });

    if (!newParent) {
      throw createAppError('Target folder not found', 404, 'TARGET_NOT_FOUND');
    }

    const parentRecord = newParent as unknown as FolderRecord;

    if (parentRecord.userId !== userId) {
      throw createAppError('Not authorized to access target folder', 403, 'UNAUTHORIZED');
    }

    const newPath = `${parentRecord.path}/${folder.name}`;

    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: { parentId: newParentId, path: newPath, updatedAt: new Date() },
    });

    return updated as unknown as FolderRecord;
  }

  async deleteFolder(folderId: string, userId: string): Promise<FolderRecord> {
    await this.getFolder(folderId, userId);

    const childCount = await this.prisma.folder.count({ where: { parentId: folderId } });

    if (childCount > 0) {
      throw createAppError('Cannot delete folder with children', 400, 'FOLDER_HAS_CHILDREN');
    }

    const deleted = await this.prisma.folder.delete({ where: { id: folderId } });

    return deleted as unknown as FolderRecord;
  }

  async getFolderPath(folderId: string, userId: string): Promise<BreadcrumbItem[]> {
    const breadcrumbs: BreadcrumbItem[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: currentId } });

      if (!folder) {
        break;
      }

      const record = folder as unknown as FolderRecord;

      if (record.userId !== userId) {
        throw createAppError('Not authorized to access this folder', 403, 'UNAUTHORIZED');
      }

      breadcrumbs.unshift({ id: record.id, name: record.name });
      currentId = record.parentId;
    }

    return breadcrumbs;
  }
}
