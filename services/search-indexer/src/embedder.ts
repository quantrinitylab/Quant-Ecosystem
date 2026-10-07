// ============================================================================
// BatchEmbedder - Generates vector embeddings via @quant/ai routing
// ============================================================================

/**
 * Interface for AI embedding service.
 * Decoupled from concrete implementation for testability.
 */
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * BatchEmbedder
 *
 * Wraps an EmbeddingProvider to provide single-text and batch embedding
 * operations. In production the provider routes to bge-large-en-v1.5
 * via the @quant/ai embedding_bulk task type.
 */
export class BatchEmbedder {
  constructor(private readonly provider: EmbeddingProvider) {}

  /**
   * Embed a single text string into a vector.
   * Returns empty array for empty/whitespace-only text.
   */
  async embedText(text: string): Promise<number[]> {
    if (!text.trim()) {
      return [];
    }
    const results = await this.provider.embed([text]);
    const first = results[0];
    if (!first) {
      return [];
    }
    return first;
  }

  /**
   * Embed a batch of text strings into vectors.
   * Filters out empty strings before sending to provider.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const nonEmpty = texts.filter((t) => t.trim().length > 0);
    if (nonEmpty.length === 0) {
      return [];
    }
    return this.provider.embed(nonEmpty);
  }
}
