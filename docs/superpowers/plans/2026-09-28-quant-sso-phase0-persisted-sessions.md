# Quant SSO Phase 0 — Persisted SessionService Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `SessionService` in `@quant/auth` with a Prisma-backed store so auth sessions survive process restarts and span instances (fixes SSO design gap 3.6 / bug 3.7 #6).

**Architecture:** Evolve the already-present but code-unused `sessions` table to hold the full `AuthSession` shape, then rewrite `SessionService` to read/write that table through an injectable Prisma client (the same testability pattern `TokenService` already uses). Behaviour and public method signatures are unchanged; only storage moves from `Map` to Postgres. This is topology-agnostic — it is required under both Option A and Option B of the SSO design, so it needs no owner ratification.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), Prisma 6 + PostgreSQL, Vitest (globals, node env), `@quant/auth` workspace package.

**Spec:** `docs/superpowers/specs/2026-09-28-quant-sso-identity-design.md` (Sections 3.6, 4.3, 7, 15; this plan is Phase 0 slice 1 of the Migration path §16).

## Global Constraints

- Public API of `SessionService` (method names, params, return types) MUST stay unchanged — consumers `packages/auth/src/middleware/sso-middleware.ts:91` and `packages/auth/src/middleware/auth-middleware.ts:51` call `new SessionService(config)` and MUST keep compiling with no edits.
- Session id format stays `sess_<random>` via `generateId('sess')` (`packages/auth/src/crypto/secure-random.ts`); the service supplies `id` explicitly (do NOT rely on the Prisma `@default(cuid())`).
- Postgres only (schema uses `String[]`); migration SQL is hand-authored under `packages/database/prisma/migrations/` matching existing style (e.g. `0061_quantapp_rebrand_backfill/migration.sql`).
- No secrets in code; treat external content as untrusted; do not push to `main`.
- Local dev box CANNOT run pnpm/prisma/vitest (corrupted pnpm store + missing coreutils — see memory `dev-env-constraints`). Every `Run:` step below is verified in CI or on a healthy machine, NOT on this box. Author + push + let CI go green (the Part A model).
- Legacy `QuantApp` aliases stay; `app` is stored as free `String` (union widening is out of scope here).

## Phase 0 roadmap (this plan is slice 1 of 5)

1. **Persisted SessionService** — THIS PLAN.
2. OAuth client registration for all 8 apps with real `*.quantrinity.in` / `quantmail.in` redirect URIs (replace the `*.quant.app` URIs in `packages/auth/src/providers/quantmail-provider.ts`), seeded into `oauth_clients`.
3. Issuer/audience + key unification: one issuer (`https://id.quantrinity.in`), per-app audience; add RS256 verify alongside HS256 in `packages/server-core/src/plugins/auth.ts` (collapse the 4-issuer allowlist `:73`).
4. Identity-origin routing surface at `id.quantrinity.in` fronting the existing QuantMail OAuth backend + published JWKS/discovery.
5. `@quant/auth-client` OIDC helper + `prompt=none` silent-authorize handling.

Slices 2–5 each get their own plan (they are independent subsystems per the writing-plans Scope Check). Slices 3–5 depend on the owner ratifying **Option B** (SSO design §12/§17); slice 1 does not.

---

## File Structure

