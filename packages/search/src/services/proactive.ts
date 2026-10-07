// ============================================================================
// Proactive Search - Context-driven related items discovery
// ============================================================================

import { z } from 'zod';
import type { VectorClient } from './vector-client';

export const ProactiveContextSchema = z.object({
  type: z.string(),
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type ProactiveContext = z.infer<typeof ProactiveContextSchema>;

export const ProactiveResultSchema = z.object({
  id: z.string(),
  type: z.string(),
  score: z.number(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ProactiveResult = z.infer<typeof ProactiveResultSchema>;

export interface ProactiveSearchOptions {
  limit?: number;
  collections?: string[];
  minScore?: number;
}

/**
 * ProactiveSearch - Finds related items across indexes using vector similarity
 *
 * Given a document context (type, content snippet, metadata), discovers
 * related items across all indexes. Used for "related items" sidebars
 * and contextual suggestions.
 */
export class ProactiveSearch {
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

  async getRelatedItems(
    context: ProactiveContext,
    options: ProactiveSearchOptions = {},
  ): Promise<ProactiveResult[]> {
    const validated = ProactiveContextSchema.parse(context);
    const limit = options.limit ?? 10;
    const collections = options.collections ?? this.defaultCollections;
    const minScore = options.minScore ?? 0.5;

    if (!validated.content.trim()) {
      return [];
    }

    const embedding = await this.embedFn(validated.content);

    const searchPromises = collections.map(async (collection) => {
      try {
        const results = await this.vectorClient.search(collection, embedding, limit, {
          must_not: [{ key: 'id', match: { value: validated.id } }],
        });

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
