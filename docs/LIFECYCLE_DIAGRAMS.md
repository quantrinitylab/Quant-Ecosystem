# Module Lifecycle Diagrams

> **CEO Order #0005.** Every module gets a lifecycle diagram: the exact chain a
> request/entity travels from identity to analytics. Same template, every module.
> Purpose: if you cannot draw the lifecycle, you do not understand the module.
>
> Template (canonical order — Identity always first, Analytics always last):
>
> ```
> User → Identity → JWT → Permission → <Domain Core> → Events → Realtime → Storage → Analytics
> ```

Layer references map to the Capability Architecture in `QUANT_FOUNDATION.md`.

---

## 1. QuantMail (`apps/quantmail`)

```
User
 ↓ (login / OAuth2)
Identity            @quant/auth — subject resolution (ADR-004: identity ≠ product)
 ↓
JWT                 access + refresh token pair
 ↓
Permission          RBAC: mailbox scope (read/send/admin)
 ↓
Mailbox             message CRUD → MIME build → smtp-inbound / send pipeline
 ↓
Events              email.sent / email.received → OutboxEvent (Law 3)
 ↓
Notification        @quant/notifications — push/digest fan-out
 ↓
Realtime            @quant/realtime — inbox live update via ws-gateway
 ↓
Storage             bodies → object storage; metadata → Postgres
 ↓
Analytics           delivery rate, open latency, spam score
```

## 2. QuantChat (`apps/quantchat`)

```
User → Identity → JWT → Permission (room membership)
 ↓
Conversation        message create → moderation check (@quant/moderation)
 ↓
Events              chat.message.sent → outbox
 ↓
Realtime            ws-gateway broadcast to room (Coordination layer core)
 ↓
Memory              media memories (Prisma Memory — separate domain from AI memory)
 ↓
Storage             attachments → @quant/storage; messages → Postgres
 ↓
Analytics           delivery latency, room activity
```

## 3. QuantAI (`apps/quantai` + `packages/ai`)

The most important lifecycle in the company — one inference:

```
User → Identity → JWT → Permission (AI scope + credit check @quant/credits)
 ↓
Safety (pre)        packages/ai/src/core/safety.ts — input policy
 ↓
MemoryFacade        mode: legacy | dual_write | shadow | new   (ADR-011)
 ↓
Recall              hybrid vector retrieval + RetrievalTrace   (ADR-007)
 ↓
Prompt Build        context-manager + prompt-registry
 ↓
Semantic Cache      hit → skip provider (cost §4, SYSTEM_MATHEMATICS)
 ↓
Model Router        routing-table.ts → provider-adapter (Law 6: model-agnostic)
 ↓
Provider            circuit-breaker + retry + provider-health
 ↓
Safety (post)       output policy + moderation
 ↓
Observe             extraction → acceptance policy (ADR-009) → memory store
 ↓
Cost Tracking       token-counter + cost-tracker + request-cost-logger
 ↓
Events → Analytics  inference.completed → eval harness / dashboards
```

## 4. QuantDrive (`apps/quantdrive`)

```
User → Identity → JWT → Permission (file ACL, share links)
 ↓
Upload              chunked → virus/moderation scan → dedupe (content hash)
 ↓
Storage             object storage + storage_class tier (hot/warm/cold)
 ↓
Index               metadata → Postgres; content → @quant/search
 ↓
Events              file.uploaded / file.shared → outbox
 ↓
Realtime            share notifications, collaborative presence
 ↓
Analytics           storage growth (SYSTEM_MATHEMATICS §3), access patterns
```

## 5. QuantSync (social graph) (`apps/quantsync`)

```
User → Identity → JWT → Permission (audience/visibility)
 ↓
Post                create → moderation → @quant/social-graph edges
 ↓
Events              post.created → outbox
 ↓
Fanout              queue → follower timelines (@quant/queue)
 ↓
Ranking             @quant/ranking + @quant/recommendations
 ↓
Realtime            live feed updates
 ↓
Storage → Analytics engagement metrics, graph growth
```

