# Memory Integration Map (Agent B, M11c)

> Evidence-based map of every memory entry point and how the facade slots in.
> Evidence from REPO_INTEGRATION_AUDIT.md + direct grep. No guessing.

## Target topology

```
AIEngine (and app backends)
      │
      ▼
 MemoryFacade (mode: legacy → dual_write → shadow → new)
      ├── LegacyMemoryAdapter → ContextManager   (legacy path)
      └── MemoryService (createMemoryService)     (new path; already a MemoryBackend)
```

## Memory entry points (current, from grep)

| Entry point              | File                                                                   | Memory used today         | Facade status                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI inference context     | `packages/ai/src/core/engine.ts` (`enrichPrompt`, `addToHistory`)      | legacy `ContextManager`   | ✅ behind facade in `legacy` mode (#549)                                                                                                             |
| QuantAI facts API        | `apps/quantai/backend/services/memory.service.ts` → `routes/memory.ts` | in-memory `AIMemoryStore` | ✅ conversational path behind facade — `QUANTAI_MEMORY_MODE` (legacy default), observe/recall/status routes, mode-cycle reversibility proven by test |
| QuantChat media memories | `apps/quantchat/backend/services/memory.service.ts`                    | Prisma `Memory` (media)   | separate domain — out of scope                                                                                                                       |
| Identity app-memory      | `packages/identity-permissions/.../memory-manager.ts`                  | in-memory `MemoryManager` | unused (dead) — out of scope                                                                                                                         |

## Wiring gap (the risky step — staged, not done)

`AIEngine` uses a PAIRING model (`enrichPrompt(userId, prompt)` before inference,
`addToHistory(userId, prompt, response)` after) — **not** the per-turn
`observe/recall` the `MemoryBackend` exposes. So a faithful, zero-behavior-change
wiring needs a facade shaped to the AIEngine call sites:

```
interface EngineMemory {
  enrich(userId, prompt): Promise<string>          // read
  record(userId, prompt, response): Promise<void>  // write (pair)
}
```

Options for the wiring step:

- **(a)** Add an `EngineMemory`-shaped facade variant whose `legacy` mode delegates
  directly to `ContextManager.enrichPrompt`/`addToHistory` (byte-identical to today),
  and whose `new` mode maps prompt→`recall` and pair→`observe`. Lowest-risk for
  engine wiring; keeps the existing `MemoryFacade` (observe/recall) for app backends.
- **(b)** Reconcile AIEngine to the observe/recall model. Larger change.

**Recommendation:** (a). It preserves "zero behavioral change" in `legacy` mode by
construction (same ContextManager calls) and is a small, isolated, well-testable
change to `engine.ts`. This is the ONE production edit and gets its own careful
commit + full-suite proof. Not done in this batch — flagged so it isn't rushed.

## Paths still bypassing the facade (must be routed before `new` cutover)

- `engine.ts` direct `ContextManager` calls (the wiring gap above).
- `apps/quantai/backend/services/memory.service.ts` direct `AIMemoryStore` usage.

Everything else (quantchat media memories, identity manager) is a different domain
or dead — not part of the AI-memory migration.
