# @quant/app-registry (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create `@quant/app-registry` — the single source of truth for the Quant app catalog — replacing the three drifted, out-of-sync lists (desktop `QUANT_SOVEREIGN_APPS`, mobile `QUANT_APPS`, marketing `APPS_DATA`).

**Architecture:** Pure-TS, dependency-free except `@quant/brand`. The registry OWNS catalog identity (canonical `id`/`name`/`route`/`category`/`maturity`/`devPort`) and DERIVES visual identity (`color`/`hue`/`iconRef`) from `@quant/brand` via `resolveAppConfig`, so color can never drift from the design system again. Phase 0 is **additive** — it wires no consumer; the shells migrate onto it in later phases.

**Tech Stack:** TypeScript ~5.5, vitest, pnpm workspace. Build/config mirrors sibling leaf packages (`@quant/brand`).

**Spec:** [docs/superpowers/specs/2026-09-30-per-app-platform-presence-restructure-design.md](../specs/2026-09-30-per-app-platform-presence-restructure-design.md)

## Global Constraints
- **Canonical product ids ONLY** (post-rename): `quantmail, quantchat, quantai, quantgram, quantwave, quantcooks, quantube, quantmax, quantads`. The legacy ids `quantneon`/`quantsync`/`quantedits` MUST NOT appear as product ids — they stay brand-internal and are reached only via `resolveAppConfig` aliasing.
- Dependency-free except `@quant/brand`. No `tailwindcss`/`react`/`next` imports (must be consumable from Node, React Native, and desktop shells).
- `color`/`hue`/`iconRef` are NEVER redefined here — always resolved from `@quant/brand`.
- Local build is impossible on this box → verification is CI `gate` only.

## Evidence — the three catalogs disagree (this is the bug)
| Field | desktop `QUANT_SOVEREIGN_APPS` | mobile `QUANT_APPS` | marketing `APPS_DATA` |
|---|---|---|---|
| count / set | 8 (incl. non-products codehub, quantdrive, quantcalendar) | 13 (incl. quantdocs, quantmeet, quantdrive, quantcalendar) | 10 (incl. quantgit, quanttrinity) |
| naming era | post-rename (quantgram) | **pre-rename** (quantneon, quantsync, quantedits) | mixed (quantgit, quantwave) |
| quantmail color | `#3b82f6` | `#4285F4` | — |
| quantchat color | `#8b5cf6` | `#34A853` | — |
| quantai port | 3001 | — | 3002 |
| quantchat port | 3002 | — | 3001 |
| quantgram | `/feed` @ 3004 | `quantneon` `/neon` | `/`... @ 3005 |
| duplicate ports | 3000 (mail+calendar), 3004 (drive+gram) | — | — |
| `quantcooks` | **absent** | **absent** | **absent** |

Three lists, three app sets, three naming eras, conflicting ports & colors, and the renamed `quantcooks` exists in none. A single typed registry fixes this class of bug permanently.

## Canonical catalog (the 9 products) — authoritative Phase-0 data
`color`/`hue`/`iconRef` are NOT in this table; they are resolved at runtime from `@quant/brand`.

| id | name | route | category | maturity | devPort | brand alias → |
|---|---|---|---|---|---|---|
| quantmail | QuantMail | /mail | core | ga | — (3000) | quantmail |
| quantchat | QuantChat | /chat | core | beta | — (3000) | quantchat |
| quantai | QuantAI | /ai | core | beta | — (3000) | quantai |
| quantmax | QuantMax | /max | core | alpha | — (3000) | quantmax |
| quantgram | QuantGram | /gram | social | alpha | — (3000) | quantneon |
| quantwave | QuantWave | /wave | social | alpha | 3003 | quantsync |
| quantcooks | QuantCooks | /cooks | social | alpha | — (3000) | quantedits |
| quantube | QuanTube | /tube | social | beta | 3005 | quantube |
| quantads | QuantAds | /ads | infra | alpha | 3004 | quantads |

Notes: `name` + `route` + `category` + `maturity` are **registry-owned canonical** (post-rename). `resolveAppConfig(id)` returns the legacy brand config (e.g. `quantgram`→`quantneon`), so we take ONLY `color`/`hue`/`iconRef` from it — never `name` (brand still says "QuantNeon"). `devPort` is listed only where the app's `package.json` declares an explicit `-p` (quantwave 3003, quantube 3005, quantads 3004); the six that default to 3000 leave `devPort` undefined (a canonical conflict-free port scheme is a later-phase follow-up, out of Phase-0 scope).

## File Structure
- Create `packages/app-registry/package.json` — name `@quant/app-registry`, `@quant/brand` as sole dep, scripts (typecheck/lint/test/build) mirroring `packages/brand`.
- Create `packages/app-registry/tsconfig.json` — extends the repo base like `packages/brand/tsconfig.json`.
- Create `packages/app-registry/src/types.ts` — `AppCategory`, `AppMaturity`, `PlatformSurface`, `AppKind`, `QuantAppEntry`, `ResolvedQuantApp`.
- Create `packages/app-registry/src/registry.ts` — the canonical `PRODUCT_APPS: QuantAppEntry[]` (table above) + `resolveApp(id)` merging brand visuals.
- Create `packages/app-registry/src/queries.ts` — `getApp`, `allApps`, `byCategory`, `searchApps`, `resolveAllApps`.
- Create `packages/app-registry/src/index.ts` — public re-exports.
- Create `packages/app-registry/src/__tests__/registry.test.ts` — data-integrity tests.
- Create `packages/app-registry/src/__tests__/queries.test.ts` — helper tests.

