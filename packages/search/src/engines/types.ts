export interface SearchResult<T = Record<string, unknown>> {
  hits: T[];
  totalHits: number;
  processingTimeMs: number;
  query: string;
}

export interface SearchEngineOptions {
  filter?: string | string[];
  sort?: string[];
  limit?: number;
  offset?: number;
  attributesToRetrieve?: string[];
  attributesToHighlight?: string[];
}

export interface IndexConfig {
  primaryKey: string;
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
}

export interface SearchEngine {
  search<T = Record<string, unknown>>(
    index: string,
    query: string,
    options?: SearchEngineOptions,
  ): Promise<SearchResult<T>>;
  indexDocuments(index: string, documents: Record<string, unknown>[]): Promise<void>;
  removeDocuments(index: string, ids: string[]): Promise<void>;
  createIndex(name: string, config: IndexConfig): Promise<void>;
  deleteIndex(name: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}
