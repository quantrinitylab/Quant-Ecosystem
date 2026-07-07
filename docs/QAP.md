# Quant Architecture Principles (QAP)

> These are not guidelines. These are laws.
> Every PR is reviewed against these principles.
> Violation = reject. No exceptions without CEO-approved ADR.
>
> Inspired by: POSIX, Google SRE Principles, AWS Well-Architected.
> But these are OURS.

---

## The Principles

### QAP-001: Every Capability has exactly one owner

One package owns one capability. No shared ownership.
If two packages provide "search", one of them shouldn't exist.

**Test**: Can you point to exactly ONE package.json that owns this capability?

---

### QAP-002: Every Identity has exactly one source

Identity comes from the Identity Layer. Period.
No app generates its own user IDs. No service maintains a parallel user table.

**Test**: `grep -r "createUser\|insertUser" .` returns results from exactly ONE place.

---

### QAP-003: Every Event is immutable

Once published, an event NEVER changes. You can publish a correction event,
but the original is permanent. No `UPDATE outbox_events`.

**Test**: No migration ever ALTERs an event table row. Only INSERT.

---

### QAP-004: Every Decision is explainable

If AI made a decision (routed a model, categorized an email, flagged content),
the system MUST be able to explain WHY after the fact.

**Test**: Every AI inference logs `{model, score, reason, alternatives_considered}`.

---

### QAP-005: Every AI Action is auditable

No AI action that crosses a trust boundary (sends, deletes, spends, deploys)
executes without an audit trail. Sensitive actions require human approval.

**Test**: `AgentActionAudit` table has a row for every sensitive action.

---

### QAP-006: Every Interface is replaceable

If you can't swap an implementation without changing consumers, the interface
is leaking. Consumers depend on contracts (types), never on implementations.

**Test**: Can you mock/stub any dependency in a unit test without special hacks?

---

### QAP-007: Every Dependency has a measurable cost

Adding a dependency (npm package, service call, database query) has a cost:
bundle size, latency, failure blast radius, cognitive load.

**Test**: PR adds a dep → PR body states the cost justification.

---

### QAP-008: Every Module must degrade gracefully

If Redis is down, rate-limiting falls back to in-memory. If AI provider is
down, circuit breaker engages. If search is down, emails still load.

**Test**: Kill any non-identity infrastructure → core flows still work (degraded, not broken).

---

### QAP-009: Every System must heal itself

Failed pods get reaped. Crashed services restart. Stale connections timeout.
No human should need to SSH in to fix a known failure mode.

**Test**: Inject a failure → system recovers within SLO without manual intervention.

---

### QAP-010: Complexity must only move downward

Higher layers are SIMPLER than lower layers. The Experience Layer is the simplest.
The Identity Layer absorbs the most complexity so apps don't have to.

**Test**: LOC and cyclomatic complexity decrease as you move UP the layer stack.

---

## The One Rule Above All

> **"If a feature increases complexity more than it increases capability, it does not belong in Quant."**

This is on every engineer's monitor. This is the final PR review question.

---

## Quant Complexity Index (QCI) — Future

Every PR will eventually compute:

```
QCI = w1·(deps_added) + w2·(cyclomatic_delta) + w3·(public_api_surface)
    + w4·(coupling_score) + w5·(cognitive_load) + w6·(runtime_cost_delta)
    + w7·(operational_cost_delta)
```

Rule: **QCI must decrease or stay flat over any rolling 4-week window.**

(Implementation of automated QCI scoring is Phase B work — not documentation.)

---

*Version: 1.0 | Date: 2026-07-07 | Signed: CEO + Principal Systems Engineer*
