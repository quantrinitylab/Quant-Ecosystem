import { describe, it, expect } from 'vitest';
import {
  SemanticVectorMemoryService,
  DeterministicEmbeddingProvider,
  cosineSimilarity,
} from '../services/semantic-vector-memory.service';

describe('SemanticVectorMemoryService (Layer 3 Semantic Vector Memory)', () => {
  it('generates normalized unit vectors from deterministic embedding provider', async () => {
    const embedder = new DeterministicEmbeddingProvider(64);
    const vec = await embedder.embed('Quant Ecosystem Architecture Specification');

    expect(vec).toHaveLength(64);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('calculates cosine similarity correctly', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0);
  });

  it('indexes and searches semantic chunks with relevance ordering', async () => {
    const service = new SemanticVectorMemoryService();

    await service.upsertChunk({
      id: 'chunk-1',
      userId: 'user-001',
      sourceApp: 'quantmail',
      sourceId: 'email-101',
      content: 'Meeting notes on Q4 marketing budget and subscriber goals',
    });

    await service.upsertChunk({
      id: 'chunk-2',
      userId: 'user-001',
      sourceApp: 'codehub',
      sourceId: 'pr-42',
      content: 'Refactored authentication middleware using SHA-256 constant-time tokens',
    });

    const budgetResults = await service.search('user-001', 'marketing budget subscriber');
    expect(budgetResults.length).toBeGreaterThan(0);
    expect(budgetResults[0]?.id).toBe('chunk-1');
    expect(budgetResults[0]?.sourceApp).toBe('quantmail');

    const authResults = await service.search('user-001', 'authentication tokens');
    expect(authResults.length).toBeGreaterThan(0);
    expect(authResults[0]?.id).toBe('chunk-2');
    expect(authResults[0]?.sourceApp).toBe('codehub');
  });

  it('enforces multi-tenant user isolation', async () => {
    const service = new SemanticVectorMemoryService();

    await service.upsertChunk({
      id: 'chunk-secret',
      userId: 'user-alice',
      sourceApp: 'quantdocs',
      sourceId: 'doc-secret',
      content: 'Super confidential revenue projections',
    });

    const bobResults = await service.search('user-bob', 'confidential revenue');
    expect(bobResults).toHaveLength(0);

    const aliceResults = await service.search('user-alice', 'confidential revenue');
    expect(aliceResults).toHaveLength(1);
    expect(aliceResults[0]?.id).toBe('chunk-secret');
  });

  it('filters results by sourceApp', async () => {
    const service = new SemanticVectorMemoryService();

    await service.upsertChunk({
      id: 'c-mail',
      userId: 'user-filter',
      sourceApp: 'quantmail',
      sourceId: 'email-1',
      content: 'API specification for webhooks',
    });
    await service.upsertChunk({
      id: 'c-code',
      userId: 'user-filter',
      sourceApp: 'codehub',
      sourceId: 'repo-1',
      content: 'API specification for webhooks repository implementation',
    });

    const codeOnly = await service.search('user-filter', 'API specification', {
      sourceApp: 'codehub',
    });
    expect(codeOnly).toHaveLength(1);
    expect(codeOnly[0]?.sourceApp).toBe('codehub');
  });

  it('deletes chunks by source and by userId', async () => {
    const service = new SemanticVectorMemoryService();

    await service.upsertChunk({
      id: 'c-del-1',
      userId: 'user-del',
      sourceApp: 'quantdrive',
      sourceId: 'file-999',
      content: 'Temporary upload file',
    });
    expect(service.count('user-del')).toBe(1);

    const deleted = await service.deleteBySource('quantdrive', 'file-999');
    expect(deleted).toBe(1);
    expect(service.count('user-del')).toBe(0);
  });
});
