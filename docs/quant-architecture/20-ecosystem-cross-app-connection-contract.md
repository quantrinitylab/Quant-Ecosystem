# 20 — Quant Ecosystem Cross-App Connection Contract

Status: Architecture V1.1 — ecosystem backbone specification.

This document is the canonical contract for how the nine Quant products behave as one connected digital ecosystem while remaining independently owned products.

Products:
- QuantMail
- QuantChat
- QuantAI
- QuantGram
- QuantWave
- QuantMax
- QuanTube
- QuantCooks
- QuantAds

QuantTrinity is the economic control-plane, not a consumer product.

## 1. The Core Rule

Quant is not nine apps behind nine icons.

It is:

**one identity + one contact graph + one event fabric + one governed memory + one Quanty intelligence layer + one credit ledger + one notification fabric + nine independent product domains.**

A connection is complete only when the receiving product can:
1. authenticate the same user/session through governed identity;
2. resolve the source object through a typed cross-app reference;
3. authorize access against the source product's policy;
4. receive enough context to render the handoff without copying source-of-truth data;
5. optionally invoke a typed command in the source product;
6. emit an auditable event;
7. update relevant projections/memory only through governed pipelines;
8. degrade safely when the source product is unavailable.

A visual link between two screens is not an integration.

## 2. Ownership Law

Every product remains the source of truth for its own domain.

| Product | Owns |
|---|---|
| QuantMail | identity integration, mailboxes, messages, threads, labels |
| QuantChat | conversations, messages, channels, communities, presence, calls |
| QuantAI | AI sessions, agents, plans, runs, approvals, automations |
| QuantGram | profiles, follows, posts, stories, reactions, social feed |
| QuantWave | profiles, posts, replies, communities, trends, moderation |
| QuantMax | discovery, candidates, matches, preferences, safety state |
| QuanTube | channels, videos, playlists, live, watch state, creator media |
| QuantCooks | creative projects, assets, timelines, edits, renders, templates |
| QuantAds | campaigns, creatives, audiences, auctions, attribution, payouts |
| QuantTrinity | credit policy, pricing, allowance, commission/overage policy |

No receiving product writes another product's tables.

Cross-app state is a projection, reference, or event—not a second source of truth.

## 3. The Universal Cross-App Reference

Every product-facing object that may be opened from another app must expose a stable reference:

```ts
type QuantResourceRef = {
  resourceId: string;
  appId:
    | "quantmail" | "quantchat" | "quantai"
    | "quantgram" | "quantwave" | "quantmax"
    | "quantube" | "quantcooks" | "quantads";
  resourceType: string;
  resourceVersion?: number;
  tenantId?: string;
  ownerUserId?: string;
  visibility: "private" | "shared" | "public";
  canonicalUrl: string;
  deepLink: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:
- resourceId is opaque; consumers never infer database structure.
- canonicalUrl resolves to the owning product.
- deepLink may open native/web/desktop depending on capability.
- version is used for optimistic rendering and stale-link detection.
- ownerUserId/tenantId are authorization hints, never authorization itself.
- visibility is descriptive; the source product performs final authorization.

## 4. Cross-App Context Envelope

All asynchronous ecosystem events and synchronous handoffs use the same conceptual envelope.

```ts
type QuantContextEnvelope<T> = {
  eventId: string;
  schemaVersion: 1;
  correlationId: string;
  causationId?: string;
  actor: {
    userId?: string;
    serviceId?: string;
    agentRunId?: string;
  };
  sourceApp: string;
  targetApp?: string;
  resource?: QuantResourceRef;
  occurredAt: string;
  tenantId?: string;
  purpose:
    | "user_action"
    | "notification"
    | "search"
    | "recommendation"
    | "agent_execution"
    | "analytics"
    | "memory";
  payload: T;
};
```

Consumers must treat event delivery as at-least-once.

Every consumer must be idempotent by eventId + handler version.

## 5. The Nine-App Connection Graph

### 5.1 QuantMail ↔ QuantChat

Primary journeys:
- email participant → open chat;
- thread → start group conversation;
- compose → share to chat;
- chat → email a transcript/attachment;
- meeting confirmation → chat notification;
- security/account events → high-priority Chat notification.

Ownership:
- Mail owns email.
- Chat owns chat.
- Contacts/identity remain canonical through Mail identity infrastructure where applicable.

Typed commands:
- chat.createConversation
- chat.sendMessage
- mail.createDraft
- mail.prepareSend

Quanty may prepare either side, but side-effecting send requires the owning product's policy/approval.

### 5.2 QuantMail ↔ QuantAI

Primary journeys:
- summarize thread;
- extract action items;
- draft reply;
- turn email into calendar event;
- find related Drive/Git objects;
- launch an agent run from a message.

QuantAI never becomes the source of truth for mail.

Agent access is capability-scoped:
- mail.read
- mail.search
- mail.draft.prepare
- mail.send.prepare
- mail.send.execute (approval-gated)

### 5.3 QuantMail ↔ QuantGram

Primary journeys:
- share an email/file/link into a post;
- creator/contact identity resolution;
- notifications about published shared content;
- universal search.

Mail supplies a reference, not copied post state.

QuantGram owns:
- post,
- media,
- reactions,
- comments,
- feed ranking.

### 5.4 QuantMail ↔ QuantWave

Primary journeys:
- share an email into a Wave post;
- send a post/link by email;
- email a community/group reference;
- surface relevant Wave content from universal search.

Wave ranking remains Wave-owned.

### 5.5 QuantMail ↔ QuantMax

Primary journeys:
- contact → discovery context;
- match → open Chat;
- match → schedule Calendar/Meet;
- safety report → Max safety domain.

QuantMax never reads raw mailbox tables.

### 5.6 QuantMail ↔ QuanTube

Primary journeys:
- email a video;
- save/share a video reference;
- creator/channel identity;
- calendar event from a live stream;
- Quanty summarization of a video.

Tube owns watch state, video metadata and creator state.

### 5.7 QuantMail ↔ QuantCooks

Primary journeys:
- email creative/project;
- attach exported render;
- save incoming media to a Cooks project;
- send review request;
- convert email assets into an editing workspace.

Cooks owns project/timeline/render truth.

### 5.8 QuantMail ↔ QuantAds

Primary journeys:
- advertiser account notifications;
- invoices/receipts;
- campaign approvals;
- payout statements;
- budget alerts.

Ads owns campaign and auction state; QuantTrinity owns economic ledger semantics.

### 5.9 QuantChat ↔ QuantAI

Primary journeys:
- @Quanty in thread;
- summarize conversation;
- execute a permitted action;
- agent-run status;
- agent completion/failure notification;
- voice command → agent run.

Chat owns conversation delivery; AI owns agent execution.

### 5.10 QuantChat ↔ QuantGram

Primary journeys:
- share post/reel to chat;
- DM creator;
- group discussion around a post;
- story/reel share;
- social notification delivery.

### 5.11 QuantChat ↔ QuantWave

Primary journeys:
- share Wave post to chat;
- community → chat channel;
- live event → chat room;
- trend discussion;
- moderation escalation.

### 5.12 QuantChat ↔ QuantMax

Primary journeys:
- match → conversation;
- safety incident → report;
- date/meetup → Calendar/QuantMeet;
- voice/video escalation.

A Max safety decision remains Max-owned even if Chat displays it.

### 5.13 QuantChat ↔ QuanTube

Primary journeys:
- send video/live references;
- watch-party invitation;
- live stream → chat room;
- creator broadcast notifications.

### 5.14 QuantChat ↔ QuantCooks

Primary journeys:
- collaborative project chat;
- review comments → chat;
- render completion → chat notification;
- creator collaboration invitation.

### 5.15 QuantChat ↔ QuantAds

Primary journeys:
- campaign budget alerts;
- creator payout notices;
- boost confirmation;
- ad-review decisions;
- game invites and economy events.

Chat is the notification/communication surface, not the economic authority.

### 5.16 QuantAI ↔ QuantGram

AI capabilities:
- caption drafting;
- content understanding;
- feed explanation;
- post ideation;
- creator analytics;
- moderation assistance.

Gram owns publish/reaction/feed state.

### 5.17 QuantAI ↔ QuantWave

AI capabilities:
- trend analysis;
- post drafting;
- community summaries;
- moderation assistance;
- recommendation explanation.

Wave owns ranking and moderation policy.

### 5.18 QuantAI ↔ QuantMax

AI capabilities:
- discovery explanation;
- profile assistance;
- conversation preparation;
- safety assistance.

AI cannot silently override matching/safety policy.

### 5.19 QuantAI ↔ QuanTube

AI capabilities:
- video summarization;
- chapters;
- title/description generation;
- creator analytics;
- clip selection;
- accessibility captions.

Tube owns publish and monetization state.

### 5.20 QuantAI ↔ QuantCooks

AI capabilities:
- script/storyboard;
- asset search;
- timeline planning;
- edit suggestions;
- generation orchestration;
- render QA.

Cooks owns project and render state.

### 5.21 QuantAI ↔ QuantAds

AI capabilities:
- campaign analysis;
- creative variants;
- budget suggestions;
- audience explanations;
- anomaly detection.

AI may prepare a budget change but cannot silently commit financial side effects.

## 6. QuantChat Is the Notification Spine, Not the Global Owner

Operational notifications can be delivered through QuantChat:
- agent completed/failed;
- campaign budget threshold;
- creator payout;
- new match;
- live stream starting;
- render completed;
- CI result;
- security alert.

The notification record is a shared platform primitive, while:
- the source app owns event meaning;
- QuantChat owns message delivery/presentation;
- the user can configure notification preferences;
- security-critical notifications cannot be silently downgraded by product UX.

## 7. QuantAI Is the Intent Router, Not the Domain Owner

A request such as:

> "Sam ko mail karo, calendar mein 5 baje meeting banao aur Chat pe remind karna."

must become a typed plan:

```text
Intent
  -> resolve Sam through Contacts/identity
  -> Calendar.prepareEvent
  -> Mail.prepareDraft
  -> Chat.prepareReminder
  -> policy/approval
  -> execute owning commands
  -> verify each result
  -> emit events
  -> deliver summary through Chat
