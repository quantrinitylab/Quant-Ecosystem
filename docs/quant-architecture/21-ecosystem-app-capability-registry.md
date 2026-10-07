# 21 — Ecosystem App Capability Registry

Status: Architecture V1.1 — EC-01.

The App Capability Registry is the machine-readable contract between the Quant platform and the nine products.

It answers: for this user, tenant, product and action, what capability exists, who owns it, what permission is required, what resource does it operate on, what event proves the result, and what happens if the dependency is unavailable?

## 1. Design Laws

1. Product ownership is explicit.
2. Capabilities are versioned.
3. Commands are typed.
4. Reads and side effects are separate.
5. Quanty receives capabilities, never database access.
6. Every capability declares required scopes and risk tier.
7. Every capability declares source-of-truth ownership.
8. Every side effect declares its success event and verification rule.
9. Every capability declares degraded behavior.
10. Unknown capability/version fails closed.
11. Registry metadata is not authorization; runtime authorization remains mandatory.
12. Removing a capability must be possible without deleting the owning product.

## 2. Registry Shape

Canonical TypeScript contract:

~~~ts
export type QuantAppId =
  | "quantmail" | "quantchat" | "quantai"
  | "quantgram" | "quantwave" | "quantmax"
  | "quantube" | "quantcooks" | "quantads";

export type CapabilityKind = "query" | "command" | "event" | "projection";
export type RiskTier = 0 | 1 | 2 | 3 | 4;

export type Capability = {
  capabilityId: string;
  version: number;
  appId: QuantAppId;
  domain: string;
  kind: CapabilityKind;
  owner: { appId: QuantAppId; sourceOfTruth: string };
  resourceTypes: string[];
  inputSchema: string;
  outputSchema: string;
  requiredScopes: string[];
  riskTier: RiskTier;
  idempotency: { required: boolean; keyStrategy?: string };
  approval: { required: boolean; reason?: string };
  verification: {
    required: boolean;
    successEvents: string[];
    timeoutState: "unknown" | "failed";
  };
  cost?: { meter?: string; quoteRequired: boolean };
  emits: string[];
  consumes?: string[];
  deepLinks?: string[];
  degradedMode: {
    mode: "fail_closed" | "read_cache" | "queue" | "partial";
    userState: string;
  };
  status: "active" | "preview" | "deprecated" | "disabled";
};
~~~

## 3. Risk Semantics

Tier 0 — read-only.

Tier 1 — draft or reversible preparation.

Tier 2 — low-risk reversible action.

Tier 3 — external side effect; confirmation by default unless a durable user policy explicitly authorizes it.

Tier 4 — destructive, administrative or financial; confirmation plus step-up authentication where policy requires it.

Examples:
- Tier 0: mail.thread.get, tube.video.get, gram.post.get
- Tier 1: mail.draft.prepare, calendar.event.prepare, ads.campaign.draft
- Tier 2: chat.message.edit, gram.post.archive
- Tier 3: mail.send, chat.message.send, gram.post.publish, tube.video.publish
- Tier 4: ads.campaign.spend.commit, economy.payout.execute, security.revoke_all

## 4. Canonical Product Capability Catalog

### QuantMail
~~~text
mail.thread.get
mail.thread.search
mail.draft.create
mail.draft.update
mail.draft.prepare
mail.send.prepare
mail.send.execute
mail.thread.archive
mail.thread.restore
mail.attachment.reference
mail.security.report
~~~

Source of truth: mailbox/thread/message domain.

### QuantChat
~~~text
chat.conversation.get
chat.conversation.create
chat.message.get
chat.message.prepare
chat.message.send
chat.message.edit
chat.message.delete
chat.call.prepare
chat.call.start
chat.notification.deliver
chat.report.create
~~~

Source of truth: conversations/messages/calls.

### QuantAI
~~~text
ai.session.create
ai.session.message
ai.plan.create
ai.run.prepare
ai.run.execute
ai.run.cancel
ai.approval.create
ai.artifact.get
ai.memory.context.request
ai.model.route
~~~

QuantAI owns orchestration, not the source data manipulated by an agent.

### QuantGram
~~~text
gram.profile.get
gram.post.get
gram.post.create
gram.post.prepare
gram.post.publish
gram.post.edit
gram.post.archive
gram.share.prepare
gram.feed.get
gram.feed.explain
gram.report.create
~~~

