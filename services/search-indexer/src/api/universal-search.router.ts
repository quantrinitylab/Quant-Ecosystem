// ============================================================================
// Universal Search API Router - Full search pipeline HTTP endpoints
// ============================================================================

import { z } from 'zod';
import type { UniversalSearchService, UniversalSearchResponse } from '@quant/search';
import type { FindSimilarService, FindSimilarResult } from '@quant/search';
import type { TypeaheadService, TypeaheadResponse } from '@quant/search';
import type { SearchHistoryService, SearchHistoryEntry } from '@quant/search';

// ---- Permission Resolution ----

/**
 * UserPermissions - Derived from server-side auth, never from client input.
 */
export interface UserPermissions {
  userId: string;
  isAdmin: boolean;
}

/**
 * PermissionResolver - Derives user permissions from the authenticated userId.
 *
 * The server framework (middleware/auth layer) provides a concrete implementation
 * that checks JWT claims, session data, or RBAC tables. The router never trusts
 * client-supplied permission claims.
 */
export interface PermissionResolver {
  resolve(userId: string): Promise<UserPermissions> | UserPermissions;
}

/**
 * Default resolver for testing/development - always returns non-admin permissions.
 */
export class DefaultPermissionResolver implements PermissionResolver {
  resolve(userId: string): UserPermissions {
    return { userId, isAdmin: false };
  }
}

// ---- Request/Response Schemas ----

export const UniversalSearchRequestSchema = z.object({
  query: z.string().min(1),
  userId: z.string().min(1),
  options: z
    .object({
      aiMode: z.boolean().default(false),
      scopes: z.array(z.string()).optional(),
      limit: z.number().int().positive().max(100).default(20),
      page: z.number().int().positive().default(1),
      incognito: z.boolean().default(false),
    })
    .optional(),
});

export type UniversalSearchRequest = z.infer<typeof UniversalSearchRequestSchema>;

export const UniversalSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      document: z.record(z.unknown()),
      snippet: z.object({
        text: z.string(),
        matchCount: z.number(),
      }),
    }),
  ),
  totalResults: z.number(),
  ragAnswer: z
    .object({
      answer: z.string(),
      citations: z.array(
        z.object({
          resultId: z.string(),
          excerpt: z.string(),
          confidence: z.number(),
        }),
      ),
    })
    .optional(),
  latencyMs: z.number(),
});

export type UniversalSearchAPIResponse = z.infer<typeof UniversalSearchResponseSchema>;

export const SuggestionsRequestSchema = z.object({
  partial: z.string().min(1),
  userId: z.string().min(1),
  limit: z.number().int().positive().max(20).default(10),
});

export type SuggestionsRequest = z.infer<typeof SuggestionsRequestSchema>;

export const SuggestionsResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string(),
      type: z.enum(['recent', 'popular', 'autocomplete']),
    }),
  ),
});

export type SuggestionsResponse = z.infer<typeof SuggestionsResponseSchema>;

export const FindSimilarRequestSchema = z.object({
  documentId: z.string().min(1),
  text: z.string().min(1),
  limit: z.number().int().positive().max(50).default(10),
  collections: z.array(z.string()).optional(),
  minScore: z.number().min(0).max(1).default(0.5),
});

export type FindSimilarRequest = z.infer<typeof FindSimilarRequestSchema>;

export const FindSimilarResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      score: z.number(),
      title: z.string().optional(),
      snippet: z.string().optional(),
      metadata: z.record(z.unknown()),
    }),
  ),
  took: z.number(),
});

export type FindSimilarResponse = z.infer<typeof FindSimilarResponseSchema>;

export const HistoryRequestSchema = z.object({
  userId: z.string().min(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

export const HistoryResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      query: z.string(),
      timestamp: z.string(),
    }),
  ),
});

export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export const ClearHistoryRequestSchema = z.object({
  userId: z.string().min(1),
});

export type ClearHistoryRequest = z.infer<typeof ClearHistoryRequestSchema>;

