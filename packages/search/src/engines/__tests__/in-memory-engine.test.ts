import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEngine } from '../in-memory-engine';

describe('InMemoryEngine', () => {
  let engine: InMemoryEngine;

  beforeEach(() => {
    engine = new InMemoryEngine();
  });

  it('should return true for healthCheck', async () => {
    expect(await engine.healthCheck()).toBe(true);
  });

  it('should index documents and find them via search', async () => {
    await engine.createIndex('test', { primaryKey: 'id' });
    await engine.indexDocuments('test', [
      { id: '1', title: 'Hello World', body: 'This is a test document' },
      { id: '2', title: 'Goodbye', body: 'Another document here' },
    ]);

    const result = await engine.search('test', 'hello');
    expect(result.totalHits).toBe(1);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ id: '1', title: 'Hello World' });
    expect(result.query).toBe('hello');
  });

  it('should return empty results when no match', async () => {
    await engine.createIndex('test', { primaryKey: 'id' });
    await engine.indexDocuments('test', [
      { id: '1', title: 'Hello World', body: 'This is a test' },
    ]);

    const result = await engine.search('test', 'nonexistent');
    expect(result.totalHits).toBe(0);
    expect(result.hits).toHaveLength(0);
  });

  it('should remove documents from search results', async () => {
    await engine.createIndex('test', { primaryKey: 'id' });
    await engine.indexDocuments('test', [
      { id: '1', title: 'Keep me' },
      { id: '2', title: 'Remove me' },
    ]);

    await engine.removeDocuments('test', ['2']);

    const result = await engine.search('test', 'me');
    expect(result.totalHits).toBe(1);
    expect(result.hits[0]).toMatchObject({ id: '1' });
  });

  it('should handle createIndex and deleteIndex lifecycle', async () => {
    await engine.createIndex('myindex', { primaryKey: 'id' });
    await engine.indexDocuments('myindex', [{ id: '1', title: 'test doc' }]);

    const result1 = await engine.search('myindex', 'test');
    expect(result1.totalHits).toBe(1);

    await engine.deleteIndex('myindex');

    const result2 = await engine.search('myindex', 'test');
    expect(result2.totalHits).toBe(0);
    expect(result2.hits).toHaveLength(0);
  });

  it('should respect limit and offset options', async () => {
    await engine.createIndex('test', { primaryKey: 'id' });
    await engine.indexDocuments('test', [
      { id: '1', title: 'item one' },
      { id: '2', title: 'item two' },
      { id: '3', title: 'item three' },
    ]);

    const result = await engine.search('test', 'item', { limit: 2, offset: 1 });
    expect(result.hits).toHaveLength(2);
    expect(result.totalHits).toBe(3);
  });

  it('should return empty for empty query', async () => {
    await engine.createIndex('test', { primaryKey: 'id' });
    await engine.indexDocuments('test', [{ id: '1', title: 'something' }]);

    const result = await engine.search('test', '');
    expect(result.totalHits).toBe(0);
    expect(result.hits).toHaveLength(0);
  });
});
