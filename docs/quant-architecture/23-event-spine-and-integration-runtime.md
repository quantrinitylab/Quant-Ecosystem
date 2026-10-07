# 23 — Event Spine & Cross-App Integration Runtime

Status: Architecture V1.1 — EC-03.

## 1. Current implementation finding
The repository already has a real outbox and relay path:
- packages/data-plane/src/outbox.ts writes outbox rows inside the caller transaction.
- services/cdc-relay/src/outbox-poller.ts claims rows with FOR UPDATE SKIP LOCKED.
- services/cdc-relay/src/kafka-transport.ts publishes grouped events.
- services/cdc-relay/src/redis-transport.ts provides a replaceable staging transport.
- services/signal-projector consumes the published event stream.

The relay is correctly designed around at-least-once publication and aggregate-key ordering. Current evidence also shows a contract gap: the wire EventEnvelope contains eventId, aggregate, type, time and payload, but not the full cross-app context required by EC-02. This document closes that gap before more product integrations are added.

## 2. Runtime laws
1. Database state and its outgoing event are committed atomically through the transactional outbox.
2. Publication is at-least-once.
3. Consumers are idempotent.
4. Event history is immutable; corrections use compensating events.
5. Ordering is guaranteed only within the chosen aggregate key/partition.
6. Consumers must tolerate duplicates, delay and replay.
7. A broker acknowledgement is not proof that an external side effect completed.
8. Every externally visible side effect has a verification event or reconciliation path.
9. Product domains own source truth; projections are rebuildable.
10. Event contracts are versioned and validated before consumption.

## 3. Canonical event envelope
Target envelope:

eventId — globally unique event instance.
schemaVersion — version of the event contract.
eventType — immutable semantic fact name.
sourceApp — canonical emitting product.
resource — optional QuantResourceRef.
aggregateType / aggregateId — ordering and domain identity.
occurredAt — source-domain occurrence time.
publishedAt — broker publication time when known.
correlationId — user intent/workflow.
causationId — immediate causal event.
actor — user/service/agent reference.
tenantId — tenant boundary.
purpose — user_action / notification / search / recommendation / agent_execution / analytics / memory.
payload — versioned typed payload.
traceId — distributed tracing correlation.

The existing OutboxRecord should remain storage-facing; EventEnvelope is the wire contract. Do not make consumers reach into the outbox database.

## 4. Event naming
Use product-owned, past-tense facts:
- mail.thread.created.v1
- chat.message.sent.v1
- gram.post.published.v1
- wave.post.published.v1
- max.match.created.v1
- tube.video.published.v1
- cooks.render.completed.v1
- ads.campaign.published.v1
- ai.run.completed.v1.

Commands are not events. A request such as mail.send.execute is a capability/command. The resulting mail.message.sent.v1 is the fact.

## 5. Topic and stream strategy
Logical event routing is based on ownership and aggregate key.
Recommended production topology:
- product domain streams for high-volume product events;
- shared low-volume governance streams for audit/security/economy;
- dedicated sensitive streams for restricted data;
- dead-letter streams per consumer family, not one global garbage topic.

The existing streamFor(aggregateType) implementation is a valid Phase-0 transport mechanism, but product-scale deployment must avoid unbounded topic proliferation from arbitrary aggregateType values. Topic names become governed infrastructure contracts.

## 6. Partitioning and ordering
Kafka key = aggregateId by default.

This guarantees ordering for one aggregate within one partition, not global ordering.

Consumers must use version/sequence fields when business ordering matters. If two independent aggregates interact, causation/correlation expresses relationship; it does not imply total ordering.

## 7. Outbox lifecycle
NEW → CLAIMED → PUBLISHED → ACKNOWLEDGED.

If publication fails before acknowledgement:
CLAIMED → rollback → NEW.

If publication succeeds but the process dies before marking the row:
broker contains the event → outbox remains NEW → event is published again → consumer deduplicates by eventId.

This is intentional. Never change this to at-most-once just to hide duplicates.

## 8. Consumer inbox
Every stateful consumer that creates durable effects must have an inbox/processed-event record keyed by consumer identity + eventId.

Consumer transaction:
1. begin database transaction;
2. insert eventId into inbox with unique constraint;
3. if duplicate, no-op and acknowledge;
4. validate schema and policy;
5. apply projection/domain update;
6. write outgoing outbox events in the same transaction;
7. commit;
8. acknowledge broker offset.

Keep inbox retention at least as long as the supported replay horizon.

## 9. Retry and dead-letter policy
Classify failures:
- transient dependency failure → exponential retry with jitter;
- schema/version failure → quarantine immediately;
- authorization/policy failure → quarantine and audit;
- malformed event → dead-letter;
- deterministic business rejection → record rejection event, do not retry forever;
- external side-effect ambiguity → UNKNOWN + reconciliation.

Retries must have bounded attempts and a visible reason.

Dead-letter records retain original eventId, source, consumer, error class, first-seen time, attempt count and trace/correlation identifiers.

## 10. Replay
Replay is a first-class capability.