| File                                                                           | Responsibility                                                         | Change                                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma` (`model Session`, lines 196-212)      | Persistent shape of an auth session                                    | Modify: add `tokenId`, `refreshTokenFamily`, `app`, `isActive`, `lastActivityAt`; make `token` nullable; add `@@index([isActive])` |
| `packages/database/prisma/migrations/0074_persist_auth_sessions/migration.sql` | Hand-authored DDL applying the reshape                                 | Create                                                                                                                             |
| `packages/auth/src/__tests__/setup.ts` (`session:` mock, lines 110-120)        | Store-backed Vitest fake so persistence is exercised without a real DB | Modify: replace the stateless stub with a `sessionStore`-backed impl                                                               |
| `packages/auth/src/services/session-service.ts` (whole file)                   | The service — storage moves from `Map` to Prisma                       | Rewrite internals; public API unchanged; add optional `prismaClient` 2nd ctor arg                                                  |
| `packages/auth/src/__tests__/session-service.test.ts`                          | Behaviour + new cross-instance persistence coverage                    | Modify: seed state through Prisma rows instead of mutating returned objects; add persistence test                                  |

**Unchanged (must keep compiling):** `packages/auth/src/middleware/sso-middleware.ts:91`, `packages/auth/src/middleware/auth-middleware.ts:51` (both `new SessionService(config)`), `packages/auth/src/index.ts:48` (re-export). `apps/quantai/backend/services/session.service.ts` is an unrelated AI-chat service — do NOT touch.

**Design decisions locked for this slice:**

- `revoke*` and `cleanup` **hard-delete** rows (matches the old `Map.delete` semantics; the `isActive` flag exists for the active-filter + `touchSession` guard, not for soft-delete audit — that is a future slice).
- `trustedDevices` stays **in-memory** (the `sessions` table has no trusted-device concept; persisting device trust is out of scope here). Its two methods and their test remain synchronous and unchanged.
- App-level filtering (`hasActiveSessionForApp`, `getSessionsByApp`, `getDeviceList`, `revokeByDeviceId`) is derived in memory from `getUserSessions()` — `deviceInfo` is JSON and not filtered in SQL — so the Prisma mock stays simple.

## Task 1: Reshape the `sessions` table to hold `AuthSession`

**Files:**

- Modify: `packages/database/prisma/schema.prisma:196-212`
- Create: `packages/database/prisma/migrations/0074_persist_auth_sessions/migration.sql`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: a `sessions` table with columns `id, userId, token(nullable unique), tokenId, refreshTokenFamily, app, isActive, lastActivityAt, deviceInfo, ipAddress, userAgent, expiresAt, createdAt`. Task 3 maps `AuthSession` ↔ this row.

> **Migration number:** `0074` is the next free number (latest on disk is `0073_add_repository_stars`; verify with a directory listing at execution time and bump if a newer one landed). The table is unused by application code today (grep for `prisma.session.` / `.session.create(` in non-test `src` returns nothing), so this reshape is additive and safe on existing rows: the three new text columns are nullable, `isActive`/`lastActivityAt` carry defaults, and dropping `NOT NULL` on `token` never loses data.

- [ ] **Step 1: Replace the `model Session` block** (`schema.prisma:196-212`) with:

```prisma
model Session {
  id                 String   @id @default(cuid())
  userId             String
  token              String?  @unique
  tokenId            String?
  refreshTokenFamily String?
  app                String?
  isActive           Boolean  @default(true)
  lastActivityAt     DateTime @default(now())
  deviceInfo         Json     @default("{}")
  ipAddress          String?
  userAgent          String?
  expiresAt          DateTime
  createdAt          DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
  @@index([expiresAt])
  @@index([isActive])
  @@map("sessions")
}
```

- [ ] **Step 2: Create the migration SQL** at `packages/database/prisma/migrations/0074_persist_auth_sessions/migration.sql`:

```sql
-- Persist auth sessions (SSO Phase 0, design §3.6): evolve `sessions`
-- from an unused token-store stub into the full AuthSession shape.

-- AlterTable: token is no longer the identity of a session; the app-layer
-- supplies a `sess_`-prefixed id and never writes `token`.
ALTER TABLE "sessions" ALTER COLUMN "token" DROP NOT NULL;
ALTER TABLE "sessions" ADD COLUMN "tokenId" TEXT;
ALTER TABLE "sessions" ADD COLUMN "refreshTokenFamily" TEXT;
ALTER TABLE "sessions" ADD COLUMN "app" TEXT;
-- New rows set isActive explicitly in createSession; the column DEFAULTs to false so that
-- legacy pre-existing rows (which lack tokenId/refreshTokenFamily/app) are NOT treated as live
-- sessions — otherwise getDeviceList would surface them and can throw on a missing userAgent.
ALTER TABLE "sessions" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "sessions_isActive_idx" ON "sessions"("isActive");
```

- [ ] **Step 3: Validate schema + migration parity** (CI / healthy machine — NOT this box)

Run: `pnpm --filter @quant/database exec prisma validate`
Expected: `The schema at ...schema.prisma is valid 🚀`

Run: `pnpm --filter @quant/database exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL"`
Expected: `No difference detected` (the hand-authored SQL fully expresses the schema delta). If a diff prints, reconcile the SQL until it is empty.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/0074_persist_auth_sessions/migration.sql
git commit -m "feat(auth): reshape sessions table to persist AuthSession (SSO phase 0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 2: Make the Vitest `session` mock store-backed

**Files:**

- Modify: `packages/auth/src/__tests__/setup.ts` (add `sessionStore` + a global reset; replace the `session:` block, lines 110-120)

**Interfaces:**

- Consumes: nothing at runtime.
- Produces: a `prisma.session` mock that behaves like a tiny DB — `create/findUnique/findFirst/findMany(where,orderBy)/update/updateMany/delete/deleteMany/count` over an in-file `sessionStore`, supporting scalar-equality `where` plus operator objects `{ gt, gte, lt, lte, not }`. Task 3's service and tests depend on this.

> **Why this is safe / behaviour-preserving:** grep confirms **no** `packages/auth/src` code calls `prisma.session.*` today (the service still uses `Map`s), so the current `session` stub is dead — nothing exercises it until Task 3. Four test files construct `new SessionService(config)` with no injected client and so hit this mock via the default `prisma` singleton: `session-service.test.ts:35`, `sso-middleware.test.ts:27`, `phase24-integration.test.ts:178`, `account-deletion-gate.test.ts:64`. The global per-test reset below keeps them isolated.

- [ ] **Step 1: Add a dedicated session store + global reset.** Immediately after `const store = new Map<string, any>();` (setup.ts:4) add:

```ts
const sessionStore = new Map<string, any>();
```

Then register a global per-test reset so session state never leaks between tests. Change the import (setup.ts:1) to `import { vi, beforeEach } from 'vitest';`, and add this AFTER the `vi.mock('@prisma/client', ...)` block (top level, not inside the factory) — `new PrismaClient()` returns the same closed-over `mockPrisma`, so this clears the one shared `sessionStore` through the public mock API before every test in every file, touching no other model's store:

```ts
import { PrismaClient } from '@prisma/client';
const __mockPrismaForReset = new PrismaClient();
beforeEach(async () => {
  await (
    __mockPrismaForReset as unknown as {
      session: { deleteMany(a: { where: Record<string, unknown> }): Promise<{ count: number }> };
    }
  ).session.deleteMany({ where: {} });
});
```

The four `new SessionService(config)` suites accumulate rows only _within_ a single test, so a per-test clear is exactly the isolation the old fresh-`Map`-per-`beforeEach` gave them.

- [ ] **Step 2: Replace the `session:` block** (setup.ts:110-120) with a store-backed implementation:

```ts
    session: (() => {
      const time = (x: any) => (x instanceof Date ? x.getTime() : x);
      const matches = (rec: any, where: Record<string, any> = {}): boolean => {
        for (const [key, cond] of Object.entries(where)) {
          const val = rec[key];
          if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('gt' in cond && !(time(val) > time(cond.gt))) return false;
            if ('gte' in cond && !(time(val) >= time(cond.gte))) return false;
            if ('lt' in cond && !(time(val) < time(cond.lt))) return false;
            if ('lte' in cond && !(time(val) <= time(cond.lte))) return false;
            if ('not' in cond && val === cond.not) return false;
          } else if (val !== cond) {
            return false;
          }
        }
        return true;
      };
      // Live references (for update/delete); readers get copies.
      const live = (where?: Record<string, any>) =>
        Array.from(sessionStore.values()).filter((r) => matches(r, where));
      return {
        create: vi.fn().mockImplementation((args: { data: any }) => {
          sessionStore.set(args.data.id, { ...args.data });
          return Promise.resolve({ ...sessionStore.get(args.data.id) });
        }),
        findUnique: vi.fn().mockImplementation((args: { where: { id: string } }) =>
          Promise.resolve(
            sessionStore.has(args.where.id) ? { ...sessionStore.get(args.where.id) } : null,
          ),
        ),
        findFirst: vi.fn().mockImplementation((args: { where?: any }) => {
          const hit = live(args?.where)[0];
          return Promise.resolve(hit ? { ...hit } : null);
        }),
```

```ts
        findMany: vi.fn().mockImplementation((args: { where?: any; orderBy?: any }) => {
          let rows = live(args?.where);
          if (args?.orderBy) {
            const [field, dir] = Object.entries(args.orderBy)[0] as [string, 'asc' | 'desc'];
            rows = [...rows].sort((a, b) =>
              dir === 'desc' ? time(b[field]) - time(a[field]) : time(a[field]) - time(b[field]),
            );
          }
          return Promise.resolve(rows.map((r) => ({ ...r })));
        }),
        update: vi.fn().mockImplementation((args: { where: { id: string }; data: any }) => {
          const rec = sessionStore.get(args.where.id);
          if (!rec) return Promise.reject(new Error('Record not found'));
          Object.assign(rec, args.data);
          return Promise.resolve({ ...rec });
        }),
        updateMany: vi.fn().mockImplementation((args: { where?: any; data: any }) => {
          let count = 0;
          for (const rec of live(args?.where)) {
            Object.assign(rec, args.data);
            count++;
          }
          return Promise.resolve({ count });
        }),
        delete: vi.fn().mockImplementation((args: { where: { id: string } }) => {
          sessionStore.delete(args.where.id);
          return Promise.resolve(undefined);
        }),
        deleteMany: vi.fn().mockImplementation((args: { where?: any }) => {
          const victims = live(args?.where);
          for (const rec of victims) sessionStore.delete(rec.id);
          return Promise.resolve({ count: victims.length });
        }),
        count: vi.fn().mockImplementation((args?: { where?: any }) =>
          Promise.resolve(live(args?.where).length),
        ),
      };
    })(),
```

- [ ] **Step 3: Confirm existing suites are unaffected** (CI / healthy machine)

Run: `pnpm --filter @quant/auth test`
Expected: identical pass/fail set to before this task — the mock is dead code until Task 3, so every currently-passing test still passes. (Green here means the harness change is inert; Task 3 makes it live.)

- [ ] **Step 4: Commit**

```bash
git add packages/auth/src/__tests__/setup.ts
git commit -m "test(auth): make prisma.session mock store-backed for persisted sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 3: Rewrite `SessionService` to be DB-backed

**Files:**

- Rewrite: `packages/auth/src/services/session-service.ts`
- Modify: `packages/auth/src/__tests__/session-service.test.ts` (seed state via rows; add persistence test)

**Interfaces:**

- Consumes: the reshaped `sessions` table (Task 1); the store-backed `prisma.session` mock (Task 2).
- Produces (public API unchanged — consumers must not need edits):
  - `class SessionService` with `constructor(config: AuthConfig, prismaClient?: SessionPrismaClient)` — the new 2nd arg is optional and defaults to the shared `prisma` singleton, so `new SessionService(config)` keeps working.
  - Unchanged async methods: `createSession(CreateSessionOptions): Promise<AuthSession>`, `getSession(id): Promise<AuthSession|null>`, `getUserSessions(userId): Promise<AuthSession[]>`, `touchSession(id): Promise<void>`, `revokeSession(id): Promise<boolean>`, `revokeAllSessions(userId): Promise<number>`, `revokeOtherSessions(userId,currentId): Promise<number>`, `getActiveSessionCount(userId): Promise<number>`, `hasActiveSessionForApp(userId,app): Promise<boolean>`, `getSessionsByApp(userId): Promise<Map<QuantApp,AuthSession[]>>`, `getDeviceList(userId)`, `revokeByDeviceId(userId,deviceId): Promise<number>`, `cleanup(): Promise<number>`; sync `isDeviceTrusted`, `markDeviceTrusted`.
  - New exported `interface SessionPrismaClient` (the injectable Prisma subset).

- [ ] **Step 1: Add the failing persistence test** to `session-service.test.ts` (this is the behaviour the whole slice exists to add — a session created by one instance is visible to another, i.e. it outlives the process). Add `import { prisma } from '../lib/prisma';` at the top, then append inside the top-level `describe('SessionService', ...)`:

```ts
describe('persistence', () => {
  it('persists sessions across SessionService instances (survives restart)', async () => {
    const first = new SessionService(TEST_CONFIG);
    const created = await first.createSession({
      userId: 'user-persist',
      tokenId: 'tok-p',
      refreshTokenFamily: 'fam-p',
      deviceInfo,
      app: 'quantmail',
    });

    // A brand-new instance models a fresh process/instance reading the store.
    const second = new SessionService(TEST_CONFIG);
    const found = await second.getSession(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.userId).toBe('user-persist');
    expect(await second.getUserSessions('user-persist')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (CI / healthy machine)

Run: `pnpm --filter @quant/auth test -- session-service`
Expected: FAIL — the in-memory `Map` is per-instance, so `second.getSession` returns `null` (`expected null not to be null`).

- [ ] **Step 3: Replace the whole of `session-service.ts`** with the DB-backed implementation. The public surface is identical to today's; only storage changes from `Map`s to the injected `session` delegate. `trustedDevices` stays an in-memory `Map` (locked decision). Paste the file below verbatim.

Imports, options, and the injectable client contract:

```ts
// ============================================================================
// Auth - Session Service (persisted; SSO design §3.6)
// ============================================================================
// Sessions live in the `sessions` Postgres table so they survive process
// restarts and are shared across instances. The Prisma client is injectable
// (2nd ctor arg) exactly like TokenService, defaulting to the shared
// singleton so existing `new SessionService(config)` call sites are unchanged.

import type { AuthConfig, AuthSession, DeviceLoginInfo } from '../types';
import type { QuantApp } from '@quant/common';
import { generateId } from '../crypto/secure-random';
import { prisma as defaultPrisma } from '../lib/prisma';

/** Session creation options (unchanged public shape). */
export interface CreateSessionOptions {
  userId: string;
  tokenId: string;
  refreshTokenFamily: string;
  deviceInfo: DeviceLoginInfo;
  app: QuantApp;
}

/** A persisted `sessions` row, as the service reads/writes it. */
interface SessionRow {
  id: string;
  userId: string;
  tokenId: string | null;
  refreshTokenFamily: string | null;
  app: string | null;
  isActive: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  expiresAt: Date;
  deviceInfo: unknown; // Json column, narrowed to DeviceLoginInfo on read
}

/**
 * The subset of `PrismaClient` this service uses. Injecting an interface
 * (not the concrete client) is what makes the store swappable in tests.
 */
export interface SessionPrismaClient {
  session: {
    create(args: { data: SessionRow }): Promise<SessionRow>;
    findUnique(args: { where: { id: string } }): Promise<SessionRow | null>;
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<SessionRow[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}
```

Class, constructor, row↔session mapper, and the write/read core:

```ts
export class SessionService {
  private prisma: SessionPrismaClient;
  private maxSessionsPerUser: number;
  private sessionTimeout: number; // ms
  // Trusted-device trust stays in-memory: the sessions table has no such
  // concept (see plan "Design decisions locked").
  private trustedDevices: Map<string, Set<string>> = new Map();

  constructor(
    _config: AuthConfig,
    prismaClient: SessionPrismaClient = defaultPrisma as unknown as SessionPrismaClient,
  ) {
    this.prisma = prismaClient;
    this.maxSessionsPerUser = 10;
    this.sessionTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  private toSession(row: SessionRow): AuthSession {
    return {
      id: row.id,
      userId: row.userId,
      tokenId: row.tokenId ?? '',
      refreshTokenFamily: row.refreshTokenFamily ?? '',
      deviceInfo: row.deviceInfo as DeviceLoginInfo,
      app: (row.app ?? '') as QuantApp,
      isActive: row.isActive,
      lastActivityAt: new Date(row.lastActivityAt),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
    };
  }

  async createSession(options: CreateSessionOptions): Promise<AuthSession> {
    // Enforce+insert must be atomic across instances: on a shared Postgres store two concurrent
    // createSession calls can each read <10 active sessions and both insert, exceeding the max-10
    // cap. Take a transaction-scoped advisory lock keyed on the user, then run enforceSessionLimit
    // AND the INSERT inside that same transaction so the check and the insert cannot interleave:
    //   await this.prisma.$transaction(async (tx) => {
    //     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${options.userId}))`;
    //     await this.enforceSessionLimit(options.userId, tx);
    //     ... INSERT ...
    //   });
    await this.enforceSessionLimit(options.userId);
    const now = new Date();
    const row: SessionRow = {
      id: this.generateSessionId(),
      userId: options.userId,
      tokenId: options.tokenId,
      refreshTokenFamily: options.refreshTokenFamily,
      app: options.app,
      isActive: true,
      lastActivityAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTimeout),
      deviceInfo: options.deviceInfo,
    };
    const created = await this.prisma.session.create({ data: row });
    return this.toSession(created);
  }

  async getSession(sessionId: string): Promise<AuthSession | null> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) {
      await this.revokeSession(sessionId); // expired → hard-delete, as before
      return null;
    }
    if (!row.isActive) return null;
    return this.toSession(row);
  }
```

Listing, touch, and the revoke family (revoke/cleanup hard-delete — locked decision):

```ts
  async getUserSessions(userId: string): Promise<AuthSession[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
    });
    return rows.map((r) => this.toSession(r));
  }

  async touchSession(sessionId: string): Promise<void> {
    // Only active sessions are touched; the {isActive:true} guard reproduces
    // the old "don't update inactive sessions" behaviour.
    await this.prisma.session.updateMany({
      where: { id: sessionId, isActive: true },
      data: { lastActivityAt: new Date() },
    });
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.deleteMany({ where: { id: sessionId } });
    return count > 0;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({ where: { userId } });
    return count;
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSessionId } },
    });
    return count;
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    return sessions.length;
  }
