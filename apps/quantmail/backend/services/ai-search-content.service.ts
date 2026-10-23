/**
 * QuantMail Drive — Content Search Service (Wave A4)
 *
 * Backed directly by PostgreSQL via Prisma (`fileIndex` table).
 * Performs case-insensitive `contains` text search with in-process
 * relevance scoring and snippet extraction.
 */
import { createAppError } from '@quant/server-core';
import {
  afterCutoff,
  beforeCutoff,
  mimePatternsForDriveType,
} from '../lib/drive-search-filters';

export interface FileIndexRecord {
  id: string;
  fileId: string;
  userId: string;
  content: string;
  mimeType: string;
  indexedAt: Date;
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  name: string;
  snippet: string;
  relevanceScore: number;
}

export interface SearchOptions {
  limit?: number;
  /**
   * Structured search-operator filters (`type:` / `name:` / `before:` /
   * `after:`), parsed by the frontend out of the search box and forwarded by
   * the `/drive/ai/search` route. Applied as real post-filters on the file
   * rows — never as score tweaks.
   */
  filters?: {
    type?: string;
    name?: string;
    before?: string;
    after?: string;
  };
}

interface SearchFileRow {
  id: string;
  name: string;
  mimeType: string;
  updatedAt: Date;
}

export interface SearchPrismaTransactionClient {
  fileIndex: {
    findFirst(args: Record<string, unknown>): Promise<FileIndexRecord | null>;
    create(args: Record<string, unknown>): Promise<FileIndexRecord>;
    update(args: Record<string, unknown>): Promise<FileIndexRecord>;
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
  };
}

export interface SearchPrismaClient {
  file: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
    findMany(args: Record<string, unknown>): Promise<SearchFileRow[]>;
  };
  fileIndex: {
    findMany(args: Record<string, unknown>): Promise<FileIndexRecord[]>;
  };
  $transaction<T>(callback: (tx: SearchPrismaTransactionClient) => Promise<T>): Promise<T>;
}

export class AISearchContentService {
  constructor(private readonly prisma: SearchPrismaClient) {}

  async indexFile(
    fileId: string,
    fileName: string,
    content: string,
    mimeType: string,
    userId: string,
  ): Promise<FileIndexRecord> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!file) throw createAppError('File not found', 404, 'FILE_NOT_FOUND');

    return this.prisma.$transaction(async (tx: SearchPrismaTransactionClient) => {
      const existing = await tx.fileIndex.findFirst({
        where: { fileId, userId },
        orderBy: { indexedAt: 'desc' },
      });
      const data = { fileId, userId, content, mimeType, indexedAt: new Date() };
      if (!existing) return tx.fileIndex.create({ data });

      const updated = await tx.fileIndex.update({ where: { id: existing.id }, data });
      await tx.fileIndex.deleteMany({
        where: { fileId, userId, id: { not: existing.id } },
      });
      return updated;
    });
  }

  async searchContent(
    query: string,
    userId: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const filters = options?.filters;

    // `type:` operator — unknown keyword ⇒ honest empty (the route rejects
    // hand-built unknowns the same way); `type:folder` ⇒ the content index
    // holds files only, so there is nothing to return.
    let mimePatterns: string[] | null = null;
    if (filters?.type) {
      const patterns = mimePatternsForDriveType(filters.type.toLowerCase());
      if (patterns === null || patterns.length === 0) return [];
      mimePatterns = patterns;
    }
    const beforeDate = beforeCutoff(filters?.before);
    const afterDate = afterCutoff(filters?.after);
    const nameIncludes = filters?.name?.trim().toLowerCase() || null;

    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
    if (!terms.length) return [];
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const records = await this.prisma.fileIndex.findMany({
      where: {
        userId,
        OR: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' } })),
      },
      orderBy: { indexedAt: 'desc' },
      take: Math.max(limit * 10, 100),
    });

    const fileIds = [...new Set(records.map((record) => record.fileId))];
    // The file row is the authority for mime type / modified date / name —
    // the index row's snapshot can be stale, so operator filters are applied
    // here against live file metadata, not the indexed copy.
    const files = fileIds.length
      ? await this.prisma.file.findMany({
          where: { id: { in: fileIds }, userId, isDeleted: false },
          select: { id: true, name: true, mimeType: true, updatedAt: true },
        })
      : [];
    const fileById = new Map<string, SearchFileRow>(files.map((file) => [file.id, file]));

    const results: SearchResult[] = [];
    for (const record of records) {
      const file = fileById.get(record.fileId);
      if (!file) continue;
      if (
        mimePatterns &&
        !mimePatterns.some((p) => file.mimeType.toLowerCase().includes(p.toLowerCase()))
      ) {
        continue;
      }
      if (beforeDate && !(file.updatedAt < beforeDate)) continue;
      if (afterDate && !(file.updatedAt >= afterDate)) continue;
      if (nameIncludes && !file.name.toLowerCase().includes(nameIncludes)) continue;
      const fileName = file.name;
      const contentLower = record.content.toLowerCase();
      const matchCount = terms.reduce(
        (count, term) => count + (contentLower.includes(term) ? 1 : 0),
        0,
      );
      if (!matchCount) continue;
      results.push({
        fileId: record.fileId,
        fileName,
        name: fileName,
        snippet: this.extractSnippet(record.content, terms),
        relevanceScore: matchCount / terms.length,
      });
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, limit);
  }

  private extractSnippet(content: string, terms: string[]): string {
    const lower = content.toLowerCase();
    const indexes = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
    const bestIndex = indexes.length ? Math.min(...indexes) : 0;
    const start = Math.max(0, bestIndex - 50);
    const end = Math.min(content.length, bestIndex + 150);
    const body = content.slice(start, end).trim();
    return `${start > 0 ? '...' : ''}${body}${end < content.length ? '...' : ''}`;
  }
}
