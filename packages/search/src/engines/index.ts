import { MeilisearchEngine } from './meilisearch-engine';
import { InMemoryEngine } from './in-memory-engine';
import type { SearchEngine } from './types';

export type { SearchEngine, SearchResult, SearchEngineOptions, IndexConfig } from './types';
export { MeilisearchEngine } from './meilisearch-engine';
export { InMemoryEngine } from './in-memory-engine';

export function createSearchEngine(): SearchEngine {
  const host = process.env.MEILISEARCH_URL;
  const apiKey = process.env.MEILISEARCH_KEY;

  if (host) {
    return new MeilisearchEngine(host, apiKey);
  }

  return new InMemoryEngine();
}
