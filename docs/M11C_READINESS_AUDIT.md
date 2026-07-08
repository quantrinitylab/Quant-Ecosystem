# M11c Production Readiness Audit (Agent E)

> Audit BEFORE the AIEngine wiring. Output only — no fixes. Scope: MemoryFacade,
> LegacyMemoryAdapter, shadow path.

| Concern             | Finding                                                                                                                                                                                     | Risk | Action (deferred)                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| Thread safety       | Facade is stateless; no shared mutable fields. Node is single-threaded per event loop.                                                                                                      | Low  | none                                                                                                         |
| Async races         | `observe` awaits legacy (primary) then secondary; `shadow` awaits legacy then new sequentially. No interleaved shared state.                                                                | Low  | Could parallelize legacy+new reads in shadow for latency — deferred (measure first).                         |
| Cancellation        | No `AbortSignal` propagation to backends.                                                                                                                                                   | Med  | Add signal pass-through when wiring into request handlers (M11d).                                            |
| Retries             | Facade does no retries (by design — dumb). Backends own retries.                                                                                                                            | Low  | none                                                                                                         |
| Timeout propagation | No timeout on the silent new-path recall in shadow; a slow new backend adds latency to... nothing user-facing (legacy already returned) but holds the async op.                             | Med  | Wrap shadow new-recall in a timeout so a hung new backend can't leak pending ops. Deferred.                  |
| Memory leaks        | Facade holds no collections; ShadowReports handed to sink, not retained.                                                                                                                    | Low  | Ensure the production sink is bounded (ring buffer / streaming), not an unbounded array.                     |
| Duplicate writes    | `dual_write` writes legacy + new; idempotency is each store's concern (new store has fingerprint path). Legacy `addToHistory('', ...)` via adapter can add empty assistant turns.           | Med  | The adapter is harness-only; do NOT use it as engine's legacy path (INTEGRATION_MAP option (a) avoids this). |
| Idempotency         | New store: fingerprint-based (TD-010, index pending). Legacy: none.                                                                                                                         | Med  | Fingerprint index is M11d/M11e (TD-010).                                                                     |
| Observability gaps  | Shadow emits per-recall reports; write-path (dual_write) secondary failures emit via `onSecondaryWriteError`. No metric for dual-write divergence (did both stores accept the same write?). | Med  | Add a dual-write consistency check/metric before `new` cutover.                                              |

## Summary

No High-risk blockers in the facade/adapter themselves. The Med items cluster
around the eventual wiring (cancellation, timeout on silent recall, bounded sink,
dual-write consistency metric) — all addressable at the wiring/M11d step, none
requiring architecture change. The LegacyMemoryAdapter's empty-assistant-turn
quirk is why it is explicitly a harness adapter, not the engine's legacy path.
