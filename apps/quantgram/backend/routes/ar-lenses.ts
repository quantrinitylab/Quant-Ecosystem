import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  LensSchema,
  PromptToLens,
  CrossAppDistributor,
  ConsentManager,
  InMemoryConsentStorage,
} from '@quant/ar-lenses';
import type { LensDefinition, DistributionManifest, CrossAppTarget } from '@quant/ar-lenses';
import { createAppError } from '@quant/server-core';

// ============================================================================
// ar-lenses seam — SHARED decorator + routes (per-app lane, Stage 3/4)
// ============================================================================
//
// design.md Open Question 2 is resolved in favour of a SHARED DECORATOR for
// multi-target engines: `@quant/ar-lenses` targets quantneon, quantchat and
// quantmeet, so the engine construction (Layer 2) and the route logic (Layer 3)
// live here as app-agnostic, reusable building blocks. The ONLY things that
// vary per app are supplied as small per-app config at the call site:
//   - the route `prefix` passed to `app.register(arLensesRoutes, { prefix })`,
//   - the backend URL/port pinned in that app's Next proxy `_lib` helper.
// quantchat (Task 14.2) reuses this exact module without per-app divergence:
// it imports `createArLensesService` + `arLensesRoutes` and only changes that
// config. Do NOT inline quantneon-specific literals in this file.
//
// Layer 1 (`@quant/ar-lenses`) is reused as-shipped — no engine rewrite. The
// engine's persistence is in-memory (consent storage, distribution registry),
// so Req 1.3 (construct from `app.prisma` when the engine needs the DB) does
// not apply; `app.prisma` stays available for collaborators that do. No new
// persistent schema is introduced (Req 9.5). The global `onRequest` auth hook
// installed by `createApp()` stays intact — every route below sits behind it,
// reading `request.auth` directly; mutating routes additionally declare a
// fine-grained `ar-lenses:write` scope via `requireAuth({ scopes })` (Req 7.4).

/**
 * The composite ar-lenses service decorated onto the Fastify instance. It
 * bundles the engine's real, as-shipped exports — `LensSchema` (catalog
 * validation), `PromptToLens` (generative try-on lens authoring),
 * `CrossAppDistributor` (per-app capability/compatibility), and `ConsentManager`
 * (ethics/consent lifecycle). Pure composition at the seam; no engine code is
 * rewritten.
 */
export interface ArLensesService {
  schema: LensSchema;
  prompt: PromptToLens;
  distributor: CrossAppDistributor;
  consent: ConsentManager;
}

// Layer 2 type augmentation (mirrors prisma.ts / auth.ts): expose the decorated
// ar-lenses engine on the Fastify instance so routes are typed everywhere.
declare module 'fastify' {
  interface FastifyInstance {
    arLenses: ArLensesService;
  }
}

/**
 * Construct the ar-lenses engine service bundle once at boot. App-agnostic and
 * reusable across every target app (quantneon now, quantchat/quantmeet later) —
 * a target app calls `app.decorate('arLenses', createArLensesService())` in its
 * `buildApp()`. Constructed as a decorated singleton (never per-request).
 */
export function createArLensesService(): ArLensesService {
  return {
    schema: new LensSchema(),
    prompt: new PromptToLens(),
    distributor: new CrossAppDistributor(),
    consent: new ConsentManager(new InMemoryConsentStorage()),
  };
}

const CROSS_APP_TARGETS = [
  'quant_neon',
  'quant_chat',
  'quant_max',
  'quant_meet',
] as const satisfies readonly CrossAppTarget[];

const capabilitiesQuerySchema = z.object({
  target: z.enum(CROSS_APP_TARGETS),
});

// A generative try-on lens request (PromptToLens.generate input).
const generateLensSchema = z.object({
  prompt: z.string().min(1),
  style: z.string().min(1).optional(),
  intensity: z.number().min(0).max(1).optional(),
});

const grantConsentSchema = z.object({
  faceId: z.string().min(1),
  purpose: z.string().min(1),
});

const consentParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Serialize a `DistributionManifest` (whose `compatibility`/`constraints` are
 * `Map`s) into a JSON-safe plain object for the response envelope.
 */
function serializeManifest(manifest: DistributionManifest) {
  return {
    lensId: manifest.lensId,
    targets: manifest.targets,
    compatibility: Object.fromEntries(manifest.compatibility),
    constraints: Object.fromEntries(manifest.constraints),
  };
}

const distributeSchema = z.object({
  lens: z.custom<LensDefinition>((value) => typeof value === 'object' && value !== null),
  targets: z.array(z.enum(CROSS_APP_TARGETS)).min(1),
});

/**
 * ar-lenses seam routes. Registered under an app-supplied prefix in the target
 * app's `buildApp()` (e.g. quantneon: `{ prefix: '/ar-lenses' }`). The prefix is
 * the only app-specific input — the handlers themselves are app-agnostic.
 */
export default async function arLensesRoutes(fastify: FastifyInstance) {
  // GET /capabilities?target= — per-app AR capability matrix (read; global auth
  // hook only). Lets a client tailor lens authoring to the destination app.
  fastify.get('/capabilities', async (request, reply) => {
    const parsed = capabilitiesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const capabilities = fastify.arLenses.distributor.getCapabilities(parsed.data.target);
    return reply.send({ success: true, data: { capabilities } });
  });

  // POST /lenses/generate — author a try-on lens from a text prompt via the
  // engine's generative PromptToLens. Mutating → scoped.
  fastify.post(
    '/lenses/generate',
    {
      preHandler: fastify.requireAuth({ scopes: ['ar-lenses:write'] }),
    },
    async (request, reply) => {
      const parsed = generateLensSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }

      const result = fastify.arLenses.prompt.generate(parsed.data);
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /lenses/distribute — register a lens for cross-app distribution and
  // return its compatibility/constraint manifest. Mutating → scoped.
  fastify.post(
    '/lenses/distribute',
    {
      preHandler: fastify.requireAuth({ scopes: ['ar-lenses:write'] }),
    },
    async (request, reply) => {
      const parsed = distributeSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }

      const validation = fastify.arLenses.schema.validate(parsed.data.lens);
      if (!validation.valid) {
        throw createAppError(
          `Invalid lens definition: ${validation.errors.join(', ')}`,
          400,
          'VALIDATION_ERROR',
        );
      }

      const manifest = fastify.arLenses.distributor.register(parsed.data.lens, parsed.data.targets);
      return reply.status(201).send({ success: true, data: serializeManifest(manifest) });
    },
  );

  // GET /consent — list the authenticated user's active (granted, non-revoked)
  // AR face-consent records (ethics). Read; global auth hook only.
  fastify.get('/consent', async (request, reply) => {
    const consents = fastify.arLenses.consent.getActiveConsents(request.auth.userId);
    return reply.send({ success: true, data: { consents } });
  });

  // POST /consent — grant AR face-tracking consent for the authenticated user.
  // Mutating → scoped.
  fastify.post(
    '/consent',
    {
      preHandler: fastify.requireAuth({ scopes: ['ar-lenses:write'] }),
    },
    async (request, reply) => {
      const parsed = grantConsentSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }

      const record = fastify.arLenses.consent.grant(
        request.auth.userId,
        parsed.data.faceId,
        parsed.data.purpose,
      );
      return reply.status(201).send({ success: true, data: { consent: record } });
    },
  );

  // DELETE /consent/:id — revoke a previously granted consent. Mutating → scoped.
  fastify.delete(
    '/consent/:id',
    {
      preHandler: fastify.requireAuth({ scopes: ['ar-lenses:write'] }),
    },
    async (request, reply) => {
      const parsed = consentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }

      const revoked = fastify.arLenses.consent.revoke(parsed.data.id);
      if (!revoked) {
        throw createAppError('Consent not found or already revoked', 404, 'NOT_FOUND');
      }

      return reply.send({ success: true, data: { id: parsed.data.id, revoked: true } });
    },
  );
}
