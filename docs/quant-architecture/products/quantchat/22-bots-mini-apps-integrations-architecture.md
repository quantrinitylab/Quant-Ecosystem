# QuantChat — Bots, Mini Apps & Integration Runtime

**Status:** Target-state build contract
**Scope:** C04/C05 communities and channels, bot accounts, Telegram-style bots, Discord-style apps, mini-app/web-app surfaces, webhooks, OAuth scopes, sandboxing, credits, Quanty tools and cross-app actions.

## 1. Product law
QuantChat integrations are first-class participants in the communication graph, but they are never equivalent to human identity. A bot/app gets a distinct identity, explicit capabilities, scoped resources and auditable execution.

Core rule:
> **Installation grants capability; it never grants ownership.**

Bot state belongs to QuantChat's bot domain. Foreign resources remain owned by their source products.

## 2. Integration types
- **Bot:** message/event participant with commands and optional conversational behavior.
- **Community App:** installed into a community/space/channel with scoped permissions.
- **Mini App:** user-facing web surface launched from Chat with a signed, short-lived context.
- **Webhook:** outbound event delivery to an explicitly authorized endpoint.
- **OAuth App:** external client using delegated scopes.
- **Quanty Tool:** governed capability callable by Quanty through the same integration registry.
- **Embedded App:** richer interactive surface inside a message/thread/channel where platform policy permits.

These types share one capability registry and audit model.

## 3. Screen inventory
### C14 Integration surfaces
- C14.1 Bot/App Directory
- C14.2 Bot/App Detail
- C14.3 Install Wizard
- C14.4 Permission Review
- C14.5 OAuth Consent
- C14.6 Bot Profile
- C14.7 Bot Command Menu
- C14.8 Mini App Launch
- C14.9 Mini App Session
- C14.10 Integration Management
- C14.11 Webhook Delivery Logs
- C14.12 Bot/App Analytics
- C14.13 Community Integration Admin
- C14.14 Integration Safety/Report
- C14.15 Quanty Tool Permission Surface

These are an integration layer across existing C01–C13 screens, not a new consumer app.

## 4. C14.1 Directory
Mobile: searchable cards with verified publisher, category, permissions, install count and safety status.
Web/Tauri: directory with filters, capability comparison and organization controls.
Directory ranking must distinguish editorial/trending placement from paid placement.

Muse may answer: what an app does, which permissions it needs and what data it can access. Muse must not recommend an integration by hiding its permissions.

## 5. C14.2 Detail
Detail page shows:
- publisher identity
- verification status
- requested scopes
- data destinations
- event subscriptions
- pricing/credits
- privacy policy reference
- security review status
- supported surfaces
- uninstall/revocation behavior.

Permissions are understandable before installation.

## 6. C14.3 Install Wizard
Installation:
`discover → inspect → choose target → permission review → consent → provision → verify → installed`.

Target may be personal account, direct chat, group, community, space or channel.

Community installation requires an actor with the appropriate community capability.

Installation is idempotent by `(tenant, app, target, installation identity)`.

## 7. C14.4 Permission Review
Permissions use least privilege and explicit resource scope.

Example scopes:
- `chat:read`
- `chat:write`
- `chat:reactions:write`
- `community:read`
- `community:moderate`
- `channel:manage`
- `media:attach`
- `meeting:read`
- `meeting:start`
- `calendar:create` through a cross-app capability
- `drive:read:selected`
- `webhook:subscribe`.

Never offer a generic `full_account_access` scope.

High-risk scopes display risk, side effects, data classes, expiry and revocation behavior.

## 8. C14.5 OAuth consent
OAuth consent is separate from bot installation when an external client needs delegated access.

Consent screen shows client identity, exact scopes, resource boundaries, expiry and whether refresh access is requested.

Authorization code exchange occurs server-side. Tokens are never exposed to client-rendered Mini Apps unless a specific secure protocol requires it.

Refresh credentials remain in the authorization domain, encrypted and inaccessible to model prompts.

## 9. Bot identity
Bot identity has its own stable subject reference and credential set.

Bot profile contains name, avatar, description, publisher, verification, capabilities and safety status.

Human owners/operators are linked through ownership relationships but bot actions are always attributed to the bot identity plus the acting installation/capability context.

Messages must visibly distinguish bot-generated content from human content.

## 10. Bot command architecture
Command registry:
`command name → version → input schema → capability → risk → handler → timeout → audit policy`.

Examples:
- `/help` read-only
- `/poll` creates a chat resource
- `/meet` proposes a QuantMeet action
- `/remind` creates a Calendar handoff
- `/summarize` invokes governed Quanty
- `/deploy` is never granted merely because a bot is in a developer channel; it requires explicit Git capability.

Unknown commands produce a safe capability-aware response, not arbitrary execution.

## 11. Event-driven bots
Bot subscriptions can receive authorized events such as:
- message created
- reaction added
- member joined
- channel updated
- meeting started/ended
- media published
- moderation case changed.

Events are filtered before delivery using installation scope and current authorization.

Never send an entire conversation merely because a bot subscribes to `message.created`.

