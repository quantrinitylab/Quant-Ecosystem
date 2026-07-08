# M11c Phase 1 — Zero Behavioral Change Integration (AIEngine)

> The one production edit of M11c: route `AIEngine`'s memory through the facade
> in `legacy` mode. Governed by ADR-011. Scope: `engine.ts` + a new
> `engine-memory.ts` seam. No retrieval, ranking, or prompt tuning.

## Charter

> Users cannot tell that the memory architecture underneath `AIEngine` has
> changed. Legacy mode must be byte-identical to the pre-facade engine.

## Before → After architecture

**Before** — `AIEngine` called the legacy `ContextManager` directly:

```
AIEngine.infer/stream
   ├── contextManager.enrichPrompt(userId, prompt, context)   (read)
   └── contextManager.addToHistory(userId, prompt, response)   (write)
```

**After** — the two call sites go through a stateless memory seam:

```
AIEngine.infer/stream
   └── memory: EngineMemory                     (default: EngineMemoryFacade, mode=legacy)
          └── EngineMemoryFacade (legacy)
                 └── LegacyEngineMemory
                        └── ContextManager.enrichPrompt / addToHistory   (unchanged)
```

`getContextManager()` still returns the identical `ContextManager` instance, so
every external consumer is unaffected.

## Why a new seam (option (a), INTEGRATION_MAP.md)

`AIEngine` uses a PAIRING model (`enrich`/`record`), not the per-turn
`observe`/`recall` of `MemoryBackend`. `EngineMemory` is shaped to the exact call
sites, so `legacy` mode is byte-identical **by construction** — it calls the same
`ContextManager` methods, with the same args, in the same order. The existing
`MemoryFacade` (observe/recall) is retained for app backends.

## Modes (reversible FSM — ADR-011)

| Mode         | enrich (read)                                 | record (write)                       |
| ------------ | --------------------------------------------- | ------------------------------------ |
| `legacy`     | legacy                                        | legacy                               |
| `dual_write` | legacy                                        | legacy (primary) + new (best-effort) |
| `shadow`     | legacy (new run silently, compared, reported) | legacy + new (best-effort)           |
| `new`        | new                                           | new                                  |

Default is `legacy`. Mode changes construct a new facade (config) — the facade
holds no mutable state.

## Proof of zero behavioral change

- **By construction:** `LegacyEngineMemory.enrich/record` delegate directly to
  `ContextManager.enrichPrompt`/`addToHistory`.
- **Byte-identical test:** `engine-memory.test.ts` asserts the enriched prompt via
  the seam equals calling `ContextManager` directly.
- **Delegation tests:** spies confirm identical method + args + order.
- **Regression suite:** full `packages/ai` suite green — `515 passed` (was 501;
  +14 new seam tests). `engine.test.ts`, `assistant.test.ts`,
  `smart-compose.test.ts`, `code-generation.test.ts`, `device-control-ai.test.ts`,
  `unified-ai-service.test.ts`, `fail-closed.test.ts` all pass unchanged.
- **Typecheck:** `tsc --noEmit` exit 0.

## Risk & rollback

| Item          | Assessment                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Blast radius  | `AIEngine` only. No public API change; no SDK break; no downstream edit.                                                                |
| Runtime path  | `legacy` mode adds two thin `async` delegations (one extra await hop).                                                                  |
| Rollback      | Revert `engine.ts` to direct `contextManager` calls, or delete the seam file. Mode is already `legacy`, so no data or behavior differs. |
| New-path risk | Not on the runtime path (default legacy). `dual_write`/`shadow`/`new` require an explicitly injected `next`; unused until M11d.         |

## Performance note (measurement only, no optimization)

`legacy` mode adds one `EngineMemoryFacade.enrich/record` frame plus one
`LegacyEngineMemory` frame — two `async` delegations that immediately await the
same `ContextManager` calls as before. No new allocations beyond the two adapter
instances created once per `AIEngine`. No caching, batching, or retries added.

## Cutover plan (post-merge, M11d — NOT in this PR)

1. Provide a `MemoryServiceEngineMemory` `next` bound to `createMemoryService(...)`.
2. Flip to `dual_write` → observe consistency; then `shadow` → collect
   `EngineShadowReport`s; aggregate against ADR-011 gates.
3. A human advances to `new` only when gates pass. Every step is reversible.

## Files

- `packages/ai/src/core/engine-memory.ts` — `EngineMemory`, `LegacyEngineMemory`,
  `MemoryServiceEngineMemory`, `EngineMemoryFacade` (new).
- `packages/ai/src/core/engine.ts` — wired to `EngineMemoryFacade` (legacy mode).
- `packages/ai/src/__tests__/engine-memory.test.ts` — seam + facade tests (new).