### QuantWave
~~~text
wave.profile.get
wave.post.get
wave.post.create
wave.post.publish
wave.post.edit
wave.post.archive
wave.community.get
wave.share.prepare
wave.feed.get
wave.trend.get
wave.report.create
~~~

### QuantMax
~~~text
max.profile.get
max.discovery.get
max.preference.update
max.match.get
max.match.create
max.match.report
max.safety.report
max.call.prepare
~~~

Matching and safety remain Max-owned decisions.

### QuanTube
~~~text
tube.video.get
tube.video.search
tube.video.watch
tube.playlist.create
tube.playlist.update
tube.video.upload.prepare
tube.video.publish
tube.live.prepare
tube.live.start
tube.share.prepare
tube.report.create
~~~

### QuantCooks
~~~text
cooks.project.get
cooks.project.create
cooks.asset.import.prepare
cooks.timeline.update
cooks.edit.prepare
cooks.render.prepare
cooks.render.start
cooks.render.cancel
cooks.publish.prepare
cooks.publish.execute
~~~

### QuantAds
~~~text
ads.campaign.get
ads.campaign.create
ads.campaign.draft
ads.campaign.update
ads.audience.estimate
ads.creative.prepare
ads.auction.preview
ads.boost.quote
ads.boost.reserve
ads.boost.commit
ads.payout.get
ads.report.get
~~~

Financial execution is always linked to the authoritative economy contract.

## 5. Shared Platform Capabilities

~~~text
identity.session.get
identity.session.revoke
identity.consent.get
identity.consent.update
resource.resolve
resource.deep_link.resolve
search.universal.query
notification.create
notification.dismiss
notification.preference.update
memory.context.request
memory.feedback
memory.correct.prepare
memory.forget.prepare
economy.quote
economy.reserve
economy.commit
economy.release
audit.record
feature_flag.evaluate
~~~

Shared primitives must never quietly absorb product business rules.

## 6. Capability Invocation Contract

Every runtime invocation follows:

~~~text
resolve capability
 -> validate version
 -> validate caller
 -> validate audience
 -> validate tenant
 -> validate scope
 -> validate resource ownership
 -> validate input schema
 -> policy/risk evaluation
 -> approval if required
 -> idempotency check
 -> execute owning product command
 -> observe result
 -> verify success event
 -> emit audit record
 -> return typed result
~~~

A successful HTTP response before business verification is not final success.

## 7. Quanty Tool Projection

Quanty does not receive the raw registry. It receives a policy-filtered tool projection:

~~~ts
type QuantyTool = {
  toolId: string;
  capabilityId: string;
  version: number;
  description: string;
  inputSchema: string;
  riskTier: RiskTier;
  requiresApproval: boolean;
  estimatedCost?: { credits: number; meter: string };
};
~~~

Example request: "Send the latest project update to Rahul."

Possible tool set:
~~~text
contacts.person.resolve
mail.thread.search
mail.draft.prepare
mail.send.execute
~~~

The send capability may remain unavailable until approval.

## 8. Cross-App Journey Example

Request: "Priya ko message karo ki kal 5 baje meeting hai, aur mail mein agenda bhej do."

Plan:
~~~text
1. contacts.person.resolve
2. calendar.event.search
3. chat.message.prepare
4. mail.draft.prepare
5. user approval
6. chat.message.send
7. mail.send.execute
8. verify chat.message.sent.v1
9. verify mail.message.sent.v1
10. return per-operation status
~~~

If mail verification times out:
~~~text
Chat: VERIFIED
Mail: UNKNOWN — reconciliation required
Overall: PARTIAL
~~~

Quanty must never claim both succeeded.

## 9. Registry vs Authorization

The registry saying "QuantAds exposes ads.boost.commit" does not mean a user may spend 500 credits.

Runtime authorization still checks:
- identity;
- campaign ownership;
- tenant;
- entitlement;
- credit balance/reservation;
- campaign policy;
- advertiser permissions;
- risk tier;
- fraud/safety state.

## 10. Versioning

Capabilities are independently versioned:
~~~text
mail.send.execute.v1
mail.send.execute.v2
~~~