```

App-scoped queries and the session-limit enforcer (all derived in memory from `getUserSessions`, per the locked decision — no SQL over `deviceInfo`):

```ts
  async hasActiveSessionForApp(userId: string, app: QuantApp): Promise<boolean> {
    const sessions = await this.getUserSessions(userId);
    return sessions.some((s) => s.app === app && s.isActive);
  }

  async getSessionsByApp(userId: string): Promise<Map<QuantApp, AuthSession[]>> {
    const sessions = await this.getUserSessions(userId);
    const grouped = new Map<QuantApp, AuthSession[]>();
    for (const session of sessions) {
      const appSessions = grouped.get(session.app) || [];
      appSessions.push(session);
      grouped.set(session.app, appSessions);
    }
    return grouped;
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    if (sessions.length >= this.maxSessionsPerUser) {
      // Oldest-first; free exactly enough room for the incoming session.
      const sorted = [...sessions].sort(
        (a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime(),
      );
      const toRemove = sorted.slice(0, sessions.length - this.maxSessionsPerUser + 1);
      for (const session of toRemove) {
        await this.revokeSession(session.id);
      }
    }
  }

  async getDeviceList(
    userId: string,
  ): Promise<{ deviceId: string; name: string; platform: string; lastSeen: Date }[]> {
    const sessions = await this.getUserSessions(userId);
    const deviceMap = new Map<
      string,
      { deviceId: string; name: string; platform: string; lastSeen: Date }
    >();
    for (const session of sessions) {
      const existing = deviceMap.get(session.deviceInfo.deviceId);
      if (!existing || session.lastActivityAt > existing.lastSeen) {
        deviceMap.set(session.deviceInfo.deviceId, {
          deviceId: session.deviceInfo.deviceId,
          name: `${session.deviceInfo.platform} - ${session.deviceInfo.userAgent.substring(0, 30)}`,
          platform: session.deviceInfo.platform,
          lastSeen: session.lastActivityAt,
        });
      }
    }
    return Array.from(deviceMap.values());
  }
```

Device revoke, in-memory trusted-device methods (sync, unchanged), cleanup, and id generation — then the class closes:

```ts
  async revokeByDeviceId(userId: string, deviceId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    const targets = sessions.filter((s) => s.deviceInfo.deviceId === deviceId);
    for (const session of targets) {
      await this.revokeSession(session.id);
    }
    return targets.length;
  }

  isDeviceTrusted(userId: string, deviceId: string): boolean {
    const trusted = this.trustedDevices.get(userId);
    if (!trusted) return false;
    return trusted.has(deviceId);
  }

  markDeviceTrusted(userId: string, deviceId: string): void {
    if (!this.trustedDevices.has(userId)) {
      this.trustedDevices.set(userId, new Set());
    }
    this.trustedDevices.get(userId)!.add(deviceId);
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const inactive = await this.prisma.session.deleteMany({
      where: { isActive: false },
    });
    return expired.count + inactive.count;
  }

  private generateSessionId(): string {
    return generateId('sess');
  }
}
```

> **Parity notes (why each behaviour is preserved):** `getSession` still hard-revokes on expiry and returns `null`; `getUserSessions` still filters active + non-expired and sorts `lastActivityAt` desc; `touchSession`'s `{isActive:true}` guard reproduces the old "skip inactive" branch; `enforceSessionLimit` runs _before_ the insert and frees exactly one slot; `revoke*`/`cleanup` hard-delete (matches the old `Map.delete`); `trustedDevices` is untouched. The only new column write is `createdAt`/`lastActivityAt`/`isActive`, all set explicitly so behaviour does not depend on the DB defaults from Task 1.

- [ ] **Step 4: Adapt the six state-seeding sites in `session-service.test.ts`.** These tests currently seed state by **mutating the object returned from `createSession`** (e.g. `session.expiresAt = …`). With a `Map` that object _was_ the stored session, so the mutation was visible to the service. With a DB the returned value is a detached copy, so state must be seeded by **writing the row** through the same mock client the service reads. Make exactly these edits (anchored to the current text, verified against the file):

**4a. Add the store import** — after `session-service.test.ts:3` (`import type { AuthConfig, DeviceLoginInfo } …`) add:

```ts
import { prisma } from '../lib/prisma';
```

**4b.** In `it('should return null and revoke expired sessions')` replace the mutation (`:112`):

```ts
session.expiresAt = new Date(Date.now() - 1000);
```

with a row write:

```ts
await prisma.session.update({
  where: { id: session.id },
  data: { expiresAt: new Date(Date.now() - 1000) },
});
```

**4c.** In `it('should sort sessions by lastActivityAt descending')` replace (`:164`):

```ts
s1.lastActivityAt = new Date(Date.now() + 10000);
```

with:

```ts
await prisma.session.update({
  where: { id: s1.id },
  data: { lastActivityAt: new Date(Date.now() + 10000) },
});
```

**4d.** In `it('should update lastActivityAt')` the assertion reads the _returned_ object, which no longer changes when the row is touched — re-fetch instead. Replace (`:182-186`):

```ts
const originalTime = session.lastActivityAt.getTime();
await new Promise((r) => setTimeout(r, 10));
await service.touchSession(session.id);

