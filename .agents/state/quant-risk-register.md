# Quant Ecosystem Risk Register

## CRITICAL

### R-001: TypeScript typecheck broken (~896 errors)

- **Impact:** Blocks all development, CI cannot pass, type safety is not enforced
- **Details:** ~896 TypeScript errors across 14 packages after building common:
  - ml-pipeline: 265 errors
  - recommendations: 245 errors
  - search: 77 errors
  - observability: 62 errors
  - testing: 51 errors
  - security: 49 errors
  - media: 48 errors
  - moderation: 25 errors
  - social-graph: 24 errors
  - ai: 14 errors
  - ml-runtime: 9 errors
  - payments: 9 errors
  - database: 7 errors
  - notifications: 6 errors
- **Root causes:**
  - TS6305: missing dist output from referenced projects (composite references)
  - TS2532/TS18048: possibly undefined from noUncheckedIndexedAccess
  - TS6133/TS6196: unused variables/imports
- **Mitigation:** Fix in phases starting with packages that have fewest errors

### R-002: Build pipeline broken

- **Impact:** Cannot produce deployable artifacts
- **Details:** `pnpm build` fails because typecheck is a prerequisite for many build steps
- **Mitigation:** Fix typecheck first, then build will likely pass

### R-003: Prisma client not wired into turbo pipeline

- **Impact:** @quant/database typecheck always fails without manual `prisma generate`
- **Details:** Prisma client must be generated before database package can typecheck, but this is not automated in turbo pipeline
- **Mitigation:** Add `db:generate` as a prerequisite task in turbo.json or in the database build script

### R-004: Composite project references vs --noEmit conflict

- **Impact:** typecheck cannot complete for packages referencing other packages via project references
- **Details:** tsconfig has `composite: true` which requires declaration output, but typecheck uses `--noEmit`. Referenced packages need their `dist/` built first.
- **Mitigation:** Either remove composite or ensure build runs before typecheck for referenced packages

## HIGH

### R-005: 15 high security vulnerabilities in next.js

- **Impact:** Security audit gate fails, potential production risk
- **Details:** `pnpm audit` reports 15 high severity vulnerabilities in next.js dependency tree
- **Mitigation:** Upgrade next.js to latest patched version

## MEDIUM

### R-006: Lint is non-functional

- **Impact:** No code quality enforcement, no consistent style
- **Details:** `pnpm lint` runs zero tasks because no package defines a `lint` script
- **Mitigation:** Add eslint configuration and lint scripts to packages

## LOW

### R-007: scripts/test.js uses CommonJS in ESM package (FIXED)

- **Impact:** Custom test runner cannot execute
- **Details:** Root package.json has `"type": "module"` but scripts/test.js uses `require()`. Fixed by renaming to scripts/test.cjs.
- **Mitigation:** Renamed to scripts/test.cjs

## INFO

### R-008: README claims 9 apps but there are 13

- **Impact:** Documentation inaccuracy, confusion for new contributors
- **Details:** README.md states the ecosystem has 9 apps, but `apps/` directory contains 13
- **Mitigation:** Update README when stabilization is complete