Payloads use typed event envelopes and contain only minimum useful fields.

## 12. Webhook architecture
Outbound delivery:
`domain event → subscription filter → authorization check → payload projection → signed request → endpoint → delivery result`.

Webhook security:
- HTTPS required
- signing secret/key rotation
- timestamp + nonce replay protection
- bounded payload size
- per-endpoint rate limits
- retry with exponential backoff
- idempotency/delivery id
- circuit breaker
- automatic suspension after sustained failure.

Webhook receivers never get database credentials.

## 13. Mini App launch
Mini App launch creates a short-lived signed session.

Launch context includes:
- user subject reference
- installation reference
- target resource reference
- allowed scopes
- locale/theme/accessibility hints
- expiration
- nonce
- correlation id.

The Mini App must not infer broader account access from this context.

Context is audience/resource scoped and expires quickly.

## 14. Mini App bridge
The bridge exposes typed operations instead of arbitrary native APIs.

Examples:
- get current user display projection
- get selected chat resource
- send a prepared message
- request media picker
- create a poll
- request a QuantMeet launch
- request an ecosystem handoff.

Every bridge method maps to a declared capability and server authorization check.

Mini Apps cannot directly access private keys, raw auth tokens, local databases or unrestricted filesystem/network APIs.

## 15. Embedded interactive messages
Interactive message cards may contain buttons, forms, polls, games or app actions.

Interactive state is server-owned when it affects durable outcomes.

Client-rendered UI is never authoritative for credits, membership, permissions, moderation or financial state.

An interaction carries message/resource reference, installation id, actor, nonce and idempotency key.

## 16. Sandboxing
Untrusted integration code runs outside QuantChat's trusted server process.

Server sandbox controls:
- CPU/time limits
- memory limits
- outbound network allowlist
- filesystem isolation
- secret isolation
- dependency policy
- execution concurrency
- request size limits.

Client Mini Apps run in an isolated origin/container with a narrow bridge.

Arbitrary native code, arbitrary account-token access and unrestricted internal-network access are prohibited.

## 17. Integration execution state
Installation:
`REQUESTED → AUTHORIZING → ACTIVE → SUSPENDED → REVOKED → DELETED`.

Invocation:
`RECEIVED → AUTHORIZED → QUEUED → EXECUTING → VERIFYING → COMPLETED | FAILED | EXPIRED`.

Unknown outcomes reconcile against the authoritative domain before retry.

## 18. Database model
Core entities:
- Bot
- BotVersion
- IntegrationApp
- AppVersion
- Installation
- InstallationScope
- OAuthClient
- OAuthGrant
- BotCommand
- EventSubscription
- WebhookEndpoint
- WebhookDelivery
- MiniApp
- MiniAppSession
- InteractiveMessage
- IntegrationInvocation
- IntegrationAuditEntry
- IntegrationModerationCase.

PostgreSQL owns durable integration state. Redis handles ephemeral invocation locks/rate limits. Kafka carries durable facts. Object storage owns app/media bytes.

## 19. API surface
Target endpoints:
- `GET /v1/integrations`
- `GET /v1/integrations/{id}`
- `POST /v1/integrations/{id}/installations`
- `GET /v1/integrations/installations`
- `PATCH /v1/integrations/installations/{id}`
- `DELETE /v1/integrations/installations/{id}`
- `GET /v1/integrations/installations/{id}/permissions`
- `POST /v1/oauth/authorize`
- `POST /v1/oauth/token`
- `POST /v1/mini-apps/{id}/sessions`
- `POST /v1/integrations/invocations`
- `GET /v1/integrations/webhooks`
- `GET /v1/integrations/webhooks/{id}/deliveries`

External apps receive stable public API contracts, not internal database access.

## 20. Events
Recommended events:
- `chat.integration.installed.v1`
- `chat.integration.permission_changed.v1`
- `chat.integration.suspended.v1`
- `chat.integration.revoked.v1`
- `chat.bot.command_invoked.v1`
- `chat.bot.invocation_completed.v1`
- `chat.integration.webhook_delivery.v1`
- `chat.integration.mini_app_session_created.v1`
- `chat.integration.moderation_case_changed.v1`.

Events carry provenance and resource refs; secrets, access tokens and unnecessary message plaintext are excluded.

## 21. Credits and commerce
Integrations may consume or earn Quant credits only through the economy contract.

Examples:
- premium bot commands
- Mini App purchases
- game entries
- creator tips
- app subscriptions.

An integration receives an economy operation reference, never direct wallet database access.

Pricing and settlement are authoritative in QuantTrinity/economy.

Client UI must show estimated cost before paid actions where applicable.

## 22. Quanty integration
Quanty sees integrations as governed tools.

Tool registration requires:
- stable tool name/version
- input/output schema
- required installation scope
- resource scope
- risk tier
- approval mode
- timeout
- credit estimate
- audit event
- verification method.

Example:
`community.poll.create` can create a poll in one authorized channel; it cannot send arbitrary messages to every channel.

Quanty cannot elevate a bot's scopes. The integration installation remains the capability root.