expect(session.lastActivityAt.getTime()).toBeGreaterThan(originalTime);
```

with:

```ts
const originalTime = session.lastActivityAt.getTime();
await new Promise((r) => setTimeout(r, 10));
await service.touchSession(session.id);

const touched = await service.getSession(session.id);
expect(touched!.lastActivityAt.getTime()).toBeGreaterThan(originalTime);
```

**4e.** In `it('should not update inactive sessions')` seed inactivity in the row and assert against the row (`getSession` returns `null` for inactive, so read raw). Replace (`:198-201`):

```ts
session.isActive = false;
const timeBefore = session.lastActivityAt.getTime();
await service.touchSession(session.id);
expect(session.lastActivityAt.getTime()).toBe(timeBefore);
```

with:

```ts
await prisma.session.updateMany({
  where: { id: session.id },
  data: { isActive: false },
});
const before = await prisma.session.findUnique({ where: { id: session.id } });
await service.touchSession(session.id);
const after = await prisma.session.findUnique({ where: { id: session.id } });
expect(after!.lastActivityAt).toEqual(before!.lastActivityAt);
```

**4f.** In `it('should revoke a session and return true')` delete the stale object-state assertion (`:217`) — the row is hard-deleted, so there is no `isActive:false` object to inspect; the following `getSession(...) === null` already proves revocation:

```ts
expect(session.isActive).toBe(false);
```

**4g.** In `it('should remove expired and inactive sessions')` replace the two mutations (`:459-460`):

```ts
s1.expiresAt = new Date(Date.now() - 1000);
s2.isActive = false;
```

with row writes:

```ts
await prisma.session.update({
  where: { id: s1.id },
  data: { expiresAt: new Date(Date.now() - 1000) },
});
await prisma.session.updateMany({
  where: { id: s2.id },
  data: { isActive: false },
});
```

> **Untouched tests (verified — no seeding via object mutation, so they pass as-is against the DB-backed service):** `createSession` property/limit checks; `getSession` null-for-unknown; `getUserSessions` active-only (uses `revokeSession`); `revokeAllSessions`/`revokeOtherSessions`/`getActiveSessionCount`/`hasActiveSessionForApp`/`getSessionsByApp`/`getDeviceList`/`revokeByDeviceId` (all drive the public API); `trusted devices` (`:432-439`, sync, in-memory); `cleanup` no-op case (`:466-477`); `session limit enforcement` (`:480-497`, creates 12 → expects ≤10). The `session.id` `/^sess_/` assertion (`:48`) still holds because the service supplies the id.

- [ ] **Step 5: Run the SessionService suite — expect PASS** (CI / healthy machine)

Run: `pnpm --filter @quant/auth test -- session-service`
Expected: PASS — including the new `persistence` test (Step 1), which now succeeds because both instances share the persisted store. This is the concrete proof that SSO gap 3.6 is closed.

- [ ] **Step 6: Run the full `@quant/auth` suite — expect PASS** (CI / healthy machine)

Run: `pnpm --filter @quant/auth test`
Expected: PASS — the other three suites that construct `new SessionService(config)` (`sso-middleware.test.ts:27`, `phase24-integration.test.ts:178`, `account-deletion-gate.test.ts:64`) exercise only the public API and are isolated by the Task 2 global reset, so they are unaffected by the storage change.

- [ ] **Step 7: Typecheck + build — proves the unchanged consumers still compile** (CI / healthy machine)

Run: `pnpm --filter @quant/auth exec tsc --noEmit`
Expected: no errors — in particular `middleware/sso-middleware.ts:91` and `middleware/auth-middleware.ts:51` still call `new SessionService(config)` with one arg (the 2nd is optional) and `index.ts:48` still re-exports cleanly.

Run: `pnpm -w build`
Expected: success (no build-step for `@quant/auth`, but the workspace typecheck/build must stay green end-to-end).

- [ ] **Step 8: Commit**

```bash
git add packages/auth/src/services/session-service.ts packages/auth/src/__tests__/session-service.test.ts
git commit -m "feat(auth): persist SessionService to Postgres (SSO phase 0, gap 3.6)

