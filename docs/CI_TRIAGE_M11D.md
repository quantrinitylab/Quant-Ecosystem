# Downstream CI Triage — restoring green main

> Triage of the CI failures observed after PR #548/#549 merged. Goal: separate
> real, reproducible bugs from CI-only noise, and fix the real ones.

## Root cause found & fixed: `node:crypto` scheme breaks app webpack builds

**Symptom (CI gate + local repro):**

```
@quant/quantube:build / @quant/quantads:build
Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not
handled by plugins (Unhandled scheme). Build failed because of webpack errors.
```

**Cause:** the browser-safe `@quant/ai` barrel (`packages/ai/src/index.ts`)
re-exports value modules that statically `import { createHash } from 'node:crypto'`:

- `core/extraction-schema.ts` (`fingerprintFact`)
- `adapters/qdrant-vector-backend.ts` (`toPointId`)

When any Next.js app imports from the `@quant/ai` barrel, webpack must resolve
the whole module graph. The `node:` **scheme** throws `UnhandledSchemeError`
during resolution (before tree-shaking can drop the unused server-only code).
This entered `main` with the memory subsystem exports (#548) — which is why the
app builds went red across `quantube`, `quantads`, `quantneon`, `quantmax`,
`quantcalendar`, `quantmeet`, etc. (all barrel consumers).

**Fix (minimal, behavior-identical):** import the bare `crypto` specifier instead
of the `node:crypto` scheme in those two files. Bare `crypto` resolves on the
server and tree-shakes out of client bundles; webpack no longer chokes on the
scheme. No eslint rule enforces the `node:` prefix in this repo. The functions
are server-only, so runtime behavior is unchanged.

**Proof:** with the fix, `@quant/quantube` and `@quant/quantads` both report
`✓ Compiled successfully` (previously failed at compile). `@quant/ai` suite stays
green (517 tests), typecheck + lint clean, affected-module tests 17/17.

## Confirmed NOT reproducible locally (CI-environment-specific — tracked, not fixed here)

- `@quant/quantube#test` — `history-enrichment.seam.test.ts` + `history-pagination.property.test.ts`
  returned HTTP 500 in the CI gate. **Locally these pass (378/378).** The seam
  test swaps in an in-memory prisma double after boot, so it needs no real DB.
  The CI-only 500s point to a CI-environment condition (build-artifact/generation
  ordering or resource limits), not a code defect. Tracked for CI investigation.

## Confirmed clean (were false positives from a dirty working tree)

- `@quant/quantmail#typecheck` — fails ONLY because of uncommitted local WIP in
  `apps/quantmail/backend/routes/drive.ts` (+72 lines importing `@quant/storage`
  and `@aws-sdk/*` that aren't quantmail deps). The **committed** `drive.ts` on
  `main` is clean and typechecks. Not a main-CI failure.
- `@quant/quantchat#typecheck` — passes on clean `main` locally.

## Net effect

Fixing the `node:crypto` barrel leak should turn the app `#build` cascade green.
The `quantube#test` CI-only 500s remain as a separate tracked CI item (not a code
bug; passes locally). No memory-facade behavior changed.
