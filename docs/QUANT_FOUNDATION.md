# Quant Foundation — The Laws

> This document sits ABOVE the Engineering Bible.
> The Bible is engineering. This is science.
> These are the immutable laws of the Quant organism.
> No code, no implementation — only universal truths that govern the system.
>
> Violation of any law requires a CEO-approved ADR with existential justification.

---

## The Quant Genome

**Five genes. Everything else is phenotype.**

```
Identity + Memory + Reasoning + Coordination + Trust
```

| Gene | Definition | Without it |
|------|-----------|------------|
| **Identity** | Who you are. Immutable, singular, unforgeable. | System has no subject. Actions have no author. |
| **Memory** | What happened. Append-only, never lost, always retrievable. | System has no context. Every interaction starts from zero. |
| **Reasoning** | Why decisions are made. Model-agnostic intelligence layer. | System is a dumb pipe. No adaptation, no learning. |
| **Coordination** | How entities work together. Protocol-first, not API-first. | System is a collection of silos. No emergent behavior. |
| **Trust** | Why entities believe each other. Cryptographic, verifiable. | System requires blind faith. No security, no delegation. |

---

## The Seven Laws

### Law 1 — Identity is Immutable

> Never duplicate identity. Never derive identity from a product.
> Identity exists before any app. Identity survives every app.

An identity is created once. It can be extended (attributes, credentials),
but the root subject (`sub`) never changes, never forks, never duplicates.

If QuantMail disappears tomorrow, every identity MUST still resolve.

### Law 2 — Memory is Append-First

> History should never disappear. State is derived from events.
> The past is immutable. The present is a projection.

Every state change is an event appended to a log. Current state is computed
from the event stream. Deletion = a new event marking something as deleted,
never physical removal of history (except legal compliance with explicit ADR).

### Law 3 — Everything is an Event

> Not CRUD. Events.
> `email.sent` is not `UPDATE emails SET status='sent'`.
> It is an immutable fact that happened at time T.

Systems communicate by publishing events, not by mutating shared state.
The outbox pattern (`OutboxEvent` model) exists to guarantee this.
Every significant state transition produces a domain event.

### Law 4 — Everything Communicates Through Protocols

> Never direct coupling. Always a contract.
> If module A needs module B, they agree on a protocol.
> Module B can be replaced without A knowing.

Protocols > APIs > SDKs > Direct imports.
Dependency direction: always toward the protocol definition, never toward
the implementation. This is why `@quant/common` holds types, not logic.

### Law 5 — Every Module Must Be Replaceable

> No module is sacred. Every module has a defined interface.
> If tomorrow we rewrite the AI engine in Rust, only the interface contract matters.

Test of replaceability: can you swap the implementation while keeping all
consumers unchanged? If no — the interface is leaking implementation details.

### Law 6 — Every AI Model is Temporary. Architecture is Permanent.

> Today's frontier model is tomorrow's commodity.
> Never optimize for a specific model. Optimize for the orchestration layer.
> The moat is routing + memory + evaluation, not the model itself.

Quant's AI value comes from:
- Knowing WHEN to invoke intelligence (routing)
- Knowing WHAT context to provide (memory)
- Knowing HOW WELL the output served the user (evaluation)
- NOT from which model generated the tokens

### Law 7 — Trust Before Intelligence

> A system that is intelligent but untrustworthy is dangerous.
> A system that is trustworthy but unintelligent is merely limited.
> Always choose trust over capability when they conflict.

Every AI action that crosses a trust boundary (sends email, merges code,
spends credits) MUST be auditable and MUST be approvable by a human
before execution. Intelligence is never a justification to bypass trust.

---

## Quant as a Living Organism

