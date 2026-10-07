import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PreKeyBundle } from '@quant/encryption';
import { createAppError } from '@quant/server-core';
import type { CiphertextEnvelope, E2EERelay } from '../lib/e2ee-relay';

// ============================================================================
// encryption (E2EE) seam routes — quantmail (per-app lane, Stage 6 / Task 14.1)
// ============================================================================
//
// Layer 3 of the integration seam for `@quant/encryption`. SECURITY CONTRACT
// (Requirement 7.5, design "Security Considerations"): this seam transports
// **CIPHERTEXT ONLY**. The backend is a zero-knowledge relay — it registers
// PUBLIC pre-key bundles for key distribution and relays opaque ciphertext
// envelopes between authenticated users. It NEVER receives, stores, or returns:
//   - private keys (`KeyPair.privateKey`),
//   - session/ratchet secrets (`RatchetState` chain/root keys),
//   - plaintext.
//
// This mirrors the proven quantmeet encryption seam
// (apps/quantmeet/backend/routes/encryption.ts), mounted under the `/e2ee`
// prefix in quantmail.
//
// CLIENT-vs-SERVER split (where each `@quant/encryption` operation runs):
//   CLIENT-ONLY (browser, via the engine — never sent here):
//     E2EEManager.generateKeyPair / initializeIdentity   (mints privateKey)
//     E2EEManager.encrypt(plaintext, ...)                (consumes plaintext)
//     E2EEManager.decrypt(payload, recipientKey)         (needs privateKey)
//     KeyExchange.establishSession / *Ratchet            (secret ratchet state)
//   SERVER-RELAYED (this module — public material + ciphertext only):
//     KeyExchange.generatePreKeyBundle() -> PreKeyBundle (PUBLIC keys)  [publish/fetch]
//     E2EEManager.encrypt(...) -> EncryptedPayload       (CIPHERTEXT)   [relay]
//
// Enforcement: every request body uses a **`.strict()`** Zod schema, so any
// attempt to smuggle a `privateKey` / `plaintext` / ratchet-secret field is
// rejected with 400 (VALIDATION_ERROR) rather than persisted. The schemas below
// deliberately model ONLY public/ciphertext fields.
//
// Auth: the global `onRequest` hook from `createApp()` already protects every
// non-public path; encryption is a *sensitive* engine (Req 7.4) so each route
// additionally declares a fine-grained scope via `requireAuth({ scopes })`.
// Responses use the canonical `{ success, data | error }` envelope (errors are
// produced centrally by `error-handler.ts` / `auth.ts`).

// The relay decorated onto the Fastify instance in quantmail's `buildApp()`.
declare module 'fastify' {
  interface FastifyInstance {
    e2ee: E2EERelay;
  }
}

// ---------------------------------------------------------------------------
// Wire schemas — PUBLIC / CIPHERTEXT fields ONLY. `.strict()` rejects any extra
// key (e.g. `privateKey`, `plaintext`, `rootKey`) so secrets cannot cross the
// boundary even if a buggy/malicious client tries to attach them (Req 7.5).
// ---------------------------------------------------------------------------

/** PUBLIC pre-key bundle (mirrors `@quant/encryption` `PreKeyBundle`). */
const preKeyBundleSchema = z
  .object({
    identityKey: z.string().min(1),
    signedPreKey: z.string().min(1),
    signedPreKeySignature: z.string().min(1),
    oneTimePreKey: z.string().min(1).optional(),
    registrationId: z.number().int().nonnegative(),
  })
  .strict();

const publishKeysSchema = z
  .object({
    deviceId: z.string().min(1),
    bundle: preKeyBundleSchema,
  })
  .strict();

/** Opaque CIPHERTEXT envelope (mirrors `@quant/encryption` `EncryptedPayload`). */
const ciphertextEnvelopeSchema = z
  .object({
    ciphertext: z.string().min(1),
    nonce: z.string().min(1),
    tag: z.string().min(1),
    algorithm: z.enum(['aes-256-gcm', 'chacha20-poly1305', 'xchacha20-poly1305']),
    senderFingerprint: z.string().min(1),
    recipientFingerprint: z.string().min(1),
    timestamp: z.string().min(1),
    version: z.number().int().positive(),
  })
  .strict();

const relayMessageSchema = z
  .object({
    recipientId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    payload: ciphertextEnvelopeSchema,
  })
  .strict();

const userParamsSchema = z.object({ userId: z.string().min(1) });

const inboxQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

/**
 * encryption (E2EE) seam routes, registered under the `/e2ee` prefix in
 * quantmail's `buildApp()`.
 */
export default async function e2eeRoutes(fastify: FastifyInstance) {
  // POST /e2ee/keys — publish the authenticated user's PUBLIC pre-key bundle so
  // peers can establish a session client-side. Only public material is accepted.
  fastify.post(
    '/keys',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:write'] }) },
    async (request, reply) => {
      const parsed = publishKeysSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }

      // The validated bundle is, by schema, the engine's public `PreKeyBundle`.
      const bundle: PreKeyBundle = parsed.data.bundle;
      const record = fastify.e2ee.publishBundle(request.auth.userId, parsed.data.deviceId, bundle);

      return reply.status(201).send({ success: true, data: { bundle: record } });
    },
  );

  // GET /e2ee/keys/:userId — fetch a peer's published PUBLIC bundles. Returns
  // public key-distribution material only; the caller derives session keys
  // locally via the engine. Empty list (not 404) when the peer has not yet
  // published, so callers can poll without treating "not yet" as an error.
  fastify.get(
    '/keys/:userId',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:read'] }) },
    async (request, reply) => {
      const parsed = userParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      const bundles = fastify.e2ee.getBundles(parsed.data.userId);
      return reply.send({ success: true, data: { userId: parsed.data.userId, bundles } });
    },
  );

  // POST /e2ee/messages — relay an opaque CIPHERTEXT envelope to a recipient.
  // The backend cannot read the body's ciphertext; it only routes it.
  fastify.post(
    '/messages',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:write'] }) },
    async (request, reply) => {
      const parsed = relayMessageSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }

      if (parsed.data.recipientId === request.auth.userId) {
        throw createAppError('Cannot relay an envelope to yourself', 400, 'INVALID_RECIPIENT');
      }

      const payload: CiphertextEnvelope = parsed.data.payload;
      const envelope = fastify.e2ee.relayEnvelope({
        senderId: request.auth.userId,
        recipientId: parsed.data.recipientId,
        payload,
        sessionId: parsed.data.sessionId,
      });

      return reply.status(202).send({ success: true, data: { envelope } });
    },
  );

  // GET /e2ee/messages — drain the authenticated user's inbox of relayed
  // CIPHERTEXT envelopes. Decryption happens client-side via the engine.
  fastify.get(
    '/messages',
    { preHandler: fastify.requireAuth({ scopes: ['encryption:read'] }) },
    async (request, reply) => {
      const parsed = inboxQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw parsed.error;
      }

      const envelopes = fastify.e2ee.drainInbox(request.auth.userId, {
        limit: parsed.data.limit,
      });
      return reply.send({ success: true, data: { envelopes, count: envelopes.length } });
    },
  );
}
