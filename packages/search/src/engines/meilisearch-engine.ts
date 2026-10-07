/* eslint-disable no-console */
import { MeiliSearch } from 'meilisearch';
import type { SearchEngine, SearchResult, SearchEngineOptions, IndexConfig } from './types';

export class MeilisearchEngine implements SearchEngine {
  private client: MeiliSearch;

  constructor(host: string, apiKey?: string) {
    this.client = new MeiliSearch({ host, apiKey });
  }

  async search<T = Record<string, unknown>>(
    index: string,
    query: string,
    options?: SearchEngineOptions,
  ): Promise<SearchResult<T>> {
    try {
      const response = await this.client.index(index).search(query, {
        filter: options?.filter,
        sort: options?.sort,
        limit: options?.limit,
        offset: options?.offset,
        attributesToRetrieve: options?.attributesToRetrieve,
        attributesToHighlight: options?.attributesToHighlight,
      });

      return {
        hits: response.hits as T[],
        totalHits:
          ((response as Record<string, unknown>).totalHits as number) ??
          response.estimatedTotalHits ??
          0,
        processingTimeMs: response.processingTimeMs,
        query: response.query,
      };
    } catch (error) {
      console.error(`[MeilisearchEngine] search failed for index "${index}":`, error);
      return { hits: [], totalHits: 0, processingTimeMs: 0, query };
    }
  }

  async indexDocuments(index: string, documents: Record<string, unknown>[]): Promise<void> {
    try {
      await this.client.index(index).addDocuments(documents);
    } catch (error) {
      console.error(`[MeilisearchEngine] indexDocuments failed for index "${index}":`, error);
      throw error;
    }
  }

  async removeDocuments(index: string, ids: string[]): Promise<void> {
    try {
      await this.client.index(index).deleteDocuments(ids);
    } catch (error) {
      console.error(`[MeilisearchEngine] removeDocuments failed for index "${index}":`, error);
      throw error;
    }
  }

  async createIndex(name: string, config: IndexConfig): Promise<void> {
    try {
      await this.client.createIndex(name, { primaryKey: config.primaryKey });

      const index = this.client.index(name);

      if (config.searchableAttributes) {
        await index.updateSearchableAttributes(config.searchableAttributes);
      }
      if (config.filterableAttributes) {
        await index.updateFilterableAttributes(config.filterableAttributes);
      }
      if (config.sortableAttributes) {
        await index.updateSortableAttributes(config.sortableAttributes);
      }
    } catch (error) {
      console.error(`[MeilisearchEngine] createIndex failed for "${name}":`, error);
      throw error;
    }
  }

  async deleteIndex(name: string): Promise<void> {
    try {
      await this.client.deleteIndex(name);
    } catch (error) {
      console.error(`[MeilisearchEngine] deleteIndex failed for "${name}":`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.health();
      return true;
    } catch (error) {
      console.error('[MeilisearchEngine] healthCheck failed:', error);
      return false;
    }
  }
}
