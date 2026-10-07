import type { SearchEngine, SearchResult, SearchEngineOptions, IndexConfig } from './types';

export class InMemoryEngine implements SearchEngine {
  private storage = new Map<string, Map<string, Record<string, unknown>>>();
  private configs = new Map<string, IndexConfig>();

  async search<T = Record<string, unknown>>(
    index: string,
    query: string,
    options?: SearchEngineOptions,
  ): Promise<SearchResult<T>> {
    const start = performance.now();
    const store = this.storage.get(index);

    if (!store || !query.trim()) {
      return {
        hits: [],
        totalHits: 0,
        processingTimeMs: Math.round(performance.now() - start),
        query,
      };
    }

    const terms = query.toLowerCase().split(/\s+/);
    let hits: Record<string, unknown>[] = [];

    for (const doc of store.values()) {
      const docText = Object.values(doc)
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase();

      const matches = terms.some((term) => docText.includes(term));
      if (matches) {
        hits.push(doc);
      }
    }

    // Apply filter: supports simple "key = value" equality checks
    if (options?.filter) {
      const filters = Array.isArray(options.filter) ? options.filter : [options.filter];
      for (const filterStr of filters) {
        const MAX_FILTER_LENGTH = 500;
        const safeFilter =
          filterStr.length > MAX_FILTER_LENGTH ? filterStr.slice(0, MAX_FILTER_LENGTH) : filterStr;
        const match = safeFilter.match(/^\s*([\w]+)\s*=(.+)$/);
        if (match) {
          const key = match[1]!;
          const value = match[2]!.trim();
          hits = hits.filter((doc) => String(doc[key]) === value);
        }
      }
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;
    const paginatedHits = hits.slice(offset, offset + limit);

    return {
      hits: paginatedHits as T[],
      totalHits: hits.length,
      processingTimeMs: Math.round(performance.now() - start),
      query,
    };
  }

  async indexDocuments(index: string, documents: Record<string, unknown>[]): Promise<void> {
    if (!this.storage.has(index)) {
      this.storage.set(index, new Map());
    }
    const store = this.storage.get(index)!;
    const config = this.configs.get(index);
    const primaryKey = config?.primaryKey ?? 'id';

    for (const doc of documents) {
      const id = String(doc[primaryKey] ?? '');
      if (id) {
        store.set(id, doc);
      }
    }
  }

  async removeDocuments(index: string, ids: string[]): Promise<void> {
    const store = this.storage.get(index);
    if (!store) return;

    for (const id of ids) {
      store.delete(id);
    }
  }

  async createIndex(name: string, config: IndexConfig): Promise<void> {
    this.storage.set(name, new Map());
    this.configs.set(name, config);
  }

  async deleteIndex(name: string): Promise<void> {
    this.storage.delete(name);
    this.configs.delete(name);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// Security: CodeQL #174: filter regex avoids overlapping quantifiers (linear time).