| Biological System | Quant Equivalent | Package(s) |
|-------------------|-----------------|------------|
| **DNA** | Identity | `@quant/auth`, `@quant/identity-permissions` |
| **Hippocampus** | Memory | `@quant/ai-memory`, `@quant/database` (events) |
| **Frontal Cortex** | Reasoning / AI | `@quant/ai`, `@quant/agent-runtime` |
| **Nervous System** | Realtime | `@quant/realtime`, `services/ws-gateway` |
| **Immune System** | Security | `@quant/security`, `@quant/moderation`, `@quant/encryption` |
| **Long-term Memory** | Storage | `@quant/storage`, `@quant/database` |
| **Working Memory** | Cache | Redis, `@quant/ai` SemanticCache |
| **Hormones** | Notifications | `@quant/notifications` |
| **Circadian Rhythm** | Scheduler | `@quant/queue` (BullMQ), CronJobs |
| **Blood Circulation** | Queue / Events | `@quant/queue`, `@quant/data-plane` (outbox) |
| **Skeleton** | Infrastructure | EKS, Terraform, Docker |
| **Skin** | API Gateway / Edge | Ingress, rate-limit, WAF |
| **Eyes / Ears** | Input | Voice, Camera, Keyboard, Touch |
| **Hands** | Action | Device control, email send, code deploy |
| **Heart** | Core Runtime | `@quant/server-core` (Fastify) |

---

## Capability Architecture (replaces app-centric thinking)

```
┌─────────────────────────────────────────────────────┐
│              EXPERIENCE LAYER                        │
│  (UI/UX — what users see and touch)                 │
│  QuantMail │ QuantChat │ QuantAI │ ...              │
├─────────────────────────────────────────────────────┤
│              ACTION LAYER                            │
│  (what the system DOES — send, deploy, create)      │
│  email.send │ code.deploy │ payment.charge          │
├─────────────────────────────────────────────────────┤
│              COORDINATION LAYER                      │
│  (how entities work together — events, queues)      │
│  EventBus │ Queue │ PubSub │ Protocols              │
├─────────────────────────────────────────────────────┤
│              REASONING LAYER                         │
│  (why decisions are made — AI, scoring, routing)    │
│  AIEngine │ ModelRouter │ Recommendations           │
├─────────────────────────────────────────────────────┤
│              KNOWLEDGE LAYER                         │
│  (what the system knows — search, embeddings, RAG)  │
│  Meilisearch │ pgvector │ Qdrant │ ContextManager   │
├─────────────────────────────────────────────────────┤
│              MEMORY LAYER                            │
│  (what happened — events, state, history)           │
│  PostgreSQL │ Redis │ OutboxEvent │ AuditLog        │
├─────────────────────────────────────────────────────┤
│              IDENTITY LAYER                          │
│  (who is who — auth, permissions, trust)            │
│  Auth │ JWT │ RBAC │ Encryption │ WebAuthn          │
└─────────────────────────────────────────────────────┘
```

**App-to-Layer Mapping:**

| App | Primary Layer | Secondary Layer |
|-----|--------------|-----------------|
| QuantMail | Experience + Action (email) | Identity (auth root today) |
| QuantDrive | Memory (file storage) | Action (share, upload) |
| QuantChat | Coordination (messaging) | Experience |
| QuantAI | Reasoning | Knowledge + Action |
| QuantSync | Coordination (social graph) | Experience |
| QuantTube | Memory (video) + Action (transcode) | Experience |
| QuantAds | Action (serve ads) + Reasoning (targeting) | Coordination |

**Key insight**: Apps are NOT the architecture. Apps are the SKIN.
The architecture is the layers. An app can be replaced; a layer cannot.

---

## Evolution Path

```
Phase 0 (Current): Apps with shared packages
Phase 1 (Next): Capability layers with app interfaces
Phase 2 (Future): Protocol-first with pluggable implementations
Phase 3 (Vision): Self-evolving organism with AI-driven architecture decisions
```

---

## Feedback Loops (Organism Health)

Every organism needs feedback to stay alive:

| Loop | Input | Processor | Output |
|------|-------|-----------|--------|
| **User feedback** | Actions, clicks, time-on-task | Analytics | UI/UX improvements |
| **AI feedback** | Inference quality, user corrections | Evaluation engine | Model routing updates |
| **Security feedback** | Failed auth, suspicious patterns | Immune system | Block/alert/adapt |
| **Performance feedback** | Latency, error rate, queue depth | Monitoring | Autoscale, circuit break |
| **Cost feedback** | Token spend, infra cost | Cost tracker | Budget enforcement, model swap |
| **Trust feedback** | User reports, moderation flags | Trust pipeline | Reputation, restrictions |

---

*This document is the Constitution. The Engineering Bible implements it.
ADRs record specific decisions within its constraints.
Code is the final, lowest-level expression of these laws.*

---

**Signed**: Kiro (Principal Systems Engineer)
**Approved by**: CEO
**Version**: 1.0
**Date**: 2026-07-07