Required controls:
- replay by event ID;
- replay by aggregate;
- replay by time window;
- replay into a new consumer version;
- dry-run validation;
- rate limiting;
- authorization;
- audit record;
- idempotent consumers.

Never replay destructive commands from an event log. Replay facts into projections. Re-executing a historical side effect requires a new explicit command.

## 11. Schema evolution
Compatibility policy:
- additive optional fields are preferred;
- required fields require a new major schema version;
- removed/renamed fields require a migration window;
- consumers must declare supported versions;
- producers publish only registered versions.

Every event contract gets schema ownership, compatibility mode and deprecation date.

Unknown future fields must be ignored by compatible consumers; unknown event types must not be guessed.

## 12. Cross-app verification
An event saying 'command accepted' is not necessarily proof of business completion.

Example:
mail.send.execute → provider accepted → mail.message.sent.v1 only after the product's own delivery semantics say the message was durably accepted/sent.

For external systems:
command → idempotency key → provider call → provider result → reconciliation/verification event.

Payments, ads spend, publishing and other financial/external effects require reconciliation jobs.

## 13. Sagas and compensation
Use orchestration only when a user intent spans multiple owning products and partial completion matters.

Example:
Tube publish → Ads boost → Chat announcement.

If Ads fails after Tube succeeds:
- Tube remains completed;
- Ads operation becomes failed/unknown;
- Chat must not falsely announce a successful boost;
- user receives per-step status;
- retry starts at Ads, not Tube.

Compensating actions are explicit product capabilities, never implicit database rollback across services.

## 14. Signal projector boundary
The signal projector is a derived consumer.

It may transform approved event facts into bounded recommendation signals.
It must not become a second source of truth.
It must skip unknown/unusable events safely.
It must preserve eventId and occurredAt for provenance.
It must apply privacy/policy filtering before signals enter ranking.

Current repository behavior already demonstrates this selective principle: unknown interest events are skipped instead of guessed.

## 15. Quanty integration
Quanty receives events through governed projections and typed capabilities.

Quanty may:
- observe approved lifecycle events;
- correlate events within an authorized workflow;
- retrieve source resources through capabilities;
- prepare commands;
- execute approved commands;
- verify resulting facts.

Quanty may not:
- subscribe to unrestricted raw private streams;
- infer authorization from an event;
- mutate another product's database;
- treat a recommendation signal as canonical user preference;
- treat a command-accepted event as completed side effect.

## 16. Notifications
QuantChat is the notification spine, but notification ownership remains explicit.

Product event → notification policy → user preference check → Chat notification command → Chat delivery events.

Do not publish directly into Chat tables from another product.

Urgency, digest rules, quiet hours, channel selection and delivery state remain Chat/notification-domain concerns.

## 17. Memory
Memory consumes governed events through a separate projection path:
event → policy filter → candidate extraction → provenance → consolidation → memory record.

Events remain immutable evidence. Memory is a derived interpretation.

Deleting a source resource must invalidate dependent memory/projection references according to the memory lifecycle contract.

## 18. Observability
Every event metric must include:
- sourceApp;
- eventType;
- consumer;
- schemaVersion;
- result;
- latency;
- retryCount;
- correlationId/traceId.

Core SLO signals:
- outbox age;
- unpublished event count;
- relay throughput;
- broker publish failures;
- consumer lag;
- inbox duplicate rate;
- dead-letter rate;
- replay volume;
- verification latency;
- UNKNOWN operation count.

Alerts should detect sustained degradation, not a single duplicate.

## 19. Security
Events are data, not authorization tokens.

Sensitive payloads should be reference-only when possible.
Secrets never enter events.
Tenant isolation is enforced by consumers.
Restricted events use separate access policy and encryption.
Audit events are append-only and access-controlled.

## 20. EC-03 implementation work orders
EC-03.1 — Introduce the canonical wire envelope in the shared contract package, reusing EC-02 resource/context types.
EC-03.2 — Extend cdc-relay transport serialization to include sourceApp, schemaVersion, correlationId, causationId, actor, tenant and purpose.
EC-03.3 — Add event schema registry metadata and compatibility validation.
EC-03.4 — Add consumer inbox/processed-event contract and shared idempotency utilities.
EC-03.5 — Add retry/DLQ classification and operational metadata.
EC-03.6 — Add replay controls and audit contracts.
EC-03.7 — Add cross-app verification/reconciliation contract for external side effects.
EC-03.8 — Add contract tests for duplicate, out-of-order, replay, timeout, malformed and future-version events.
EC-03.9 — Update signal-projector input contract to consume the canonical envelope.

## 21. Definition of Done
- Wire events carry the full EC-02 context.
- Outbox remains atomic with source state.
- At-least-once publication is explicit.
- Stateful consumers are idempotent.
- Event schemas are versioned.
- Retries and DLQs are classified.
- Replay is safe and auditable.
- Cross-app commands have verification semantics.
- External side effects have reconciliation.
- Quanty consumes governed projections/capabilities.
- Notification and memory paths preserve product ownership.
- Metrics expose end-to-end event health.

## Architectural Law
Events are immutable facts, not shared databases. Commands ask owners to act. Verification proves what actually happened.