```

Partial failure is explicit:

```text
Calendar: verified
Mail: queued
Chat reminder: failed
```

Never report the whole plan as successful because one command succeeded.

## 8. QuantDrive Memory Connection

QuantDrive Memory is the governed derived context substrate.

Examples of eligible signals:
- user explicitly says a preference;
- user repeatedly interacts with a creator;
- user saves a recipe;
- user stars a repository;
- user attends an event;
- user repeatedly communicates with a person.

Memory does not replace source truth.

Authority ordering:
1. current canonical source;
2. explicit user-confirmed memory;
3. attributable derived memory;
4. model-derived inference;
5. weak behavioral signal.

Sensitive or temporary signals must not become durable memory merely because they appeared in a feed or conversation.

Memory retrieval:
- authorization first;
- purpose first;
- minimum useful context;
- live source check;
- provenance attached;
- source access never granted by memory retrieval.

## 9. Universal Search Connection

Universal Search fans out to product-owned search adapters:

```text
Query
  -> authorization context
  -> Mail adapter
  -> Chat adapter
  -> AI adapter
  -> Gram adapter
  -> Wave adapter
  -> Max adapter
  -> Tube adapter
  -> Cooks adapter
  -> Ads adapter
  -> normalize
  -> permission filter
  -> rank
  -> group by source
  -> return references
```

Search indexes are disposable projections.

A search hit must link back to the canonical product object.

## 10. Recommendation / Feed Connection

Cross-app signals may contribute to personalization, but no app may directly rewrite another app's ranking model.

Example:

A user watches three QuantWave posts about cooking.

Allowed:
- emit wave.post.viewed.v1;
- memory/interest pipeline derives a bounded interest signal;
- QuantCooks may request an approved recommendation context;
- QuantAds may use an approved contextual signal if consent/policy allows.

Forbidden:
- Wave directly writes a QuantCooks recommendation;
- Ads directly reads private Wave tables;
- Quanty treats an inferred interest as an explicit preference.

Each product remains responsible for its final ranking.

## 11. Credits / Economy Connection

All nine products use the shared Quant Credits ledger.

The economic flow is:

```text
Product intent
 -> quote
 -> reserve
 -> product operation
 -> verified result
 -> commit or release
 -> immutable ledger event
