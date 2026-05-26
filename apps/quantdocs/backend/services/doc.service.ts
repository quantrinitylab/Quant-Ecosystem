import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  document: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  documentVersion: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
}

export interface CreateDocInput {
  title: string;
  content: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface DocVersion {
  id: string;
  docId: string;
  title: string;
  content: string;
  createdAt: Date;
}

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

export interface Doc {
  id: string;
  title: string;
  content: string;
  userId: string;
  metadata: Record<string, unknown>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class DocService {
  constructor(private readonly prisma: PrismaClient) {}

  async createDoc(input: CreateDocInput): Promise<Doc> {
    const doc = await this.prisma.document.create({
      data: {
        title: input.title,
        content: input.content,
        userId: input.userId,
        metadata: input.metadata ?? {},
      },
    });

    return doc as unknown as Doc;
  }

  async getDoc(docId: string, userId: string): Promise<Doc> {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      throw createAppError('Document not found', 404, 'DOC_NOT_FOUND');
    }

    if ((doc as unknown as Doc).isDeleted) {
      throw createAppError('Document not found', 404, 'DOC_NOT_FOUND');
    }

    if ((doc as unknown as Doc).userId !== userId) {
      throw createAppError('Not authorized to access this document', 403, 'UNAUTHORIZED');
    }

    return doc as unknown as Doc;
  }

  async updateDoc(docId: string, userId: string, content: string, title?: string): Promise<Doc> {
    const existing = await this.getDoc(docId, userId);

    // Save current version before updating
    await this.prisma.documentVersion.create({
      data: {
        docId,
        title: existing.title,
        content: existing.content,
        createdAt: new Date(),
      },
    });

    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: {
        content,
        title: title ?? existing.title,
        updatedAt: new Date(),
      },
    });

    return updated as unknown as Doc;
  }

  async deleteDoc(docId: string, userId: string): Promise<Doc> {
    await this.getDoc(docId, userId);

    const deleted = await this.prisma.document.update({
      where: { id: docId },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    return deleted as unknown as Doc;
  }

  async listDocs(userId: string, options: PaginationOptions = {}): Promise<PaginatedResult<Doc>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where: { userId, isDeleted: false },
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.document.count({ where: { userId, isDeleted: false } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data: data as unknown as Doc[],
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getVersionHistory(docId: string, userId: string): Promise<DocVersion[]> {
    await this.getDoc(docId, userId);

    const versions = await this.prisma.documentVersion.findMany({
      where: { docId },
      orderBy: { createdAt: 'desc' },
    });

    return versions as unknown as DocVersion[];
  }

  async restoreVersion(docId: string, userId: string, versionId: string): Promise<Doc> {
    await this.getDoc(docId, userId);

    const version = await this.prisma.documentVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      throw createAppError('Version not found', 404, 'VERSION_NOT_FOUND');
    }

    if ((version as unknown as DocVersion).docId !== docId) {
      throw createAppError('Version does not belong to this document', 400, 'VERSION_MISMATCH');
    }

    return this.updateDoc(
      docId,
      userId,
      (version as unknown as DocVersion).content,
      (version as unknown as DocVersion).title,
    );
  }
}
