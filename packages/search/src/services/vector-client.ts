// ============================================================================
// Vector Client - Qdrant REST API wrapper
// ============================================================================

import { z } from 'zod';

export const QdrantPointSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  payload: z.record(z.unknown()).optional(),
});

export type QdrantPoint = z.infer<typeof QdrantPointSchema>;

export const VectorSearchOptionsSchema = z.object({
  limit: z.number().int().positive().default(10),
  filter: z
    .object({
      must: z
        .array(
          z.object({
            key: z.string(),
            match: z.object({ value: z.unknown() }),
          }),
        )
        .optional(),
      must_not: z
        .array(
          z.object({
            key: z.string(),
            match: z.object({ value: z.unknown() }),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type VectorSearchOptions = z.infer<typeof VectorSearchOptionsSchema>;

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface CollectionInfo {
  name: string;
  vectorSize: number;
  pointsCount: number;
  status: string;
}

const CreateCollectionInputSchema = z.object({
  name: z.string().min(1),
  vectorSize: z.number().int().positive(),
});

const UpsertPointsInputSchema = z.object({
  collection: z.string().min(1),
  points: z.array(QdrantPointSchema).min(1),
});

const DeletePointsInputSchema = z.object({
  collection: z.string().min(1),
  ids: z.array(z.string()).min(1),
});

export interface VectorClientOptions {
  apiKey?: string;
  https?: boolean;
}

/**
 * VectorClient - Qdrant REST API wrapper
 *
 * Provides typed methods for managing vector collections and performing
 * similarity searches via the Qdrant HTTP API.
 */
export class VectorClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(host: string, port: number = 6333, options?: VectorClientOptions) {
    const protocol = options?.https ? 'https' : host.startsWith('http') ? '' : 'http';
    if (protocol && !host.startsWith('http')) {
      this.baseUrl = `${protocol}://${host}:${port}`;
    } else if (options?.https && host.startsWith('http://')) {
      this.baseUrl = `${host.replace('http://', 'https://')}:${port}`;
    } else {
      this.baseUrl = host.startsWith('http') ? `${host}:${port}` : `http://${host}:${port}`;
    }
    this.apiKey = options?.apiKey;
  }

  private getHeaders(contentType?: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }
    return headers;
  }

  async createCollection(name: string, vectorSize: number): Promise<void> {
    const input = CreateCollectionInputSchema.parse({ name, vectorSize });

    const response = await fetch(`${this.baseUrl}/collections/${input.name}`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({
        vectors: {
          size: input.vectorSize,
          distance: 'Cosine',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create collection: ${error}`);
    }
  }

  async upsertPoints(collection: string, points: QdrantPoint[]): Promise<void> {
    const input = UpsertPointsInputSchema.parse({ collection, points });

    const response = await fetch(`${this.baseUrl}/collections/${input.collection}/points`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({
        points: input.points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload ?? {},
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upsert points: ${error}`);
    }
  }

  async search(
    collection: string,
    vector: number[],
    limit: number = 10,
    filter?: VectorSearchOptions['filter'],
  ): Promise<VectorSearchResult[]> {
    const options = VectorSearchOptionsSchema.parse({ limit, filter });

    const body: Record<string, unknown> = {
      vector,
      limit: options.limit,
      with_payload: true,
    };

    if (options.filter) {
      body.filter = options.filter;
    }

    const response = await fetch(`${this.baseUrl}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to search: ${error}`);
    }

    const data = (await response.json()) as {
      result: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
    };

    return data.result.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload ?? {},
    }));
  }

  async deletePoints(collection: string, ids: string[]): Promise<void> {
    const input = DeletePointsInputSchema.parse({ collection, ids });

    const response = await fetch(`${this.baseUrl}/collections/${input.collection}/points/delete`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({
        points: input.ids,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete points: ${error}`);
    }
  }

  async getCollectionInfo(collection: string): Promise<CollectionInfo> {
    const url = `${this.baseUrl}/collections/${collection}`;
    const response = await fetch(url, { headers: this.getHeaders(false) });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get collection info: ${error}`);
    }

    const data = (await response.json()) as {
      result: {
        config: { params: { vectors: { size: number } } };
        points_count: number;
        status: string;
      };
    };

    return {
      name: collection,
      vectorSize: data.result.config.params.vectors.size,
      pointsCount: data.result.points_count,
      status: data.result.status,
    };
  }
}
