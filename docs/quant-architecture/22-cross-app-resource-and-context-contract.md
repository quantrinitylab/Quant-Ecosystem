# 22 — Cross-App Resource Contract & Context Envelope

Status: Architecture V1.1 — EC-02.

EC-01 defines which product/capability exists. EC-02 defines how products safely refer to one another's resources and transfer minimum useful context without sharing databases.

## 1. Core laws
- The owning product remains source of truth.
- A resource reference never grants authorization.
- Consumers use opaque resource IDs and typed resource types.
- Cross-app context is purpose-bound and minimum-useful.
- Imported/derived objects preserve provenance.
- Timeouts produce UNKNOWN when business outcome is ambiguous.
- Every workflow preserves correlationId, causationId and eventId.
- Quanty uses capability contracts plus resource references, never raw database access.

## 2. QuantResourceRef

Canonical fields:
- appId: one of the nine canonical product IDs.
- resourceType: bounded product-owned type such as mail.thread, chat.conversation, gram.post, tube.video, cooks.project or ads.campaign.
- resourceId: opaque identifier.
- resourceVersion: optional optimistic/stale-state version.
- visibility: private | shared | public.
- canonicalUrl and deepLink.
- ownerUserId and tenantId as hints only.
- createdAt and updatedAt.

Unknown app/resource types fail closed. URLs, visibility, owner IDs and tenant IDs are never treated as authorization.

## 3. Product resource vocabulary
QuantMail: mail.thread, mail.message, mail.draft, mail.attachment.
QuantChat: chat.conversation, chat.message, chat.channel, chat.call, chat.meeting.
QuantAI: ai.session, ai.plan, ai.run, ai.artifact, ai.approval.
QuantGram: gram.profile, gram.post, gram.story, gram.reel, gram.comment.
QuantWave: wave.profile, wave.post, wave.reply, wave.community, wave.topic.
QuantMax: max.profile, max.discovery, max.match, max.safety-case.
QuanTube: tube.channel, tube.video, tube.playlist, tube.live, tube.comment.
QuantCooks: cooks.project, cooks.asset, cooks.timeline, cooks.render, cooks.template.
QuantAds: ads.campaign, ads.adset, ads.creative, ads.audience, ads.boost, ads.payout.

## 4. QuantContextEnvelope
Required fields:
- eventId
- schemaVersion
- correlationId
- optional causationId
- actor type: user | service | agent
- actor identity reference
- sourceApp and optional targetApp
- optional QuantResourceRef
- occurredAt
- optional tenantId
- purpose: user_action | notification | search | recommendation | agent_execution | analytics | memory
- typed payload

The envelope carries context, not unrestricted source data.

## 5. Context budget
Preferred transfer order:
1. Resource reference.
2. Small display metadata.
3. Explicit user-selected content.
4. Additional source fields requested through an authorized capability.

Never automatically transfer full private conversations, full mailbox history, private media, credentials, hidden model reasoning or unrestricted memory graphs.

## 6. Handoff modes
- OPEN: open canonical source.
- SHARE: create a destination-owned share representation.
- ATTACH: attach a source reference without copying source truth.
- IMPORT: explicitly copy data into a destination-owned object while preserving provenance.
- COMMAND: invoke an owning-product capability.
- NOTIFY: deliver an event-derived notification without transferring authority.

## 7. Deep links
Canonical conceptual routes:
quant://mail/thread/{id}
quant://chat/conversation/{id}
quant://ai/run/{id}
quant://gram/post/{id}
quant://wave/post/{id}
quant://max/match/{id}
quant://tube/video/{id}
quant://cooks/project/{id}
quant://ads/campaign/{id}

Destination flow: validate session → parse resource → validate tenant → authorize resource → compare version → load canonical source → render.

## 8. Provenance
Imported or derived objects retain:
- source QuantResourceRef
- operation: shared | attached | imported | derived
- sourceVersion
- importedAt
- actor
- correlationId

This answers where an object came from and what source relationship it has.

