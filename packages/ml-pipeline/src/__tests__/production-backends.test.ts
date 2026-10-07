// ============================================================================
// Tests for production backend integrations
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { EmbeddingStore } from '../core/embedding-store';
import type { VectorStoreBackend } from '../core/embedding-store';
import { SpamClassifier } from '../core/spam-classifier';
import type { SpamModelBackend } from '../core/spam-classifier';
import { SentimentAnalyzer } from '../core/sentiment-analyzer';
import type { SentimentBackend } from '../core/sentiment-analyzer';
import { NEREngine } from '../core/ner-engine';
import type { NERBackend } from '../core/ner-engine';

// ---------------------------------------------------------------------------
// EmbeddingStore with VectorStoreBackend (Qdrant)
// ---------------------------------------------------------------------------
describe('EmbeddingStore with VectorStoreBackend', () => {
  function createMockBackend(): VectorStoreBackend {
    return {
      upsert: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([
        { id: 'result-1', score: 0.95, payload: { label: 'test' } },
        { id: 'result-2', score: 0.85, payload: {} },
      ]),
      delete: vi.fn().mockResolvedValue(undefined),
      createCollection: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('should report hasBackend() correctly', () => {
    const withBackend = new EmbeddingStore(128, { backend: createMockBackend() });
    const withoutBackend = new EmbeddingStore(128);

    expect(withBackend.hasBackend()).toBe(true);
    expect(withoutBackend.hasBackend()).toBe(false);
  });

  it('should delegate insertAsync to backend', async () => {
    const backend = createMockBackend();
    const store = new EmbeddingStore(3, { backend, collection: 'test-col' });

    await store.insertAsync('vec-1', [1, 0, 0], { label: 'hello' });

    expect(backend.upsert).toHaveBeenCalledWith('test-col', [
      { id: 'vec-1', vector: [1, 0, 0], payload: { label: 'hello' } },
    ]);
    // Also stored in memory
    expect(store.get('vec-1')).not.toBeNull();
  });

  it('should delegate batchInsertAsync to backend', async () => {
    const backend = createMockBackend();
    const store = new EmbeddingStore(3, { backend, collection: 'embeddings' });

    await store.batchInsertAsync([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
    ]);

    expect(backend.upsert).toHaveBeenCalledTimes(1);
    expect(store.size()).toBe(2);
  });

  it('should delegate searchAsync to backend', async () => {
    const backend = createMockBackend();
    const store = new EmbeddingStore(3, { backend, collection: 'test' });

    const results = await store.searchAsync([1, 0, 0], 2);

    expect(backend.search).toHaveBeenCalledWith('test', [1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('result-1');
    expect(results[0]!.score).toBe(0.95);
  });

  it('should fallback to in-memory kNN when no backend', async () => {
    const store = new EmbeddingStore(3);
    store.insert('v1', [1, 0, 0]);
    store.insert('v2', [0, 1, 0]);

    const results = await store.searchAsync([1, 0, 0], 1);

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('v1');
  });

  it('should delegate deleteAsync to backend', async () => {
    const backend = createMockBackend();
    const store = new EmbeddingStore(3, { backend, collection: 'col' });
    store.insert('x', [1, 1, 1]);

    await store.deleteAsync('x');

    expect(backend.delete).toHaveBeenCalledWith('col', ['x']);
    expect(store.get('x')).toBeNull();
  });

  it('should still work with all in-memory operations', () => {
    const store = new EmbeddingStore(3);
    store.insert('a', [1, 0, 0]);
    store.insert('b', [0, 1, 0]);
    store.insert('c', [0, 0, 1]);

    const results = store.knnExact([1, 0.1, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// SpamClassifier with SpamModelBackend (ONNX)
// ---------------------------------------------------------------------------
describe('SpamClassifier with SpamModelBackend', () => {
  function createMockModelBackend(probability: number = 0.9): SpamModelBackend {
    return {
      predict: vi.fn().mockResolvedValue(probability),
      isReady: vi.fn().mockReturnValue(true),
    };
  }

  it('should report hasModelBackend() correctly', () => {
    const withBackend = new SpamClassifier({ modelBackend: createMockModelBackend() });
    const withoutBackend = new SpamClassifier();

    expect(withBackend.hasModelBackend()).toBe(true);
    expect(withoutBackend.hasModelBackend()).toBe(false);
  });

  it('should use model backend for predictWithBackend', async () => {
    const backend = createMockModelBackend(0.85);
    const classifier = new SpamClassifier({ modelBackend: backend });

    const result = await classifier.predictWithBackend('Buy now! Free offer!');

    expect(result.backend).toBe('model');
    expect(result.probability).toBe(0.85);
    expect(result.isSpam).toBe(true);
    expect(backend.predict).toHaveBeenCalled();
  });

  it('should fallback to naive when model not ready', async () => {
    const backend: SpamModelBackend = {
      predict: vi.fn().mockResolvedValue(0.9),
      isReady: vi.fn().mockReturnValue(false),
    };
    const classifier = new SpamClassifier({ modelBackend: backend });
    classifier.train([
      { text: 'spam spam', label: 'spam' },
      { text: 'normal text', label: 'ham' },
    ]);

    const result = await classifier.predictWithBackend('test text');

    expect(result.backend).toBe('naive');
    expect(backend.predict).not.toHaveBeenCalled();
  });

  it('should fallback to naive on backend error', async () => {
    const backend: SpamModelBackend = {
      predict: vi.fn().mockRejectedValue(new Error('Model unavailable')),
      isReady: vi.fn().mockReturnValue(true),
    };
    const classifier = new SpamClassifier({ modelBackend: backend });
    classifier.train([
      { text: 'spam', label: 'spam' },
      { text: 'good', label: 'ham' },
    ]);

    const result = await classifier.predictWithBackend('some text');

    expect(result.backend).toBe('naive');
  });

  it('should still support synchronous predict', () => {
    const classifier = new SpamClassifier();
    classifier.train([
      { text: 'buy free cheap', label: 'spam' },
      { text: 'meeting at 3pm', label: 'ham' },
    ]);

    const result = classifier.predict('meeting tomorrow');
    expect(result).toHaveProperty('isSpam');
    expect(result).toHaveProperty('probability');
    expect(result).toHaveProperty('confidence');
  });
});

// ---------------------------------------------------------------------------
// SentimentAnalyzer with SentimentBackend (AI)
// ---------------------------------------------------------------------------
describe('SentimentAnalyzer with SentimentBackend', () => {
  function createMockSentimentBackend(): SentimentBackend {
    return {
      analyze: vi.fn().mockResolvedValue({ score: 0.8, label: 'positive' as const }),
      isAvailable: vi.fn().mockReturnValue(true),
    };
  }

  it('should report hasBackend() correctly', () => {
    const withBackend = new SentimentAnalyzer({ backend: createMockSentimentBackend() });
    const withoutBackend = new SentimentAnalyzer();

    expect(withBackend.hasBackend()).toBe(true);
    expect(withoutBackend.hasBackend()).toBe(false);
  });

  it('should use AI backend for analyzeWithBackend', async () => {
    const backend = createMockSentimentBackend();
    const analyzer = new SentimentAnalyzer({ backend });

    const result = await analyzer.analyzeWithBackend('This product is amazing!');

    expect(result.backend).toBe('ai');
    expect(result.score).toBe(0.8);
    expect(result.sentiment).toBe('positive');
    expect(backend.analyze).toHaveBeenCalledWith('This product is amazing!');
  });

  it('should fallback to lexicon when backend unavailable', async () => {
    const backend: SentimentBackend = {
      analyze: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(false),
    };
    const analyzer = new SentimentAnalyzer({ backend });

    const result = await analyzer.analyzeWithBackend('This is absolutely wonderful and amazing!');

    expect(result.backend).toBe('lexicon');
    expect(result.sentiment).toBe('positive');
    expect(backend.analyze).not.toHaveBeenCalled();
  });

  it('should fallback to lexicon on backend error', async () => {
    const backend: SentimentBackend = {
      analyze: vi.fn().mockRejectedValue(new Error('API error')),
      isAvailable: vi.fn().mockReturnValue(true),
    };
    const analyzer = new SentimentAnalyzer({ backend });

    const result = await analyzer.analyzeWithBackend('terrible product');

    expect(result.backend).toBe('lexicon');
    expect(result.sentiment).toBe('negative');
  });

  it('should still support synchronous analyze', () => {
    const analyzer = new SentimentAnalyzer();

    const result = analyzer.analyze('I love this!');
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// NEREngine with NERBackend (LLM)
// ---------------------------------------------------------------------------
describe('NEREngine with NERBackend', () => {
  function createMockNERBackend(): NERBackend {
    return {
      extractEntities: vi.fn().mockResolvedValue([
        { text: 'Google', type: 'ORG', start: 0, end: 6, confidence: 0.95 },
        { text: 'San Francisco', type: 'LOCATION', start: 20, end: 33, confidence: 0.92 },
      ]),
      isAvailable: vi.fn().mockReturnValue(true),
    };
  }

  it('should report hasBackend() correctly', () => {
    const withBackend = new NEREngine({ backend: createMockNERBackend() });
    const withoutBackend = new NEREngine();

    expect(withBackend.hasBackend()).toBe(true);
    expect(withoutBackend.hasBackend()).toBe(false);
  });

  it('should use LLM backend for extractWithBackend', async () => {
    const backend = createMockNERBackend();
    const engine = new NEREngine({ backend });

    const result = await engine.extractWithBackend('Google is based in San Francisco');

    expect(result.backend).toBe('llm');
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]!.type).toBe('ORG');
    expect(result.entities[1]!.type).toBe('LOCATION');
    expect(backend.extractEntities).toHaveBeenCalled();
  });

  it('should fallback to regex when backend unavailable', async () => {
    const backend: NERBackend = {
      extractEntities: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(false),
    };
    const engine = new NEREngine({ backend });

    const result = await engine.extractWithBackend('Contact user@example.com');

    expect(result.backend).toBe('regex');
    expect(backend.extractEntities).not.toHaveBeenCalled();
    // Regex should still find the email
    const emails = result.entities.filter((e) => e.type === 'EMAIL');
    expect(emails.length).toBeGreaterThan(0);
  });

  it('should fallback to regex on backend error', async () => {
    const backend: NERBackend = {
      extractEntities: vi.fn().mockRejectedValue(new Error('LLM timeout')),
      isAvailable: vi.fn().mockReturnValue(true),
    };
    const engine = new NEREngine({ backend });

    const result = await engine.extractWithBackend('Visit https://example.com today');

    expect(result.backend).toBe('regex');
    const urls = result.entities.filter((e) => e.type === 'URL');
    expect(urls.length).toBeGreaterThan(0);
  });

  it('should still support synchronous extract', () => {
    const engine = new NEREngine();

    const entities = engine.extract('Send $500 to john@example.com');
    expect(entities.length).toBeGreaterThan(0);
    const money = entities.filter((e) => e.type === 'MONEY');
    expect(money.length).toBeGreaterThan(0);
  });
});
