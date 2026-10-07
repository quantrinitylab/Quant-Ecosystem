import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSearchEngine } from '../index';
import { MeilisearchEngine } from '../meilisearch-engine';
import { InMemoryEngine } from '../in-memory-engine';

describe('createSearchEngine factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return InMemoryEngine when MEILISEARCH_URL is not set', () => {
    delete process.env.MEILISEARCH_URL;
    const engine = createSearchEngine();
    expect(engine).toBeInstanceOf(InMemoryEngine);
  });

  it('should return MeilisearchEngine when MEILISEARCH_URL is set', () => {
    process.env.MEILISEARCH_URL = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    const engine = createSearchEngine();
    expect(engine).toBeInstanceOf(MeilisearchEngine);
  });

  it('should return MeilisearchEngine without apiKey when only URL is set', () => {
    process.env.MEILISEARCH_URL = 'http://localhost:7700';
    delete process.env.MEILISEARCH_KEY;
    const engine = createSearchEngine();
    expect(engine).toBeInstanceOf(MeilisearchEngine);
  });
});