Additive compatible changes may remain compatible. Semantic changes require a new version. Deprecated versions require a documented sunset date. Unsupported versions fail with a typed error.

## 11. Canonical Errors

~~~text
CAPABILITY_NOT_FOUND
CAPABILITY_VERSION_UNSUPPORTED
CAPABILITY_DISABLED
AUTH_REQUIRED
SCOPE_DENIED
RESOURCE_FORBIDDEN
TENANT_MISMATCH
APP_POLICY_DENIED
APPROVAL_REQUIRED
STEP_UP_REQUIRED
IDEMPOTENCY_CONFLICT
DEPENDENCY_UNAVAILABLE
OPERATION_TIMEOUT_UNKNOWN
VERIFICATION_FAILED
COST_QUOTE_REQUIRED
ECONOMY_RESERVATION_REQUIRED
RESOURCE_STALE
RESOURCE_DELETED
~~~

The UI and Quanty must distinguish these states.

## 12. Degraded Mode Matrix

| Capability | Dependency failure | Required behavior |
|---|---|---|
| mail.thread.get | Mail unavailable | explicit unavailable |
| chat.message.send | Chat unavailable | draft/queue if supported |
| tube.video.watch | CDN unavailable | playback unavailable, metadata may remain |
| cooks.render.start | render worker unavailable | queued/unavailable |
| ads.boost.commit | economy unknown | UNKNOWN, never charge twice |
| memory.context.request | memory unavailable | continue without memory |
| universal search | index unavailable | source-specific fallback if safe |
| notification.create | Chat unavailable | queue/retry |
| ai.run.execute | model provider unavailable | route/failover or explicit unavailable |

## 13. Admin Ownership

- Platform admin: capability schema, registry health, version lifecycle.
- Product admin: product capabilities and product policy.
- Security: scope/risk policy.
- Economy: meter/quote policy.
- QuantAI admin: agent/tool exposure policy.

No single admin silently changes another domain's business semantics.

## 14. Observability

Every invocation records:
~~~text
capabilityId
version
sourceApp
targetApp
actorType
userId reference
tenantId
correlationId
resourceRef
riskTier
approvalState
latency
resultState
verificationState
errorCode
meter
creditsQuoted
creditsCommitted
~~~

Never log message bodies, private media, raw credentials or sensitive memory content unless explicitly allowed by logging policy.

## 15. Implementation Sequence

### EC-01.1 — Contract package
Target:
~~~text
packages/app-registry/
  src/types.ts
  src/capabilities.ts
  src/errors.ts
  src/versioning.ts
  src/policy.ts
  src/index.ts
~~~

### EC-01.2 — Product manifests
Target:
~~~text
docs/quant-architecture/products/
  quantmail/capabilities.md
  quantchat/capabilities.md
  quantai/capabilities.md
  quantgram/capabilities.md
  quantwave/capabilities.md
  quantmax/capabilities.md
  quantube/capabilities.md
  quantcooks/capabilities.md
  quantads/capabilities.md
~~~

Each manifest defines ownership, commands, queries, events, scopes, risk, cost, verification and degraded behavior.

### EC-01.3 — Runtime registry
Validate manifests, reject duplicate capability IDs, reject invalid owners, reject undeclared event references, validate versions and emit diagnostics.

### EC-01.4 — Quanty projection
Build policy-filtered registry-to-tool projection.

### EC-01.5 — Contract tests
Verify every command has a scope; every side effect has verification; every Tier 3/4 action has approval semantics; every capability has degraded behavior; and no product exposes another product's source tables.

## 16. Definition of Done

EC-01 is complete only when:
- all nine products have capability manifests;
- capabilities are typed/versioned;
- ownership is explicit;
- scopes/risk/approval are explicit;
- verification events are explicit;
- economy meters are explicit where applicable;
- degraded behavior is explicit;
- Quanty sees only policy-filtered capabilities;
- registry validation runs in CI;
- contract tests reject invalid manifests;
- runtime authorization remains separate;
- no valid journey requires direct cross-product database access.

## 17. Architectural Law

**The registry describes what the ecosystem can do. Product policy decides whether it may do it. Runtime authorization decides whether this caller may do it now. Verification decides whether it actually happened.**

This separation is mandatory for a Quant-scale super-app.
