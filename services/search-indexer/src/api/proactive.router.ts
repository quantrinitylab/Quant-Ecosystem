// ============================================================================
// Proactive Search Router - Context-driven related items endpoint
// ============================================================================

import { z } from 'zod';
import type { ProactiveSearch, ProactiveResult } from '@quant/search';
import type { PermissionFilter, SearchResultWithPermissions } from '@quant/search';

export const ProactiveRequestSchema = z.object({
  contextType: z.enum(['email', 'message', 'post', 'video', 'file', 'calendar_event']),
  contextId: z.string(),
  contentSnippet: z.string(),
  userId: z.string(),
  isAdmin: z.boolean().default(false),
  limit: z.number().int().positive().max(20).default(5),
});

export type ProactiveRequest = z.infer<typeof ProactiveRequestSchema>;

export const ProactiveResponseSchema = z.object({
  relatedItems: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      relevanceScore: z.number(),
      snippet: z.string(),
    }),
  ),
  contextType: z.string(),
  took: z.number(),
});

export type ProactiveResponse = z.infer<typeof ProactiveResponseSchema>;

/**
 * ProactiveRouter - Returns related items for a given context
 *
 * Takes a content context (document type, id, content snippet) and uses
 * ProactiveSearch to find related items across all indexes. Results are
 * filtered by permissions before being returned.
 */
export class ProactiveRouter {
  constructor(
    private readonly proactiveSearch: ProactiveSearch,
    private readonly permissionFilter: PermissionFilter,
  ) {}

  async getRelatedItems(request: ProactiveRequest): Promise<ProactiveResponse> {
    const start = Date.now();
    const validated = ProactiveRequestSchema.parse(request);

    // Get related items via ProactiveSearch
    const relatedItems: ProactiveResult[] = await this.proactiveSearch.getRelatedItems(
      {
        type: validated.contextType,
        id: validated.contextId,
        content: validated.contentSnippet,
      },
      { limit: validated.limit },
    );

    // Apply permission filter to results
    // TODO: For production scale, add pre-query filtering into the vector search layer
    // to avoid retrieving unauthorized results in the first place.
    const withPermissions: SearchResultWithPermissions[] = relatedItems.map((item) => ({
      id: item.id,
      ownerUserId: String(item.metadata?.userId ?? ''),
      visibility: (item.metadata?.visibility as 'public' | 'private' | 'shared') ?? 'public',
      sharedWith: (item.metadata?.sharedWith as string[]) ?? [],
      score: item.score,
      document: item.metadata ?? {},
    }));

    const filtered = this.permissionFilter.filterResults(withPermissions, validated.userId, {
      userId: validated.userId,
      isAdmin: validated.isAdmin,
    });

    // Map filtered items back to response format
    const filteredIds = new Set(filtered.map((f) => f.id));
    const responseItems = relatedItems
      .filter((item) => filteredIds.has(item.id))
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title ?? '',
        relevanceScore: item.score,
        snippet: item.snippet ?? '',
      }));

    const took = Date.now() - start;

    return ProactiveResponseSchema.parse({
      relatedItems: responseItems,
      contextType: validated.contextType,
      took,
    });
  }
}
