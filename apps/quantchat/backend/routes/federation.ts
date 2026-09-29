import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FederationModeration, APIKeyManager } from '@quant/federation';
import { createAppError } from '@quant/server-core';

// ============================================================================
// federation seam — decorator + SCOPED routes (per-app lane, Task 14.1)
// ============================================================================
//
// Task 14.1 (Req 3.1, 3.2, 7.4). Surfaces the real, as-shipped `@quant/federation`
// engine over authenticated HTTP under the `/federation` prefix in quantchat,
// mirroring the proven quantneon federation seam
// (apps/quantneon/backend/routes/federation.ts).
//
// federation is a SENSITIVE engine (design "Security Considerations", Req 7.4):
// every route below declares a fine-grained scope via `requireAuth({ scopes })`
// — `federation:read` for reads, `federation:write` for mutations — ON TOP of
// the global `onRequest` auth hook installed by `createApp()` (which already
// 401s unauthenticated requests). The engine's persistence is in-memory (no new
// schema — Req 9.5); the service is a decorated singleton constructed once at
// boot, never per-request.
//
// The composed federation service bundles two as-shipped engine exports:
//   - FederationModeration: instance block / allow lists (who we federate with).
//   - APIKeyManager:        developer-platform API keys (scoped federation
//                           credentials owned by a user).
// Inputs are Zod-validated; responses use the canonical `{ success, data }`
// envelope (errors produced centrally by error-handler.ts / auth.ts).

/**
 * The composite federation service decorated onto the Fastify instance in
 * `buildApp()`. Pure composition of as-shipped engine exports — no rewrite.
 */
export interface FederationService {
  moderation: FederationModeration;
  apiKeys: APIKeyManager;
}

// Layer 2 type augmentation (mirrors prisma.ts / auth.ts).
declare module 'fastify' {
  interface FastifyInstance {
    federation: FederationService;
  }
}

/** Construct the federation engine bundle once at boot (decorated singleton). */
export function createFederationService(): FederationService {
  return {
    moderation: new FederationModeration(),
    apiKeys: new APIKeyManager(),
  };
}

const domainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+$/i, 'must be a hostname');

const instanceBodySchema = z.object({ domain: domainSchema });
const domainParamsSchema = z.object({ domain: domainSchema });

const createKeySchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().optional(),
});
const keyParamsSchema = z.object({ id: z.string().min(1) });

/**
 * federation seam routes, registered under `/federation` in `buildApp()`.
 */
export default async function federationRoutes(fastify: FastifyInstance) {
  // --- Instance moderation (who quantchat federates with) -------------------

  // GET /federation/instances/:domain — federation status of a remote instance.
  fastify.get(
    '/instances/:domain',
    { preHandler: fastify.requireAuth({ scopes: ['federation:read'] }) },
    async (request, reply) => {
      const parsed = domainParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      const { domain } = parsed.data;
      return reply.send({
        success: true,
        data: {
          domain,
          blocked: fastify.federation.moderation.isBlocked(domain),
          allowed: fastify.federation.moderation.isAllowed(domain),
        },
      });
    },
  );

  // POST /federation/instances/block — block a remote instance.
  fastify.post(
    '/instances/block',
    { preHandler: fastify.requireAuth({ scopes: ['federation:write'] }) },
    async (request, reply) => {
      const parsed = instanceBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.federation.moderation.blockInstance(parsed.data.domain);
      return reply.status(201).send({
        success: true,
        data: { domain: parsed.data.domain, blocked: true },
      });
    },
  );

  // DELETE /federation/instances/block/:domain — unblock a remote instance.
  fastify.delete(
    '/instances/block/:domain',
    { preHandler: fastify.requireAuth({ scopes: ['federation:write'] }) },
    async (request, reply) => {
      const parsed = domainParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.federation.moderation.unblockInstance(parsed.data.domain);
      return reply.send({ success: true, data: { domain: parsed.data.domain, blocked: false } });
    },
  );

  // POST /federation/instances/allow — add a remote instance to the allowlist.
  fastify.post(
    '/instances/allow',
    { preHandler: fastify.requireAuth({ scopes: ['federation:write'] }) },
    async (request, reply) => {
      const parsed = instanceBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      fastify.federation.moderation.allowInstance(parsed.data.domain);
      return reply.status(201).send({
        success: true,
        data: { domain: parsed.data.domain, allowed: true },
      });
    },
  );

  // --- Developer-platform API keys (scoped federation credentials) ----------

  // GET /federation/keys — list the authenticated user's federation API keys.
  fastify.get(
    '/keys',
    { preHandler: fastify.requireAuth({ scopes: ['federation:read'] }) },
    async (request, reply) => {
      const keys = fastify.federation.apiKeys
        .listByOwner(request.auth.userId)
        // Never return the raw secret on a list.
        .map(({ key: _secret, ...rest }) => rest);
      return reply.send({ success: true, data: { keys } });
    },
  );

  // POST /federation/keys — mint a scoped API key owned by the current user.
  fastify.post(
    '/keys',
    { preHandler: fastify.requireAuth({ scopes: ['federation:write'] }) },
    async (request, reply) => {
      const parsed = createKeySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const created = fastify.federation.apiKeys.create({
        name: parsed.data.name,
        ownerId: request.auth.userId,
        scopes: parsed.data.scopes,
        expiresAt: parsed.data.expiresAt,
      });
      // The raw key is returned ONCE on creation (standard API-key UX).
      return reply.status(201).send({ success: true, data: { apiKey: created } });
    },
  );

  // DELETE /federation/keys/:id — revoke an API key the caller owns.
  fastify.delete(
    '/keys/:id',
    { preHandler: fastify.requireAuth({ scopes: ['federation:write'] }) },
    async (request, reply) => {
      const parsed = keyParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      const existing = fastify.federation.apiKeys.getKey(parsed.data.id);
      if (!existing || existing.ownerId !== request.auth.userId) {
        throw createAppError('API key not found', 404, 'NOT_FOUND');
      }
      fastify.federation.apiKeys.revoke(parsed.data.id);
      return reply.send({ success: true, data: { id: parsed.data.id, revoked: true } });
    },
  );
}
