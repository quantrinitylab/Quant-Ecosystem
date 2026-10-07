# `server-core` Plugins — The Canonical Integration Seam

This directory holds the Fastify plugins that `createApp()` composes. It is also
the **reference home for the engine-integration seam pattern**: the single,
repeatable way every one of the ~68 engine packages is wired into the ecosystem.

> Scope: this README documents the **convention**. It does not wire any specific
> engine. The canonical, literal template is the existing
> [`prisma.ts`](./prisma.ts) plugin — read it first; every plugin below mirrors it.

Related spec: `.kiro/specs/engine-integration-wiring/` (Requirements 1.1, 1.2, 1.3;
design sections "The Standard Integration Seam Pattern" and "Error Handling").

---

## The five-layer seam

Every engine reaches a user through the same chain. The layer that lives in **this
directory** is Layer 2 (for cross-cutting engines); per-app engines do the same
decoration inside the app's `buildApp()` instead.

```
Layer 1  Engine package      @quant/<engine>            (exists; do NOT rewrite)
Layer 2  Plugin / decorator  decorate the Fastify instance with the engine service
Layer 3  Fastify route       authenticated HTTP surface, returns the envelope
Layer 4  Next.js API proxy   app/api/*/route.ts forwards Bearer JWT + x-request-id
Layer 5  Frontend query      @quant/api-client useApiQuery / useApiMutation (no inline fetch)
```

| Layer                 | Lives in                                                                                                    | Responsibility                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. Engine             | `packages/<engine>/`                                                                                        | Barrel-exported service class(es). Only change: add it to the consumer's `dependencies` as `workspace:*`. |
| 2. Plugin / decorator | `packages/server-core/src/plugins/<engine>.ts` (cross-cutting) **or** `apps/<app>/backend/app.ts` (per-app) | Construct the service from `fastify.prisma` + config, decorate the instance, clean up on close.           |
| 3. Route              | `apps/<app>/backend/routes/<feature>.ts`                                                                    | Validate input with Zod, call the decorated engine, return `{ success, data \| error }`.                  |
| 4. Proxy              | `apps/<app>/src/app/api/<feature>/route.ts`                                                                 | Forward to the backend, propagate `authorization` + `x-request-id`, relay status.                         |
| 5. Query              | `@quant/api-client` hook                                                                                    | The **only** call path from UI to an engine-backed endpoint.                                              |

---

## The plugin convention (Layer 2) — modeled on `prisma.ts`

Every plugin in this directory follows the **same four steps** as
[`prisma.ts`](./prisma.ts). Use it as the literal template:

```typescript
// packages/server-core/src/plugins/prisma.ts  (the reference template)
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@quant/database';
import type { PrismaClient } from '@quant/database';

// 2. declare the type via module augmentation
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function prismaPlugin(fastify: FastifyInstance) {
  // 1. decorate the instance with the service
  fastify.decorate('prisma', prisma);

  // 3. register onClose cleanup
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

// 4. wrap with fastify-plugin so the decoration is visible to the parent scope
export default fp(prismaPlugin, {
  name: 'prisma',
});
```

### The five layers of the convention, restated as a checklist

1. **Decorate the instance** — `fastify.decorate('<engine>', service)`. Construct
   the service **once at boot** (a decorated singleton), never per-request.
   When the engine needs the database, build it from the injected
   `fastify.prisma` singleton — do **not** instantiate a new client
   (Requirement 1.3).
2. **`declare module 'fastify'`** — augment `FastifyInstance` (or
   `FastifyRequest`, as `auth.ts` does for `request.auth`) so the decoration is
   typed everywhere.
3. **`onClose` cleanup** — register `fastify.addHook('onClose', ...)` to release
   resources (disconnect clients, flush queues, call `service.shutdown?.()`).
4. **Wrap with `fp(handler, { name, dependencies })`** — `fastify-plugin`
   exposes the decoration to the parent scope. Always set a `name`. Set
   `dependencies` when the plugin reads another decoration at construction time
   (see below).

### `dependencies` ordering

A plugin that constructs its engine from `fastify.prisma` (or any other
decoration) **must** declare that dependency so `fastify-plugin` registers it in
the right order. Missing dependencies fail fast at boot rather than at runtime
(see design "Error Handling": _Engine missing dependency → throws at boot_).

```typescript
// cross-cutting engine that needs the database
export default fp(notificationsPlugin, {
  name: 'notifications',
  dependencies: ['prisma'], // registers after prismaPlugin → fastify.prisma is defined
});
```

- `prisma.ts`, `auth.ts`, `error-handler.ts` declare only `name` (no upstream
  decoration is read at construction).
- Any engine plugin built from `fastify.prisma` declares `dependencies: ['prisma']`.
- A plugin that reads `requireAuth`/permission context declares the relevant
  auth/identity-permissions dependency.

