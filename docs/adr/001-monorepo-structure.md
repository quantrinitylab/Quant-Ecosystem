# ADR-001: Monorepo with pnpm + Turborepo

## Status

ACCEPTED (inherited — pre-dates ADR system)

## Date

2024-12-01 (approximate, based on initial commit)

## Context

Quant Ecosystem is a multi-app, multi-service platform with shared packages.
Need a code organization strategy that supports:
- Shared TypeScript types and utilities across 16+ apps
- Incremental builds (only rebuild what changed)
- Atomic cross-package refactoring
- Single CI pipeline

## Options Considered

### Option A — Monorepo (pnpm workspaces + Turborepo)
**Pros:** Atomic changes, shared deps, incremental builds, single CI
**Cons:** Large repo size, complex tooling, slow initial installs

### Option B — Polyrepo (one repo per app/package)
**Pros:** Independent deploys, smaller repos, clearer ownership
**Cons:** Version coordination hell, diamond deps, cross-cutting changes span N PRs

### Option C — Monorepo with Nx
**Pros:** Powerful graph analysis, remote cache
**Cons:** Heavier setup, opinionated project structure

## Decision

Option A — pnpm workspaces + Turborepo.
Reasoning: TypeScript ecosystem standard, lightweight config (turbo.json),
pnpm's strict node_modules isolation prevents phantom deps.

## Consequences

- All 96 packages share one lockfile (faster deduplication)
- CI matrix builds all deployable units from one checkout
- ~35 orphaned packages inflate workspace (tech debt)
- No remote cache configured (turbo remote cache would cut CI 60%+)

## Future Impact

- 1yr: As team grows, CODEOWNERS + path-based CI triggers become critical
- 3yr: May need to split into "core platform" + "apps" workspaces
- 5yr: Consider toolchain migration (Nx, Bazel) if Turborepo hits limits

## Complexity Assessment

REDUCES complexity: one repo, one truth, one CI. The alternative (20+ repos)
would create exponential coordination overhead at this team size.

---

*Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO*
