export const DRIVE_AI_SEARCH_CONTEXT = {
  app: 'quantmail',
  feature: 'drive-ai-search',
} as const;

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
}

type Db = any;

type IndexedFileRecord = FileIndexRecord;

export class AISearchContentService {
  constructor(private readonly prisma: Db) {}

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
    if (!file) throw new Error('Cannot index a missing, deleted, or foreign file');

    return this.prisma.$transaction(async (tx: Db) => {
      const existing = await tx.fileIndex.findFirst({
        where: { fileId, userId },
        orderBy: { indexedAt: 'desc' },
      });
      const data = { fileId, userId, content, mimeType, indexedAt: new Date() };
      if (!existing) return tx.fileIndex.create({ data });

      const updated = await tx.fileIndex.update({ where: { id: existing.id }, data });
      // Clean up historical duplicates left by the former create-only implementation.
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
    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
    if (!terms.length) return [];
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const records = (await this.prisma.fileIndex.findMany({
      where: {
        userId,
        OR: terms.map((term) => ({ content: { contains: term, mode: 'insensitive' } })),
      },
      orderBy: { indexedAt: 'desc' },
      take: Math.max(limit * 10, 100),
    })) as IndexedFileRecord[];

    const fileIds = [...new Set(records.map((record) => record.fileId))];
    const files = fileIds.length
      ? await this.prisma.file.findMany({
          where: { id: { in: fileIds }, userId, isDeleted: false },
          select: { id: true, name: true },
        })
      : [];
    const fileNameById = new Map<string, string>(
      files.map((file: { id: string; name: string }) => [file.id, file.name]),
    );

    const results: SearchResult[] = [];
    for (const record of records) {
      const fileName = fileNameById.get(record.fileId);
      if (!fileName) continue;
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
