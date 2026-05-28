import { QAEngine } from '../qa/qa-engine.js';
import { InMemoryEmbeddingStore } from '../embeddings/embedding-store.js';

describe('QAEngine', () => {
  let store: InMemoryEmbeddingStore;
  let engine: QAEngine;
  const embed = (_text: string) => [1, 0, 0];

  beforeEach(() => {
    store = new InMemoryEmbeddingStore();
    engine = new QAEngine(store, embed);
  });

  it('returns answer with citations when relevant chunks exist', () => {
    store.addEmbeddings('nb1', [
      {
        chunkId: 'c1',
        vector: [1, 0, 0],
        text: 'The sky is blue.',
        sourceId: 's1',
        index: 0,
        position: { page: 1 },
      },
    ]);
    const result = engine.ask('nb1', 'What color is the sky?');
    expect(result.answer).toContain('sky is blue');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]!.sourceId).toBe('s1');
    expect(result.fromWebMode).toBe(false);
  });

  it('enforces source guard when no relevant chunks found', () => {
    store.addEmbeddings('nb1', [
      {
        chunkId: 'c1',
        vector: [0, 0, 1],
        text: 'Unrelated content.',
        sourceId: 's1',
        index: 0,
        position: {},
      },
    ]);
    const result = engine.ask('nb1', 'What is quantum physics?');
    expect(result.answer).toContain('No relevant information found');
    expect(result.citations).toHaveLength(0);
  });

  it('source guard triggers on empty notebook', () => {
    const result = engine.ask('empty-nb', 'Any question');
    expect(result.answer).toContain('No relevant information found');
    expect(result.citations).toHaveLength(0);
    expect(result.fromWebMode).toBe(false);
  });

  it('webMode bypasses source guard', () => {
    store.addEmbeddings('nb1', [
      {
        chunkId: 'c1',
        vector: [0, 0, 1],
        text: 'Low relevance content.',
        sourceId: 's1',
        index: 0,
        position: {},
      },
    ]);
    const result = engine.ask('nb1', 'Anything', { webMode: true });
    expect(result.fromWebMode).toBe(true);
    expect(result.answer.length).toBeGreaterThan(0);
  });
});