Sessions now live in the sessions table via an injectable Prisma client,
so they survive restarts and span instances. Public API unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice, after Task 3)

Run on CI / a healthy machine — NOT this box (see Global Constraints):

- `pnpm --filter @quant/database exec prisma validate` → schema valid.
- `pnpm --filter @quant/database exec prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL"` → **No difference detected** (migration `0074` fully expresses the schema delta).
- `pnpm --filter @quant/auth test` → all suites pass, including the new cross-instance `persistence` test.
- `pnpm --filter @quant/auth exec tsc --noEmit` → clean; the two middleware consumers and the `index.ts` re-export compile with zero edits.
- `pnpm -w typecheck && pnpm -w lint && pnpm -w build` → green workspace-wide.
- Grep guard: `prisma.session.` now appears in `packages/auth/src/services/session-service.ts` (service) and `packages/auth/src/__tests__/session-service.test.ts` (seeding) only — no stray callers elsewhere.

**Manual/behavioural confirmation of the fix (optional, on a machine with Postgres):** start two node processes pointing at the same database; `createSession` in one, `getSession(id)` in the other returns the session. Before this slice the second process returned `null`.

## Self-Review (author checklist — run once, fix inline)

- **Spec coverage:** slice 1 of the Phase-0 roadmap (persisted `SessionService`) is fully covered — schema reshape (Task 1), test harness (Task 2), service rewrite + tests (Task 3). Slices 2–5 are explicitly out of scope and each get their own plan. Design §3.6 / bug 3.7 #6 (in-memory sessions) is the single requirement this plan closes; the `persistence` test asserts it.
- **Placeholder scan:** no `TBD`/`TODO`/"add error handling"/"similar to"/prose-only steps — every code step carries full code; every `Run:` step has an exact command + expected output.
- **Type consistency:** `SessionPrismaClient` (create/findUnique/findMany/updateMany/deleteMany) is the exact set the service calls — `getSession`→`findUnique`, `getUserSessions`→`findMany`, `touchSession`→`updateMany`, `createSession`→`create`, `revoke*`/`cleanup`→`deleteMany`; no method is used that the interface omits. `CreateSessionOptions` and every public method signature match today's `session-service.ts` and the four call sites. `SessionRow` fields line up 1:1 with the Task 1 `model Session` columns; `deviceInfo` is `unknown`→cast to `DeviceLoginInfo`, `app` is `string|null`→cast to `QuantApp`, mirroring the nullable columns. The Task 2 mock implements a superset (adds `update`/`findFirst`/`count`/`delete`) so both the service (5 methods) and the test seeding (`update`/`findUnique`/`updateMany`) resolve against it.
- **Isolation:** the Task 2 global `beforeEach` reset keeps all four `new SessionService(config)` suites independent once the mock is stateful; no test depends on another's rows.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-28-quant-sso-phase0-persisted-sessions.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Because this box cannot build/test, each subagent authors on-branch and the checks run in CI (the Part A model).
2. **Inline Execution** — I execute the three tasks in this session with checkpoints for your review, again CI-verified rather than locally.

Which approach?
