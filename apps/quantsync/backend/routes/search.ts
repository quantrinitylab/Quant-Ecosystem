import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SearchService } from '../services/search.service';

// ============================================================================
// QuantWave search / discovery routes.
//
//   GET /search              ?q= &scope= &page= &pageSize=   -> grouped results
//   GET /search/suggestions  ?q= &limit=                     -> typeahead entries
//   GET /explore             ?limit=                         -> discovery grid
//   GET /trending            ?limit= &windowHours=           -> trending posts
//
// `/search`, `/search/suggestions` and `/explore` are registered under the `/search`
// prefix plus two top-level paths; see `backend/app.ts`. The matching Next proxies
// (`src/app/api/{search,search/suggestions,explore,trending}/route.ts`) already forwarded
// to exactly these paths, but nothing answered them until now.
//
// Reads are public-by-nature (trending/explore need no session), so these handlers do not
// require `request.auth`; the global auth hook in `createApp` still applies unless a path
// is listed in `publicPaths`.
// ============================================================================

const searchQuerySchema = z.object({
  q: z.string().optional(),
  scope: z.enum(['all', 'posts', 'people', 'communities']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
});

const suggestionsQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  windowHours: z.coerce.number().int().min(1).max(168).optional(),
});

const exploreQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** Registered at the `/search` prefix. */
export default async function searchRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const search = new SearchService(prisma);

  fastify.get('/', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { q = '', scope, page, pageSize } = parsed.data;
    const data = await search.search(q, { scope, page, pageSize });
    return reply.send({ success: true, data });
  });

  fastify.get('/suggestions', async (request, reply) => {
    const parsed = suggestionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const { q = '', limit } = parsed.data;
    const data = await search.suggestions(q, limit);
    return reply.send({ success: true, data });
  });
}

/**
 * Top-level discovery routes that do not live under `/search`: registered without a prefix
 * so they answer `GET /explore` and `GET /trending` exactly as the proxies expect.
 */
export async function discoveryRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;
  const search = new SearchService(prisma);

  fastify.get('/explore', async (request, reply) => {
    const parsed = exploreQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const data = await search.explore({ limit: parsed.data.limit });
    return reply.send({ success: true, data });
  });

  fastify.get('/trending', async (request, reply) => {
    const parsed = trendingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const data = await search.trending({
      limit: parsed.data.limit,
      windowHours: parsed.data.windowHours,
    });
    return reply.send({ success: true, data });
  });
}