### Per-app engines use the same shape

For a per-app feature engine the decoration happens in the app's `buildApp()`
instead of this directory, but the four steps are identical:

```typescript
// apps/<app>/backend/app.ts  (per-app lane, excerpt)
export async function buildApp(config?: AppConfig) {
  const app = await createApp(config ?? getConfig()); // prisma + auth already wired
  app.decorate('<engine>', constructEngine(app)); // step 1, using app.prisma
  await app.register(<engine>Routes, { prefix: '/<feature>' });
  return app;
}
```

The global auth hook installed by `createApp()` must stay intact — a per-app
binding never bypasses authentication (Requirement 3.4 / 7.x).

---

## The response envelope — `{ success, data | error }`

**Reuse the existing canonical type. Do not invent a new shape.**

The ecosystem already defines the envelope as
[`ApiResponse<T>`](../../../common/src/types.ts) in `@quant/common`, alongside
`ApiError`:

```typescript
// @quant/common  (packages/common/src/types.ts) — already exists, import it
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}
```

### Success side — return it inline from the route (Layer 3)

Engine routes return the success envelope directly. Type the handler's result as
`ApiResponse<T>` (imported from `@quant/common`) when you want the compiler to
enforce the shape:

```typescript
// apps/<app>/backend/routes/<feature>.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const SendSchema = z.object({ to: z.string(), body: z.string() });

export default async function featureRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/send',
    {
      preHandler: fastify.requireAuth({ scopes: ['notifications:write'] }), // optional fine-grained scope
      schema: { body: SendSchema },
    },
    async (request) => {
      const result = await fastify.notifications.dispatch({
        ...request.body,
        userId: request.auth.userId,
      });
      return { success: true, data: result }; // ApiResponse<typeof result>
    },
  );
}
```

### Error side — produced for you, do not hand-roll it

You **do not** build error envelopes in route handlers. Throw (or let the engine
throw) and the centralized handlers emit the `{ success: false, error: { code,
message, statusCode } }` shape consistently:

- [`error-handler.ts`](./error-handler.ts) maps `ZodError`, Fastify validation
  errors, `AppError` (via `createAppError(message, statusCode, code)`), and
  unknown errors to the envelope.
- [`auth.ts`](./auth.ts) emits `401 { code: 'UNAUTHORIZED' }` for missing/invalid
  JWTs and `403 { code: 'FORBIDDEN' }` for insufficient scopes.

To raise a domain error with a specific code/status, use the existing helper:

```typescript
import { createAppError } from '@quant/server-core';

if (!allowed) {
  throw createAppError('Quota exceeded', 429, 'QUOTA_EXCEEDED');
  // error-handler.ts → 429 { success: false, error: { code: 'QUOTA_EXCEEDED', ... } }
}
```

This is why no new envelope helper is added here: the **type** (`ApiResponse` /
`ApiError`) already lives in `@quant/common`, the **error envelope** is built by
`error-handler.ts` / `auth.ts`, and the **success envelope** is a one-line inline
return. Reuse these rather than introducing a parallel helper.

| Outcome            | Who produces it                            | Envelope                                                                            |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Success            | route handler (inline)                     | `{ success: true, data }`                                                           |
| Validation failure | `error-handler.ts` (Zod / schema)          | `{ success: false, error: { code: 'VALIDATION_ERROR', statusCode: 400, details } }` |
| Unauthenticated    | `auth.ts`                                  | `{ success: false, error: { code: 'UNAUTHORIZED', statusCode: 401 } }`              |
| Insufficient scope | `auth.ts`                                  | `{ success: false, error: { code: 'FORBIDDEN', statusCode: 403 } }`                 |
| Domain error       | `createAppError(...)` + `error-handler.ts` | `{ success: false, error: { code, statusCode } }`                                   |
| Unknown error      | `error-handler.ts`                         | `{ success: false, error: { code: 'INTERNAL_ERROR', statusCode: 500 } }`            |

---

## Quick reference

- **New cross-cutting engine?** Add `plugins/<engine>.ts` mirroring `prisma.ts`,
  `dependencies: ['prisma']` if it needs the DB, then register it inside
  `createApp()` exactly once.
- **New per-app engine?** Decorate in `apps/<app>/backend/app.ts` `buildApp()`,
  register routes with a prefix.
- **Returning data?** `return { success: true, data }` (type as `ApiResponse<T>`).
- **Returning an error?** Throw / `createAppError(...)` — never hand-build the
  error envelope.
- **Reference files:** [`prisma.ts`](./prisma.ts) (template),
  [`auth.ts`](./auth.ts) (request augmentation + scopes),
  [`error-handler.ts`](./error-handler.ts) (error envelope).
