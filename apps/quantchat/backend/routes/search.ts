import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MessageService } from '../services/message.service';
import { PrismaEncryptedSearchIndex } from '../services/encrypted-search.service';

// ============================================================================
// QuantChat — Unified search route (W5, design Component 5 / Algorithm 5)
// ============================================================================
//
// A single search entry point that fans a query out across the two
// search backends QuantChat maintains, keeping each kind of message on the
// path that can actually serve it (design Component 5 "Responsibilities"):
//
//   * PLAINTEXT (non-E2EE) messages stay on the existing Postgres `ILIKE`
//     path via `MessageService.searchMessages`. That path already EXCLUDES
//     E2E ciphertext (it filters out content beginning with `{"ciphertext"`),
//     so plaintext search behaviour is preserved exactly as before
//     (Requirement 15.7). A free-text `q` drives this path.
//
//   * E2EE messages route through the client-built BLIND INDEX via
//     `PrismaEncryptedSearchIndex.search`. Server-side full-text over
//     ciphertext is impossible by design, so the client tokenizes plaintext,
//     computes HMAC(Search_Key, token) per distinct token, and sends ONLY the
//     opaque `tokenHashes`. The server matches hashes and returns owner-scoped
//     candidate message ids; final ranking/snippeting happens client-side after
//     local decryption (design Algorithm 5). The Search_Key never leaves the
//     client and no plaintext or key material reaches the server (Req 15.6,
//     16.1).
//
// A request may carry `q`, `tokenHashes`, or both; each present input is served
// by its dedicated path and the two result sets are returned side by side so a
// caller can request plaintext and encrypted matches in one round trip.
// ============================================================================

/**
 * Unified search request. At least one of `q` (plaintext ILIKE) or
 * `tokenHashes` (blind-index) must be supplied. Pagination is shared across
 * whichever path(s) run.
 */
const searchSchema = z
  .object({
    /** Free-text query served by the existing Postgres ILIKE path (plaintext only). */
    q: z.string().min(1).max(1000).optional(),
    /**
     * Client-computed HMAC query token hashes for the blind index. The server
     * matches these against stored hashes only — it never sees plaintext tokens
     * or the Search_Key (Req 15.1, 15.6).
     */
    tokenHashes: z.array(z.string().min(1)).max(100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((data) => data.q !== undefined || (data.tokenHashes?.length ?? 0) > 0, {
    message: 'Provide a plaintext query "q" and/or blind-index "tokenHashes"',
  });

/**
 * Blind-index upload request (W5, Requirement 14.1). The client uploads ONLY
 * the message id, conversation id, and the opaque HMAC token hashes for a sent
 * E2EE message. The owner (Search_Key owner) is taken from the authenticated
 * session, NOT the body, so a caller can only ever write to their own index
 * (Req 14.3). `.strict()` rejects any extra field, preserving the zero-knowledge
 * invariant — plaintext / ciphertext / keys can never be smuggled in (Req 14.4,
 * 16.1, 16.2).
 */
const indexUploadSchema = z
  .object({
    messageId: z.string().min(1),
    conversationId: z.string().min(1),
    tokenHashes: z.array(z.string().min(1)).max(1000),
  })
  .strict();

/**
 * Unified search routes, registered under the `/search` prefix in `buildApp()`.
 */
export default async function searchRoutes(fastify: FastifyInstance) {
  // POST /search/index — accept a client-built blind-index upload for a sent
  // E2EE message (Req 14.1). Token hashes are computed client-side with the
  // Search_Key (which never leaves the client, Req 14.2); the server persists
  // ONLY the message id, conversation id, owner id, and opaque token hashes via
  // PrismaEncryptedSearchIndex.index, which additionally rejects any disallowed
  // field (Req 14.3, 14.4, 16.1). The owner is the authenticated user.
  fastify.post('/index', async (request, reply) => {
    const parseResult = indexUploadSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { messageId, conversationId, tokenHashes } = parseResult.data;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;

    // Owner is bound to the session, never the client body — one user can only
    // ever write to their own blind index (Req 14.3, 15.5).
    await new PrismaEncryptedSearchIndex(prisma as never).index({
      messageId,
      conversationId,
      userId,
      tokenHashes,
    });

    return reply.status(201).send({
      success: true,
      data: { message: 'Blind-index entry stored' },
    });
  });

  // POST /search — unified search entry point. Routes a plaintext `q` through
  // the existing ILIKE path (non-E2EE messages) and `tokenHashes` through the
  // blind index (E2EE messages), returning both result sets (Req 15.7).
  fastify.post('/', async (request, reply) => {
    const parseResult = searchSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { q, tokenHashes, page, pageSize } = parseResult.data;
    const opts = { page, pageSize };

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;

    // PLAINTEXT path — unchanged Postgres ILIKE search (excludes E2E ciphertext).
    const plaintext =
      q !== undefined
        ? await new MessageService(prisma as never).searchMessages(userId, q, opts)
        : null;

    // E2EE path — owner-scoped blind-index match over opaque token hashes.
    const encrypted =
      tokenHashes && tokenHashes.length > 0
        ? await new PrismaEncryptedSearchIndex(prisma as never).search(userId, tokenHashes, opts)
        : null;

    return reply.send({ success: true, data: { plaintext, encrypted } });
  });
}