/**
 * UniversalSearchRouter - HTTP-facing search API endpoints
 *
 * Exposes:
 * - POST /search - Full universal search with optional RAG
 * - GET /search/suggestions - Typeahead/search-as-you-type
 * - POST /search/similar - Find similar documents
 * - GET /search/history - User search history
 * - DELETE /search/history - Clear user search history
 *
 * Each endpoint validates input with Zod schemas, calls the appropriate
 * service, and returns typed JSON responses.
 */
export class UniversalSearchRouter {
  private readonly permissionResolver: PermissionResolver;

  constructor(
    private readonly universalSearch: UniversalSearchService,
    private readonly findSimilarService: FindSimilarService,
    private readonly typeaheadService: TypeaheadService,
    private readonly searchHistory: SearchHistoryService,
    permissionResolver?: PermissionResolver,
  ) {
    this.permissionResolver = permissionResolver ?? new DefaultPermissionResolver();
  }

  /**
   * POST /search - Full universal search
   */
  async search(request: UniversalSearchRequest): Promise<UniversalSearchAPIResponse> {
    const validated = UniversalSearchRequestSchema.parse(request);
    const permissions = await this.permissionResolver.resolve(validated.userId);

    const response: UniversalSearchResponse = await this.universalSearch.search({
      query: validated.query,
      userId: validated.userId,
      permissions,
      options: validated.options
        ? {
            aiMode: validated.options.aiMode,
            scopes: validated.options.scopes,
            limit: validated.options.limit,
            page: validated.options.page,
            incognito: validated.options.incognito,
          }
        : undefined,
    });

    return {
      query: response.query,
      results: response.results.map((r) => ({
        id: r.id,
        score: r.score,
        document: r.document,
        snippet: r.snippet,
      })),
      totalResults: response.totalResults,
      ragAnswer: response.ragAnswer
        ? {
            answer: response.ragAnswer.answer,
            citations: response.ragAnswer.citations,
          }
        : undefined,
      latencyMs: response.latencyMs,
    };
  }

  /**
   * GET /search/suggestions - Typeahead search-as-you-type
   */
  async getSuggestions(request: SuggestionsRequest): Promise<SuggestionsResponse> {
    const validated = SuggestionsRequestSchema.parse(request);

    const response: TypeaheadResponse = await this.typeaheadService.getSuggestions(
      validated.partial,
      validated.userId,
      { limit: validated.limit },
    );

    return SuggestionsResponseSchema.parse({
      suggestions: response.suggestions,
    });
  }

  /**
   * POST /search/similar - Find similar documents
   */
  async findSimilar(request: FindSimilarRequest): Promise<FindSimilarResponse> {
    const start = Date.now();
    const validated = FindSimilarRequestSchema.parse(request);

    const results: FindSimilarResult[] = await this.findSimilarService.findSimilar(
      validated.documentId,
      validated.text,
      {
        limit: validated.limit,
        collections: validated.collections,
        minScore: validated.minScore,
      },
    );

    const took = Date.now() - start;

    return FindSimilarResponseSchema.parse({
      results: results.map((r) => ({
        id: r.id,
        type: r.type,
        score: r.score,
        title: r.title,
        snippet: r.snippet,
        metadata: r.metadata,
      })),
      took,
    });
  }

  /**
   * GET /search/history - Get user search history
   */
  async getHistory(request: HistoryRequest): Promise<HistoryResponse> {
    const validated = HistoryRequestSchema.parse(request);

    const entries: SearchHistoryEntry[] = this.searchHistory.getHistory(
      validated.userId,
      validated.limit,
    );

    return HistoryResponseSchema.parse({
      entries: entries.map((e) => ({
        id: e.id,
        query: e.query,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  }

  /**
   * DELETE /search/history - Clear user search history
   */
  async clearHistory(request: ClearHistoryRequest): Promise<{ success: boolean }> {
    const validated = ClearHistoryRequestSchema.parse(request);
    this.searchHistory.clearHistory(validated.userId);
    return { success: true };
  }
}
