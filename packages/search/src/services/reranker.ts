// ============================================================================
// Cohere Reranker - Relevance reranking via Cohere API
// ============================================================================

import { z } from 'zod';

export const RerankDocumentSchema = z.object({
  id: z.string(),
  text: z.string(),
  score: z.number().optional(),
});

export type RerankDocument = z.infer<typeof RerankDocumentSchema>;

export const RerankOptionsSchema = z.object({
  topN: z.number().int().positive().default(10),
  model: z.string().default('rerank-english-v3.0'),
});

export type RerankOptions = z.infer<typeof RerankOptionsSchema>;

export interface RerankResult {
  id: string;
  text: string;
  relevanceScore: number;
  originalIndex: number;
}

const CohereResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number(),
      relevance_score: z.number(),
    }),
  ),
});

/**
 * CohereReranker - Wraps the Cohere rerank API
 *
 * Takes top-50 candidates and returns topN (default 10) reranked by relevance.
 * Falls back to original ordering on API failure.
 */
export class CohereReranker {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiKey: string, apiUrl: string = 'https://api.cohere.ai/v1/rerank') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  async rerank(
    query: string,
    documents: RerankDocument[],
    topN: number = 10,
  ): Promise<RerankResult[]> {
    const options = RerankOptionsSchema.parse({ topN });
    const validatedDocs = z.array(RerankDocumentSchema).parse(documents);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          query,
          documents: validatedDocs.map((d) => d.text),
          top_n: options.topN,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status}`);
      }

      const data = CohereResponseSchema.parse(await response.json());

      return data.results.map((r) => ({
        id: validatedDocs[r.index]!.id,
        text: validatedDocs[r.index]!.text,
        relevanceScore: r.relevance_score,
        originalIndex: r.index,
      }));
    } catch {
      // Fallback to original ordering on failure
      return validatedDocs.slice(0, options.topN).map((doc, idx) => ({
        id: doc.id,
        text: doc.text,
        relevanceScore: doc.score ?? 0,
        originalIndex: idx,
      }));
    }
  }
}
