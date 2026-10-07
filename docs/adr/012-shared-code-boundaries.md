# ADR-012: Shared-Code Boundary Rules & Cross-Package Isolation

> Architecture Decision Record establishing strict package boundaries, dependency directions, cross-app isolation, and deduplication protocols across the Quant Ecosystem monorepo.

## Status

ACCEPTED

## Date

2026-09-18

## Context

The Quant Ecosystem operates as a multi-application monorepo containing:

- Flagship applications (`apps/quantmail`, `apps/quantchat`, etc.)
- Shared foundational packages (`packages/db`, `packages/server-core`, `packages/federation`, `packages/ui`, etc.)
- Autonomous AI swarms and toolchains orchestrating code, migrations, and CI pipelines

As the monorepo expanded to reach 100% authentic parity across 10 killer applications and multi-tenant services, architectural debt risks emerged:

1. **Accidental Circular Dependencies**: Apps importing sibling apps or core packages referencing app-specific business logic.
2. **Duplicate Implementation Sprawl**: Multiple services implementing redundant parsers, auth handlers, or data wrappers without checking if the capability already exists in `@quant/*` or existing backend services.
3. **Leaky Abstractions**: Database queries and direct schema manipulations scattered across UI components rather than encapsulated in verified domain service layers.
4. **Build & Typecheck Degradation**: Complex module graphs slowing down compilation (`tsc --noEmit`) and breaking monorepo isolation.

A clear, enforceable boundary standard is required to protect system integrity and guide both human engineers and autonomous agents.

## Options Considered

### Option A — Completely Open Cross-Imports

- Allow apps and packages to import freely across any workspace folder.
- **Pros**: Rapid prototyping without formalizing shared libraries.
- **Cons**: Severe circular dependencies, tangled build graphs, impossible to decouple or deploy independently, extreme cognitive load.

### Option B — Complete Repository Decoupling (Polyrepo)

- Break every application and shared package into standalone git repositories.
- **Pros**: Hard boundary enforcement by git repository isolation.
- **Cons**: High operational overhead, painful cross-cutting refactoring, version lock-in, fragmented CI/CD pipelines, and severe drag on swarm orchestration.

### Option C — Layered Architecture with Enforced Monorepo Boundaries & Deduplication Gates

- Maintain a single unified monorepo with strict architectural tiering and automated boundary validation:
  1. **Tier 0 (Foundations)**: `packages/db`, `packages/config`, `packages/types` — zero dependencies on higher tiers.
  2. **Tier 1 (Core Infrastructure)**: `packages/server-core`, `packages/federation`, `packages/ui` — depends only on Tier 0.
  3. **Tier 2 (Applications)**: `apps/quantmail`, `apps/quantchat`, etc. — depends on Tier 0 & Tier 1. Zero cross-app imports.
  4. **Pre-flight Invariant ("Is this already built?")**: Mandatory check against existing services before introducing new modules.
- **Pros**: Retains monorepo agility and atomic commits while enforcing ironclad architectural separation and eliminating redundant stubs.
- **Cons**: Requires discipline and strict PR review checks.

## Decision

We adopt **Option C: Layered Architecture with Enforced Monorepo Boundaries & Deduplication Gates**.

### Core Boundary Rules

1. **Downwards-Only Dependency Flow**:
   - `apps/*` $\rightarrow$ `packages/*` is permitted.
   - `packages/*` $\rightarrow$ `apps/*` is **STRICTLY PROHIBITED**. Foundational packages must never know about consumer apps.
   - `apps/A` $\rightarrow$ `apps/B` direct source imports are **STRICTLY PROHIBITED**. Inter-app communication must occur via HTTP/RPC APIs, WebSocket channels, or shared contracts in `packages/`.

2. **Database Single Source of Truth**:
   - Prisma schemas, migrations, and database client definitions reside exclusively in the canonical database layer (`packages/db` or `apps/quantmail/backend/prisma`).
   - Direct raw SQL manipulations outside service repositories or schema modifications without formal migration scripts are forbidden.

3. **Zero-Mock & Authenticity Invariant**:
   - Production service routes must never return mocked, hardcoded, or synthetic dummy seed data.
   - All endpoints must integrate with verified persistence (PostgreSQL/Prisma, Redis, Object Storage) or explicit fail-closed error handling.

4. **Mandatory Pre-Flight Deduplication Check**:
   - Before authoring any new utility, helper, or service, engineers and agents must perform a search across `packages/` and `apps/` to verify whether an equivalent implementation already exists.
   - Reusable utilities must be hoisted to the appropriate `packages/*` domain rather than cloned.

5. **Typecheck and Gate Enforcement**:
   - All packages and applications must pass dual TypeScript compilation without errors (`tsc --noEmit` and `tsc --noEmit -p tsconfig.backend.json`).
   - Vitest suites must pass 100% green before any PR merge.

## Consequences

- **What becomes easier?**
  - Dependency trees remain clean and deterministic.
  - Refactoring shared packages does not unexpectedly break apps due to hidden side channels.
  - Build and linting speeds improve significantly with clear caching boundaries.
  - Autonomous agents can reliably locate canonical implementations without creating duplicate logic.

- **What becomes harder?**
  - Sharing quick code between two apps requires formally moving it to a shared package or API contract.
  - Initial scaffolding of cross-app capabilities requires adhering to formal interface definitions.

## Future Impact

- In 1–3 years, as the Quant Ecosystem expands to hundreds of micro-features, these boundaries will prevent the codebase from devolving into an unmaintainable monolith.
- Ensures seamless future migration to standalone container deployments or edge runtimes if necessary.

## Complexity Assessment

**REDUCES civilization complexity**. Standardizing boundary rules removes guesswork, eliminates circular import debugging nightmares, and ensures high architectural cohesion across all 10 core applications.

---

_Signed by: Developer 2 (Sentinel & QA) & Antigravity Orchestrator | Reviewed by: CEO Astra_