## Task 1: Package scaffold + type schema

**Files:** Create `packages/app-registry/{package.json,tsconfig.json,src/types.ts,src/index.ts}`.

**Interfaces produced (consumed by Tasks 2-3):**
```ts
export type AppCategory = 'core' | 'social' | 'infra';
export type AppMaturity = 'ga' | 'beta' | 'alpha';
export type PlatformSurface = 'web' | 'backend' | 'desktop' | 'mobile' | 'marketing' | 'admin';
export type AppKind = 'product' | 'hub';
export interface QuantAppEntry {
  id: string; name: string; route: string;
  category: AppCategory; maturity: AppMaturity; kind: AppKind;
  surfaces: PlatformSurface[]; devPort?: number;
}
export interface ResolvedQuantApp extends QuantAppEntry {
  color: string; hue: number; iconRef: string;
}
```

- [ ] **Step 1:** Write `package.json` mirroring `packages/brand/package.json` (same `scripts`, `main`/`types`/`exports`, `devDependencies`), `dependencies: { "@quant/brand": "workspace:*" }`, `version` matching sibling leaf packages.
- [ ] **Step 2:** Write `tsconfig.json` extending the same base config `packages/brand/tsconfig.json` extends, `include: ["src"]`.
- [ ] **Step 3:** Write `src/types.ts` with the interfaces above.
- [ ] **Step 4:** Write a temporary `src/index.ts` re-exporting `./types` so the package typechecks standalone.
- [ ] **Step 5:** Commit (`feat(app-registry): scaffold package + type schema`).

## Task 2: Canonical catalog + brand-derived resolver

**Files:** Create `src/registry.ts`, `src/__tests__/registry.test.ts`. Modify `src/index.ts`.

**Interfaces produced:** `PRODUCT_APPS: QuantAppEntry[]`; `resolveApp(entryOrId): ResolvedQuantApp` (pulls `color`/`hue`/`iconRef` from `resolveAppConfig` in `@quant/brand`).

- [ ] **Step 1:** Write `src/__tests__/registry.test.ts` (fails first — module absent):
  - `PRODUCT_APPS` has exactly 9 entries; ids === the canonical set (order-independent).
  - none of `quantneon`/`quantsync`/`quantedits` appears as an `id`.
  - every `id` resolves via `resolveAppConfig` to a `#RRGGBB` color and numeric `hue` (asserts `resolveApp` returns valid visuals for all 9).
  - `route` values are unique; each starts with `/`.
  - defined `devPort`s are unique (3003/3004/3005) — guards the historical port-collision bug.
  - `name` never equals the legacy brand display name for the 3 renamed apps (e.g. quantgram.name === 'QuantGram', not 'QuantNeon').
- [ ] **Step 2:** Run `pnpm --filter @quant/app-registry test` → expect FAIL (cannot run locally; rely on `gate`). Record intent.
- [ ] **Step 3:** Write `src/registry.ts`: the `PRODUCT_APPS` array from the table (all `kind:'product'`, `surfaces:['web','backend']`), and `resolveApp` importing `resolveAppConfig` from `@quant/brand`, spreading `{ color, hue, iconRef }` over the entry.
- [ ] **Step 4:** Update `src/index.ts` to also export `./registry`.
- [ ] **Step 5:** Commit (`feat(app-registry): canonical 9-product catalog with brand-derived visuals`).

## Task 3: Query helpers

**Files:** Create `src/queries.ts`, `src/__tests__/queries.test.ts`. Modify `src/index.ts`.

**Interfaces produced:** `getApp(id): QuantAppEntry | undefined`; `allApps(): QuantAppEntry[]`; `byCategory(cat): QuantAppEntry[]`; `searchApps(q): QuantAppEntry[]`; `resolveAllApps(): ResolvedQuantApp[]`.

- [ ] **Step 1:** Write `src/__tests__/queries.test.ts` (fails first):
  - `getApp('quantmail')` returns the entry; `getApp('nope')` → `undefined`.
  - `byCategory('core')` returns 4 (mail/chat/ai/max); `byCategory('social')` returns 4; `byCategory('infra')` returns 1.
  - `searchApps('mail')` includes quantmail; `searchApps('QUANT')` (case-insensitive) returns all 9; matches on id + name.
  - `resolveAllApps()` length 9, each has a `color`.
- [ ] **Step 2:** Run tests → expect FAIL locally; rely on `gate`.
- [ ] **Step 3:** Write `src/queries.ts` implementing the helpers over `PRODUCT_APPS` (+ `resolveApp`).
- [ ] **Step 4:** Finalize `src/index.ts` re-exporting types, `PRODUCT_APPS`, `resolveApp`, and all queries.
- [ ] **Step 5:** Commit (`feat(app-registry): typed query helpers (getApp/byCategory/searchApps)`).

## Verification
- Push branch `feat/per-app-platform-presence`; open PR to `main`.
- Sole required check = `gate` (`turbo typecheck lint test build` on the new workspace). Confirm GREEN before requesting merge.
- No consumer is wired in Phase 0, so blast radius is limited to the new package — `full-sweep` should stay unaffected.

## Follow-ups (explicitly out of Phase-0 scope)
- Canonical conflict-free `devPort` scheme + aligning each app's `package.json`.
- Hub entries (`kind:'hub'`: marketing-home, enterprise-admin, trinity) once Category B is reframed.
- Migrate desktop/mobile/marketing/SSO consumers off their local lists onto `@quant/app-registry` (later phases).

