// ============================================================================
// Find Similar Service - Cross-collection similar document discovery
// ============================================================================

import type { VectorClient, VectorSearchResult } from './vector-client';

export interface FindSimilarOptions {
  limit?: number;
  collections?: string[];
  minScore?: number;
}

export interface FindSimilarResult {
  id: string;
  type: string;
  score: number;
  title?: string;
  snippet?: string;
  metadata: Record<string, unknown>;
}

/**
 * FindSimilarService - Discovers similar documents across vector collections
 *
 * Given a document ID and its text content, generates an embedding and
 * searches across all vector collections for similar documents, excluding
 * the source document from results.
 *
 * Follows the ProactiveSearch pattern for cross-collection vector search.
 */
export class FindSimilarService {
  private readonly defaultCollections = [
    'emails-vectors',
    'messages-vectors',
    'files-vectors',
    'videos-vectors',
    'posts-vectors',
  ];

  constructor(
    private readonly vectorClient: VectorClient,
    private readonly embedFn: (text: string) => Promise<number[]>,
  ) {}

  async findSimilar(
    documentId: string,
    text: string,
    options: FindSimilarOptions = {},
  ): Promise<FindSimilarResult[]> {
    const limit = options.limit ?? 10;
    const collections = options.collections ?? this.defaultCollections;
    const minScore = options.minScore ?? 0.5;

    if (!text.trim()) {
      return [];
    }

    const embedding = await this.embedFn(text);

    const searchPromises = collections.map(async (collection) => {
      try {
        const results: VectorSearchResult[] = await this.vectorClient.search(
          collection,
          embedding,
          limit,
          {
            must_not: [{ key: 'id', match: { value: documentId } }],
          },
        );

        return results
          .filter((r) => r.score >= minScore)
          .map((r) => ({
            id: String(r.id),
            type: this.getTypeFromCollection(collection),
            score: r.score,
            title: r.payload.title as string | undefined,
            snippet: r.payload.snippet as string | undefined,
            metadata: r.payload,
          }));
      } catch {
        return [];
      }
    });

    const allResults = (await Promise.all(searchPromises)).flat();

    return allResults.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private getTypeFromCollection(collection: string): string {
    const match = collection.match(/^(\w+)-vectors$/);
    return match?.[1] ?? 'unknown';
  }
}
