import type { ScoredChunk, DocumentChunk } from '../types.js';

export interface EmbeddingEntry {
  chunkId: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  text: string;
  /** Source document ID this chunk belongs to. Used for citation tracking. */
  sourceId?: string;
  /** Sequential chunk index within the source document. */
  index?: number;
  /** Position within the original document (page, paragraph, or timestamp). */
  position?: DocumentChunk['position'];
}

export interface EmbeddingStore {
  addEmbeddings(notebookId: string, chunks: EmbeddingEntry[]): void;
  search(notebookId: string, queryVector: number[], topK: number): ScoredChunk[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

interface StoredEntry extends EmbeddingEntry {
  sourceId: string;
  index: number;
  position: DocumentChunk['position'];
}

export class InMemoryEmbeddingStore implements EmbeddingStore {
  private store = new Map<string, StoredEntry[]>();

  addEmbeddings(notebookId: string, chunks: EmbeddingEntry[]): void {
    const existing = this.store.get(notebookId) ?? [];
    for (const chunk of chunks) {
      existing.push({
        chunkId: chunk.chunkId,
        vector: chunk.vector,
        metadata: chunk.metadata,
        text: chunk.text,
        sourceId: chunk.sourceId ?? '',
        index: chunk.index ?? 0,
        position: chunk.position ?? {},
      });
    }
    this.store.set(notebookId, existing);
  }

  search(notebookId: string, queryVector: number[], topK: number): ScoredChunk[] {
    const entries = this.store.get(notebookId) ?? [];
    const scored = entries.map((entry) => ({
      id: entry.chunkId,
      sourceId: entry.sourceId,
      text: entry.text,
      index: entry.index,
      position: entry.position,
      score: cosineSimilarity(queryVector, entry.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