```

Examples:
- QuantGram boost;
- QuantChat premium sticker/lens;
- QuantMax premium feature;
- QuanTube creator purchase;
- QuantCooks generation/render;
- QuantAds campaign spend;
- QuantAI model/tool usage.

QuantTrinity owns economic policy and ledger semantics.

Products own why a transaction happened.

No product may:
- mint arbitrary credits;
- edit historical ledger rows;
- infer cash-out eligibility;
- treat provider success as settlement without reconciliation.

## 12. Deep-Link Contract

Every cross-app CTA uses a typed deep link.

Examples:

```text
quant://mail/thread/{id}
quant://chat/conversation/{id}
quant://ai/run/{id}
quant://gram/post/{id}
quant://wave/post/{id}
quant://max/match/{id}
quant://tube/video/{id}
quant://cooks/project/{id}
quant://ads/campaign/{id}
```

Web equivalents may use HTTPS canonical URLs.

The destination:
1. validates session;
2. resolves resource;
3. checks authorization;
4. loads source state;
5. renders stale/deleted/forbidden/unavailable states honestly.

Never trust parameters embedded in a deep link as authorization.

## 13. Failure Isolation

A connected ecosystem must not become a distributed monolith.

Rules:
- QuantChat outage must not corrupt QuantMail.
- QuantAds outage must not prevent reading a published Gram post.
- QuantAI outage must not block normal messaging.
- QuantDrive Memory outage must not block canonical source access.
- Recommendation outage falls back to deterministic/default ranking.
- Notification outage queues/retries without changing source state.
- Search outage never becomes source-of-truth failure.
- Credit service uncertainty means UNKNOWN, not success or failure by assumption.

Every product defines degraded modes in its own reliability spec.

## 14. Security Boundary

Cross-app calls require:
- authenticated principal;
- audience-bound token;
- product scope;
- resource authorization;
- tenant boundary;
- purpose;
- correlation ID;
- audit record for side effects.

Services must not accept:
- arbitrary userId from another product as proof of identity;
- raw database IDs without resource ownership checks;
- memory retrieval as authorization;
- Quanty instructions embedded inside untrusted source content.

Prompt injection is treated as data-origin risk.

## 15. Cross-App Event Families

Minimum ecosystem event families:

### Identity
- identity.session.created.v1
- identity.session.revoked.v1
- identity.profile.updated.v1
- identity.consent.updated.v1

### Communication
- chat.message.created.v1
- chat.message.delivered.v1
- chat.call.started.v1
- mail.message.sent.v1
- mail.thread.updated.v1

### Social
- gram.post.published.v1
- gram.post.engaged.v1
- wave.post.published.v1
- wave.post.engaged.v1
- max.match.created.v1

### Media
- tube.video.published.v1
- tube.video.watched.v1
- tube.live.started.v1
- cooks.project.updated.v1
- cooks.render.completed.v1

### AI
- ai.run.created.v1
- ai.run.completed.v1
- ai.run.failed.v1
- ai.approval.requested.v1

### Economy
- economy.quote.created.v1
- economy.reservation.created.v1
- economy.charge.committed.v1
- economy.reservation.released.v1
- economy.payout.created.v1

### Advertising
- ads.campaign.created.v1
- ads.impression.recorded.v1
- ads.conversion.recorded.v1
- ads.budget.threshold.v1

### Memory
- memory.candidate.created.v1
- memory.confirmed.v1
- memory.corrected.v1
- memory.forgotten.v1
- memory.source.revoked.v1

## 16. Cross-App Contract Tests

The ecosystem must maintain contract tests for at least these journeys:

1. Mail → Chat share.
2. Chat → Mail draft.
3. Mail → Calendar event.
4. Mail → Drive attachment reference.
5. Chat → QuantMeet call.
6. Chat → Gram/Wave share.
7. Match → Chat → Calendar.
8. Tube → Chat watch-party.
9. Cooks render → Chat notification.
10. Ads boost → economy reservation → verified commit.
11. QuantAI multi-product plan with partial failure.
12. Memory retrieval with source authorization.
13. Universal search with permission filtering.
14. Cross-app logout/session revocation.
15. Cross-app deep link to deleted/private resource.
16. Cross-app operation during one dependency outage.

A contract test is incomplete until it validates:
- auth;
- source ownership;
- success;
- failure;
- retry/idempotency;
- audit/event emission;
- UI loading/empty/error state.

## 17. First Implementation Work Orders

### EC-01 — Canonical App Capability Registry
Define, for each product:
- owned resources;
- readable resources exposed cross-app;
- commands exposed cross-app;
- event families;
- required scopes;
- deep links;
- degraded modes.

### EC-02 — Cross-App Resource Reference Package
Create a shared typed contract package for QuantResourceRef and context envelopes.

### EC-03 — Cross-App Event Catalog
Create versioned event schemas and producer/consumer ownership.

### EC-04 — Universal Deep-Link Resolver
One resolver contract across web/mobile/desktop with authorization before render.

### EC-05 — QuantAI Action Bridge
Expose typed product commands to Quanty without giving Quanty direct database access.

### EC-06 — Notification Bridge
Source apps emit typed notification intents; QuantChat renders/delivers them.

### EC-07 — Memory Context Bridge
Products publish governed signals; QuantDrive Memory handles extraction, policy, retrieval and forgetting.

### EC-08 — Economy Operation Bridge
Products use quote/reserve/commit/release; QuantTrinity owns ledger truth.

### EC-09 — Cross-App Contract Test Harness
Automate the journeys in section 16.

### EC-10 — Ecosystem Degraded-Mode Matrix
Record dependency, timeout, retry, fallback, user-visible state and recovery for every cross-app connection.

## 18. Definition of Done

The ecosystem connection layer is not complete when all links exist.

It is complete when:

- every app has explicit ownership;
- every shared capability has a versioned contract;
- every cross-app command has scope + approval semantics;
- every event is versioned and idempotent;
- every resource has canonical deep-link resolution;
- Quanty uses typed tools instead of database access;
- memory is governed and provenance-aware;
- search/recommendation remain projections;
- credits use the authoritative ledger;
- notifications preserve source ownership;
- dependency failures are isolated;
- contract tests cover happy path and failure path;
- web/mobile/desktop resolve the same resource consistently;
- admin/audit evidence exists for side effects;
- no mock/fallback data is presented as live state.

## 19. Architectural Law

**Connect everything. Own nothing twice.**

The ecosystem should feel like one operating system to the user while remaining nine independently accountable products to the engineer.

That is the Quant super-app architecture.
