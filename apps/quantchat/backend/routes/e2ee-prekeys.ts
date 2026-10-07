import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EncryptionService } from '../services/encryption.service';
import { createKeyStorage } from '../services/key-storage-factory';

// ============================================================================
// Durable E2EE prekey routes — quantchat (W1, design Component 1 / Sequence 1)
// ============================================================================
//
// These routes back the durable key-distribution flow from the design's
// Sequence 1: a user publishes their PUBLIC prekey bundle (+ a pool of one-time
// prekeys) on install, and peers later fetch that bundle — atomically claiming
// one one-time prekey — to start an X3DH session client-side.
//
// SECURITY CONTRACT (Requirements 16.1, 16.3): the backend is a zero-knowledge
// relay. The `.strict()` schema below models PUBLIC material only, so any
// attempt to smuggle a private key / ratchet secret / plaintext field is
// rejected with 400 rather than persisted. Responses return PUBLIC key material
// exclusively.
//
// Storage is config-driven via `createKeyStorage` (Requirements 3.5, 3.6):
// durable `PrismaKeyStorage` by default, volatile `InMemoryKeyStorage` only when
// `KEY_STORAGE=memory`.
//
// Mounted under the `/e2ee` prefix alongside the ciphertext relay routes
// (`backend/routes/e2ee.ts`); `/e2ee/prekeys` does not collide with the relay's
// `/e2ee/keys` or `/e2ee/messages` paths.

/**
 * PUBLIC prekey bundle upload (Requirements 1.1, 1.2, 1.3, 2.1). `.strict()`
 * rejects any extra field — a private key or plaintext can never cross the
 * boundary. Missing required fields produce a VALIDATION_ERROR naming the field.
 */
export const uploadPreKeysSchema = z
  .object({
    identityKey: z.string().min(1),
    signedPreKey: z.string().min(1),
    signedPreKeySignature: z.string().min(1),
    registrationId: z.number().int().min(0),
    // Optional pool of PUBLIC one-time prekeys (batch of 1–100; the durable
    // store additionally rejects in-batch / pool duplicates — Requirement 2.2).
    oneTimePreKeys: z.array(z.string().min(1)).min(1).max(100).optional(),
  })
  .strict();

/**
 * One-time prekey top-up — the server-side half of client replenishment
 * (Requirement 2.8). The client uploads ONLY a batch of PUBLIC one-time prekeys
 * (no bundle, no private material) to extend its existing pool. `.strict()`
 * rejects any other field, preserving the zero-knowledge invariant (Req 16.1);
 * the durable store enforces the 1–100 batch size and rejects duplicates
 * (Requirement 2.2).
 */
export const replenishPreKeysSchema = z
  .object({
    oneTimePreKeys: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict();

/** Bundle fields whose presence distinguishes a full publish from a top-up. */
const BUNDLE_FIELDS = [
  'identityKey',
  'signedPreKey',
  'signedPreKeySignature',
  'registrationId',
] as const;

const userParamsSchema = z.object({ userId: z.string().min(1) });

/**
 * Durable prekey routes, registered under the `/e2ee` prefix in `buildApp()`.
 */
export default async function e2eePreKeyRoutes(fastify: FastifyInstance) {
  const service = new EncryptionService(createKeyStorage(fastify.prisma));

  // POST /e2ee/prekeys — publish the authenticated user's PUBLIC prekey bundle
  // (+ optional one-time prekey pool), OR top up the one-time prekey pool with a
  // PUBLIC-only batch (client replenishment — Requirement 2.8). A body carrying
  // any bundle field is treated as a full publish (signature verified); a body
  // with only `oneTimePreKeys` is a top-up appended to the existing pool.
  // Persists public material only (Requirements 1.1, 1.2, 1.3, 2.1, 2.8, 16.1).
  fastify.post(
    '/prekeys',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:write'] }) },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      // A top-up carries NONE of the bundle fields — only one-time prekeys.
      const isTopUp = BUNDLE_FIELDS.every((field) => !(field in body));

      if (isTopUp) {
        const parsed = replenishPreKeysSchema.safeParse(body);
        if (!parsed.success) {
          throw parsed.error;
        }

        // Appends to the existing pool; the durable store enforces batch size
        // (1–100) and rejects in-batch / pool duplicates (Requirement 2.2) and
        // requires a previously registered bundle.
        await service.addOneTimePreKeys(request.auth.userId, parsed.data.oneTimePreKeys);

        return reply.status(201).send({
          success: true,
          data: { message: 'One-time prekeys added' },
        });
      }

      // Full publish. Missing-field rejection: the Zod error names the offending
      // field and is rendered as VALIDATION_ERROR by the central error handler
      // (Req 1.3).
      const parsed = uploadPreKeysSchema.safeParse(body);
      if (!parsed.success) {
        throw parsed.error;
      }

      const { oneTimePreKeys, ...bundle } = parsed.data;

      // Signature-failure rejection: uploadPreKeyBundle throws INVALID_SIGNATURE
      // (400) and persists nothing, leaving any prior bundle unchanged (Req 1.2).
      await service.uploadPreKeyBundle(request.auth.userId, bundle, oneTimePreKeys);

      // Success confirmation (Requirement 1.1).
      return reply.status(201).send({
        success: true,
        data: { message: 'Prekey bundle uploaded' },
      });
    },
  );

  // GET /e2ee/prekeys/count — return the authenticated user's remaining
  // unclaimed one-time prekey count. Drives client replenishment: the Web_Client
  // tops up the pool when this drops below the threshold (Requirements 2.7, 2.8).
  // Registered before the `/prekeys/:userId` parametric route so `count` is never
  // interpreted as a peer user id.
  fastify.get(
    '/prekeys/count',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:read'] }) },
    async (request, reply) => {
      const remaining = await service.countOneTimePreKeys(request.auth.userId);
      return reply.send({
        success: true,
        data: { userId: request.auth.userId, remaining },
      });
    },
  );

  // GET /e2ee/prekeys/:userId — fetch a peer's PUBLIC prekey bundle and
  // atomically claim one one-time prekey from their pool. Returns PUBLIC key
  // material only (Requirements 16.3, plus one-time prekey claim integration).
  fastify.get<{ Params: { userId: string } }>(
    '/prekeys/:userId',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:read'] }) },
    async (request, reply) => {
      const parsed = userParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      const bundle = await service.claimPreKeyBundle(parsed.data.userId);
      return reply.send({ success: true, data: bundle });
    },
  );
}