## 9. Deletion and revocation
When the source disappears:
resource.resolve → RESOURCE_DELETED → destination tombstone/stale state → derived projection invalidation → governed memory/source-reference revocation.

Imported copies follow their own retention policy but keep provenance. Cross-app references never prevent source deletion.

## 10. Authorization
Required sequence:
identity → tenant → product scope → resource access → capability → sensitivity policy → approval → execute.

Memory retrieval never grants resource access.

## 11. Distributed workflow state
PLANNED → WAITING_APPROVAL → EXECUTING → VERIFYING → COMPLETED / PARTIAL / FAILED / UNKNOWN / CANCELLED.

UNKNOWN is mandatory for ambiguous provider/dependency outcomes. Retry only the unresolved operation when possible; do not blindly repeat an entire workflow.

## 12. Canonical journeys
Mail → Calendar → Chat: resolve mail thread → prepare event → approve if required → create event → verify calendar event → prepare Chat notification → send → verify.

Tube → Chat → Calendar: resolve live reference → Chat share card → user requests reminder → Calendar reminder → Chat confirmation.

Cooks → Tube → Ads: render completed → Tube upload preparation → approval → publish → Ads boost quote → economy reservation → boost commit → verification.

Max → Chat → Calendar: match created → Chat conversation → Calendar event → QuantMeet room → invitation. Max owns match/safety; Chat owns conversation; Calendar/Meet own scheduling.

QuantAI multi-app request: resolve entities → prepare all product operations → approval → execute each owning command → verify each result → return per-resource outcomes.

## 13. Memory interaction
Cross-app events become memory candidates only through the governed memory pipeline.

Example: tube.video.watched → signal projector → bounded interest candidate → policy → candidate memory → consolidation.

Watching a video is evidence, not an automatic durable preference.

## 14. Recommendation interaction
source event → signal projector → privacy/policy filter → bounded feature → destination ranking engine.

Destination product owns final ranking. Cross-app signals cannot bypass privacy, consent, safety or product policy.

## 15. Economy interaction
Cross-app economic operations carry operationId, sourceApp, action, quoteId and reservationId.

Flow: quote → reserve → product operation → verify → commit/release.

If outcome is unknown, reservation remains reconcilable and no second charge is created.

## 16. Contract tests
Reference: valid app/type, unknown app/type, malformed ID, stale version.
Authorization: correct user, wrong user, wrong tenant, revoked session, insufficient scope.
Handoff: OPEN, SHARE, ATTACH, IMPORT, COMMAND, NOTIFY.
Failure: source outage, destination outage, timeout, deletion, permission revocation, duplicate event, duplicate command.
Tracing: correlationId, causationId, agentRunId and unique eventId.
UI states: loading, unavailable, forbidden, deleted, stale, success and retry.

## 17. Implementation work orders
EC-02.1 — Add the shared contract package without duplicating the existing app-registry catalog.
EC-02.2 — Define resource references, context envelopes, provenance, economy operation references, resource types, handoff modes, lifecycle states and typed errors.
EC-02.3 — Add validators for app/resource compatibility, versions, tenant boundaries and canonical links.
EC-02.4 — Add web/mobile/desktop deep-link adapters.
EC-02.5 — Add event-envelope adapters to the existing outbox/Kafka path.
EC-02.6 — Add contract tests for all handoff modes and failure cases.
EC-02.7 — Wire Quanty execution to capability + resource contracts rather than database access.

## 18. Definition of Done
- Every cross-app object has a stable typed reference.
- References resolve to canonical owners.
- Reference data never grants access.
- Context is minimum-useful and purpose-bound.
- Provenance survives import/derivation.
- Deletion/revocation semantics are explicit.
- Distributed workflows preserve correlation.
- Ambiguous outcomes remain UNKNOWN.
- Deep links work consistently across web/mobile/desktop.
- Event contracts are versioned.
- Contract tests cover authorization and failure.
- Quanty operates across products only through capability + resource contracts.

## Architectural Law
Pass references, not databases. Pass context, not entire lives. Pass capabilities, not unrestricted power.