## 6. QuantUbe (video) (`apps/quantube`)

```
User → Identity → JWT → Permission (channel ownership)
 ↓
Upload              resumable → @quant/media transcode pipeline (queue workers)
 ↓
Storage             renditions → object storage → @quant/cdn
 ↓
Events              video.published → outbox
 ↓
Index + Ranking     search index, recommendation candidates
 ↓
Realtime            live premieres, comment streams
 ↓
Analytics           watch time, rendition costs
```

## 7. QuantMeet (`apps/quantmeet`)

```
User → Identity → JWT → Permission (meeting role: host/guest)
 ↓
Session             room allocation → @quant/webrtc SFU signalling
 ↓
Realtime            media planes + data channel (Nervous System)
 ↓
Events              meeting.started/ended → outbox
 ↓
AI                  transcription/summary via QuantAI lifecycle (§3)
 ↓
Storage → Analytics recordings, QoS metrics (jitter, packet loss)
```

## 8. QuantCalendar (`apps/quantcalendar`)

```
User → Identity → JWT → Permission (calendar ACL)
 ↓
Event CRUD          recurrence expansion → conflict detection
 ↓
Events              calendar.event.created → outbox
 ↓
Scheduler           reminders via @quant/queue delayed jobs (Circadian Rhythm)
 ↓
Notification → Realtime → Storage → Analytics
```

## 9. QuantDocs (`apps/quantdocs`)

```
User → Identity → JWT → Permission (doc ACL)
 ↓
Edit                CRDT/OT ops → @quant/sync-engine
 ↓
Realtime            co-editing presence broadcast
 ↓
Events              doc.updated (compacted) → outbox
 ↓
AI                  smart-compose via QuantAI lifecycle (§3)
 ↓
Storage → Analytics snapshots + op-log; edit analytics
```

## 10. QuantAds (`apps/quantads`)

```
Advertiser → Identity → JWT → Permission (account/campaign scope)
 ↓
Campaign            budget reservation → @quant/payments
 ↓
Targeting           @quant/privacy-ads (privacy-preserving cohorts) + Reasoning layer
 ↓
Serve               auction → impression → frequency cap (cache)
 ↓
Events              ad.impression / ad.click → outbox (high volume: batched)
 ↓
Storage → Analytics spend pacing, CTR, billing reconciliation
```

## 11. Memory Subsystem (`packages/ai` memory) — entity lifecycle

The lifecycle of a single **memory**, per ADR-009 state machine:

```
Utterance
 ↓ extraction        llm-extraction-model (schema frozen, ADR-010)
Candidate
 ↓ acceptance policy memory-acceptance-policy (confidence, negation, temporal)
Pending ──(confirm)──→ Active
 │                        ↓ (contradiction / newer fact)
 └──(reject)──→ Rejected  Superseded (history kept — Law 2)
                          ↓ (decay / archive)
                       Archived (cold storage; never physically deleted)
```

Every transition is an event; every recall carries a `RetrievalTrace`
(answering "why did this memory appear?").

## 12. Identity (`packages/auth`) — entity lifecycle

```
Signup
 ↓ create sub (immutable — Law 1)
Root Identity
 ↓ attach credentials (password / WebAuthn / OAuth)
Sessions            JWT issue → refresh → rotate
 ↓ attach attributes, org memberships (@quant/organizations)
Extended Identity
 ↓ (never fork, never duplicate; products attach to it — ADR-004)
Deactivation        soft (events mark disabled); sub still resolves forever
```

---

### Rules for adding a new module

1. Draw this diagram FIRST — before the first line of code.
2. Identity is always the first hop; Analytics always the last.
3. Every arrow that crosses a package boundary must be a protocol (Law 4).
4. If your diagram has no `Events` hop, you are doing CRUD — redesign (Law 3).

**Owner:** Kiro · **Approved by:** CEO · **Version:** 1.0 · **Date:** 2026-07-09
