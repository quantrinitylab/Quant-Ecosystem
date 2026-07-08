# QCI Delta — MemoryFacade (Agent G)

> Quant Complexity Index delta for the M11c facade. QCI here = a qualitative
> assessment of coupling, states, and reasoning load (no formal metric tool in
> repo; assessed by structure).

## QCI_BEFORE (without facade)

- Callers (AIEngine, app backends) couple **directly** to a specific memory
  implementation (`ContextManager`, `AIMemoryStore`).
- Migrating to the new subsystem would be a **big-bang replace** — every caller
  edited at once, no rollback, no comparison. High migration complexity, high risk.
- No mechanism to compare old vs new on real traffic.

## QCI_AFTER (with facade)

- **Temporary** complexity added: one stateless facade + one adapter + a mode
  flag + dual-write during migration.
- **Permanent** complexity reduced: callers depend on ONE seam (`MemoryBackend`);
  swapping implementations is a mode change, not a code change; rollback is instant.
- Comparison/measurement is built in (shadow + metrics + replay).

## Net

- **Short term:** slight increase (facade + adapter + dual-write) — scaffolding.
- **Long term:** decrease — after cutover the facade and legacy path are DELETED
  (per the Engineering Bible principle: _migration code is temporary_), leaving
  callers pointed at one implementation through one seam.

## Guardian verdict

APPROVE. The temporary complexity is justified: it converts a high-risk big-bang
replacement into a measured, reversible migration, and it is removed after cutover.
Net long-term QCI is lower than both the before-state and a direct replacement.

## Removal checklist (when `new` cutover completes)

- [ ] Delete `LegacyMemoryAdapter`
- [ ] Delete legacy `ContextManager` (once no caller uses it)
- [ ] Collapse the facade to a thin pass-through or remove it
- [ ] Keep: MemoryService, retrievers, eval, replay, corpus, metrics (permanent assets)