## 23. Cross-app actions
An integration may request a cross-app action through the ecosystem handoff contract.

Example:
`/meet` → Chat creates a meeting intent → Calendar scheduling capability resolves availability → QuantMeet creates session → Chat posts invite.

Each domain performs its own authorization and remains source of truth.

Never pass a reusable super-token across products.

## 24. Screen behavior
### Mobile/Capacitor
Permission sheets and install flow are bottom-sheet friendly. Mini Apps use an isolated app container. Critical external actions show target and scope.

### Web
Split detail/permissions view, developer-style logs for owners and embedded Mini App container.

### Tauri
Native notification integration, secure external-app session handling and desktop developer console.

### QuantMeet
Apps can request meeting launch, polls, reactions, collaborative cards or controlled meeting actions. They cannot silently capture media or change meeting security.

## 25. Community admin
Community owners see installed apps, scopes, installation actor, last activity, failures, abuse reports and revoke/suspend controls.

Channel-level overrides can narrow an installation but cannot expand its community-granted maximum.

Moderation-sensitive apps require explicit `community:moderate` capability and higher risk review.

## 26. Integration safety
Threats:
- malicious Mini App
- phishing OAuth client
- scope confusion
- token theft
- webhook replay
- SSRF
- sandbox escape
- prompt injection from bot messages
- malicious bot spam
- supply-chain compromise.

Controls:
- publisher verification
- signed versions
- scope minimization
- isolated origins
- outbound network allowlists
- SSRF protection
- secret vaulting
- replay protection
- rate limits
- abuse quotas
- automated and human review
- rapid suspension.

Bot content is untrusted input to Quanty. A bot cannot instruct Quanty to ignore its policy.

## 27. Moderation
Integration abuse is its own moderation case type.

Signals:
- spam velocity
- unsolicited DMs
- phishing patterns
- malicious links
- suspicious OAuth behavior
- excessive API errors
- user reports
- policy violations.

Automated suspension can stop new invocations while preserving audit history.

Appeals are separate decisions and require authorized review.

## 28. Reliability
Webhook delivery uses retries with backoff and idempotency. Mini App sessions expire. Bot invocations have bounded timeouts and concurrency.

One broken integration must not degrade the core messaging path.

Integration workloads run on isolated queues/pools from latency-critical chat delivery.

Dependency failure returns a typed error and preserves the user action when safe to retry.

## 29. Observability
Measure:
- installation conversion
- permission denial
- invocation latency
- invocation failure rate
- webhook success/retry/DLQ rate
- Mini App launch latency
- sandbox resource usage
- abuse reports
- suspension rate
- credits consumed
- cross-app handoff success.

Trace every invocation from UI/event through authorization, execution and verification.

Never put OAuth secrets or raw credentials into logs.

## 30. Accessibility
Permissions and risk must be textual, not color-only. Screen readers announce installation steps, scope changes, invocation results and failures.

Mini Apps must respect reduced motion, keyboard navigation and text scaling where platform APIs permit.

## 31. Test matrix
Unit: scope evaluation, command schemas, session expiry, signature validation, idempotency and risk classification.

Integration: install/revoke, OAuth exchange, Mini App bridge, webhook delivery, bot command execution, credits operation and cross-app handoff.

Security: forged scope, token replay, SSRF, sandbox escape, malicious package, OAuth redirect abuse, secret leakage and prompt injection.

Reliability: duplicate webhook, timeout, worker crash, queue outage, dependency failure and replay.

E2E: install → consent → command → side effect → verification → audit; revoke → old session denied; Mini App → scoped action; bot → community moderation.

## 32. Implementation sequence
**BOT-01** — integration/bot domain schema and capability registry.
**BOT-02** — installation + permission review.
**BOT-03** — bot identity and command registry.
**BOT-04** — event subscriptions + webhook delivery.
**BOT-05** — OAuth grants and token lifecycle.
**BOT-06** — Mini App sessions + isolated bridge.
**BOT-07** — sandboxed execution runtime.
**BOT-08** — interactive messages/forms/polls.
**BOT-09** — credits/economy integration.
**BOT-10** — Quanty tool registration and approval.
**BOT-11** — cross-app handoff actions.
**BOT-12** — moderation/safety and publisher trust.
**BOT-13** — analytics/observability.
**BOT-14** — security/reliability/accessibility/E2E evidence.

## 33. Definition of done
Integration architecture is complete only when every installation is scoped, every invocation is authorized and idempotent, Mini Apps are isolated, OAuth grants are revocable, webhooks are signed/replay-safe, bots cannot bypass human identity boundaries, credits use the economy ledger, Quanty uses declared capabilities, cross-app actions preserve ownership, abuse can be suspended quickly and all consequential actions are auditable.

> **Architectural invariant:** QuantChat integrations are capability-scoped participants in the ecosystem, not privileged extensions of the database.

Next deep slice: **QuantChat Data Governance, Privacy, Trust & Safety Operations** — retention, legal/DSAR flows, encryption/key lifecycle, age assurance, abuse intelligence, moderation escalation, transparency, appeals, audit and disaster recovery.