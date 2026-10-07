// ============================================================================
// Search Client - MeiliSearch backed full-text search
// ============================================================================

import { MeiliSearch, type SearchResponse } from 'meilisearch';
import { z } from 'zod';

export const SearchOptionsSchema = z.object({
  filter: z.union([z.string(), z.array(z.string())]).optional(),
  sort: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  attributesToRetrieve: z.array(z.string()).optional(),
  attributesToHighlight: z.array(z.string()).optional(),
  showRankingScore: z.boolean().optional(),
});

export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

export interface IndexConfig {
  primaryKey: string;
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
}

/** Predefined index configurations for the Quant ecosystem */
export const QUANT_INDEXES: Record<string, IndexConfig> = {
  emails: {
    primaryKey: 'id',
    searchableAttributes: ['subject', 'bodyPlain', 'fromAddress', 'fromName'],
    filterableAttributes: ['userId', 'folderId', 'isRead', 'isStarred'],
    sortableAttributes: ['receivedAt', 'createdAt'],
  },
  messages: {
    primaryKey: 'id',
    searchableAttributes: ['content'],
    filterableAttributes: ['conversationId', 'senderId', 'type'],
    sortableAttributes: ['createdAt'],
  },
  posts: {
    primaryKey: 'id',
    searchableAttributes: ['content', 'hashtags'],
    filterableAttributes: ['userId', 'communityId', 'visibility', 'type'],
    sortableAttributes: ['publishedAt', 'likeCount'],
  },
  videos: {
    primaryKey: 'id',
    searchableAttributes: ['title', 'description', 'tags'],
    filterableAttributes: ['userId', 'channelId', 'visibility', 'category'],
    sortableAttributes: ['viewCount', 'publishedAt'],
  },
  users: {
    primaryKey: 'id',
    searchableAttributes: ['username', 'displayName', 'bio'],
    filterableAttributes: ['role', 'status'],
    sortableAttributes: ['createdAt'],
  },
  files: {
    primaryKey: 'id',
    searchableAttributes: ['filename', 'description', 'tags'],
    filterableAttributes: ['userId', 'mimeType'],
    sortableAttributes: ['createdAt', 'size'],
  },
};

/**
 * SearchClient - MeiliSearch SDK wrapper
 *
 * Provides typed methods for indexing and searching documents
 * across the Quant ecosystem indexes.
 */
export class SearchClient {
  private readonly client: MeiliSearch;

  constructor(host: string, apiKey?: string) {
    this.client = new MeiliSearch({ host, apiKey });
  }

  async ensureIndex(indexName: string, config: IndexConfig): Promise<void> {
    const { taskUid } = await this.client.createIndex(indexName, {
      primaryKey: config.primaryKey,
    });
    await this.client.waitForTask(taskUid);

    const index = this.client.index(indexName);

    if (config.searchableAttributes) {
      const task = await index.updateSearchableAttributes(config.searchableAttributes);
      await this.client.waitForTask(task.taskUid);
    }

    if (config.filterableAttributes) {
      const task = await index.updateFilterableAttributes(config.filterableAttributes);
      await this.client.waitForTask(task.taskUid);
    }

    if (config.sortableAttributes) {
      const task = await index.updateSortableAttributes(config.sortableAttributes);
      await this.client.waitForTask(task.taskUid);
    }
  }

  async indexDocument(indexName: string, document: Record<string, unknown>): Promise<void> {
    const index = this.client.index(indexName);
    const task = await index.addDocuments([document]);
    await this.client.waitForTask(task.taskUid);
  }

  async indexBatch(indexName: string, documents: Array<Record<string, unknown>>): Promise<void> {
    const index = this.client.index(indexName);
    const task = await index.addDocuments(documents);
    await this.client.waitForTask(task.taskUid);
  }

  async search(indexName: string, query: string, options?: SearchOptions): Promise<SearchResponse> {
    const validated = options ? SearchOptionsSchema.parse(options) : undefined;
    const index = this.client.index(indexName);
    return index.search(query, validated);
  }

  async deleteDocument(indexName: string, documentId: string): Promise<void> {
    const index = this.client.index(indexName);
    const task = await index.deleteDocument(documentId);
    await this.client.waitForTask(task.taskUid);
  }

  async ensureAllQuantIndexes(): Promise<void> {
    for (const [name, config] of Object.entries(QUANT_INDEXES)) {
      await this.ensureIndex(name, config);
    }
  }
}
