# Quant Creator & Developer Economy — QuantGit → QuantMax → QuantCooks → Ecosystem

**Status:** Target-state ecosystem architecture / execution contract

> **Core thesis:** A developer/creator should be able to build once inside the Quant ecosystem, publish through QuantGit/Developer Platform, distribute into the correct Quant product, earn from real usage, build a reputation, and carry portable creator identity across games, filters, effects, templates and other approved creator assets.

## 1. The creator flywheel
`Create → Commit → Build → Test → Review → Publish → Discover → Use → Attribute → Earn → Reputation → Iterate`.

The platform must reward **actual value and verified usage**, not raw downloads, fake views or spam.

## 2. Creator identities
Every developer/creator has one canonical Quant identity with product-scoped creator profiles.

Creator profile can aggregate:
- published games
- filters/effects
- templates/assets
- verified installs/plays/uses
- ratings
- retention/completion quality
- followers
- verified earnings
- awards/badges
- contribution history.

Identity is canonical; product pages are projections.

## 3. QuantGit Developer Platform
QuantGit becomes the developer source-control and delivery surface for ecosystem software.

Developer workflow:
`QuantGit repo → SDK/API → local development → CI → signed build → security scan → compatibility test → review → release → product distribution`.

Developer chooses a target:
- QuantMax Game
- QuantCooks Filter/Effect
- QuantChat Lens/AR asset where approved
- QuantGram Effect/Template
- QuanTube interactive extension where supported
- QuantAds Playable Creative
- future ecosystem extension.

One repository can contain multiple packages only when each package has an explicit manifest and isolated permissions.

## 4. Quant App SDK model
All developer-facing capabilities are exposed through typed SDKs rather than private APIs.

SDK families:
- `@quant/game-sdk`
- `@quant/cooks-sdk`
- `@quant/ar-sdk`
- `@quant/social-sdk`
- `@quant/media-sdk`
- `@quant/ads-sdk`
- `@quant/creator-sdk`.

SDKs expose identity, assets, analytics, discovery, monetization and approved platform capabilities.

No third-party package receives direct PostgreSQL, Kafka, R2, wallet, user graph or internal service credentials.

## 5. QuantGit project types
### Game project
Game executable/assets + manifest + server module where applicable.

### Filter/effect project
Visual graph/shader/model/material/ML asset package with device constraints.

### Template project
Reusable creator composition for video/photo/interactive content.

### Playable-ad project
Sandboxed interactive advertising package linked to QuantAds.

### Integration project
Bot, Mini App or approved extension with explicit capability declarations.

## 6. Project manifest
Every published project declares:
- project id
- creator id
- project type
- version
- supported platforms
- runtime
- SDK version
- permissions
- network endpoints
- storage requirements
- camera/microphone requirements
- age classification
- accessibility metadata
- monetization model
- dependencies
- provenance/license
- privacy policy reference.

Publishing is impossible if required metadata is missing.

## 7. Permissions
Capability examples:
- identity.basic
- profile.read_limited
- friends.invite
- room.join
- room.create
- voice.session
- camera.frame
- media.asset.read
- media.asset.write
- analytics.own
- economy.purchase_intent
- creator.payouts.read
- ads.render.

Capabilities are scoped by product, resource, user consent and runtime.

Developer apps never receive unrestricted account access.

## 8. Build pipeline
`commit → dependency lock → static analysis → SBOM → malware scan → sandbox test → SDK compatibility → performance test → signed artifact → provenance record`.

Build artifacts are immutable.

Every artifact can be traced to:
`creator → repository → commit → build → release → published resource`.

## 9. QuantGit CI/CD
QuantGit CI supports:
- build
- unit/integration tests
- runtime compatibility
- asset validation
- security scanning
- performance budgets
- device matrix
- signed releases.

Release channels:
- development
- private test
- limited beta
- public.

Promotion between channels requires immutable artifact identity.

## 10. Game publishing into QuantMax
Developer flow:
`QuantGit → Game SDK build → validation → QuantMax review → game catalog → controlled rollout → public discovery`.

After publication, the game receives a QuantMax `GameResourceRef`.

Game state remains QuantMax-owned.

Developer owns the source/build rights according to license terms; platform receives only the distribution/runtime rights explicitly granted.

## 11. Game monetization
Approved models:
- free + creator rewards
- cosmetic sales
- premium game
- optional entry fee where permitted
- sponsored content
- rewarded interactions
- subscriptions/bundles where appropriate.

Developer revenue is calculated from verified economy operations, not client claims.

QuantTrinity settles the ledger.

Platform fee, taxes, refunds, chargebacks and reserve policies are explicit before publication.

## 12. Game creator revenue attribution
Attribution can use:
- verified game starts
- completed sessions
- retained players
- paid entitlements
- eligible cosmetic sales
- qualified ad interactions.

Raw impressions alone should not produce large payouts.

Fraud-adjusted usage becomes the canonical payout input.

Revenue ledger records:
- gross amount
- platform fee
- creator share
- taxes/withholding where applicable
- refunds/chargebacks
- fraud adjustments
- final payable amount.

## 13. Game popularity / reputation
Creator popularity is a derived reputation projection, not a manually editable number.

Signals:
- verified unique players
- repeat players
- completion
- retention
- ratings
- shares
- creator follows
- safety record
- uptime/crash quality.

Negative signals:
- validated abuse
- malware
- cheating
- fake traffic
- repeated policy violations.

Popularity must be resistant to purchased/farmed engagement.

## 14. QuantCooks creator ecosystem
QuantCooks creators can build:
- filters
- AR effects
- LUT/color styles
- transitions
- templates
- sticker packs
- editing presets
- interactive effects.

Creator flow:
`QuantGit/Creator Studio → effect build → device compatibility → visual/safety review → QuantCooks catalog → usage → attribution → earnings`.

Every effect receives a stable resource reference and version.

## 15. Filter/effect attribution
When a user creates content using an effect, the publication pipeline records the approved creator attribution.

Attribution can appear:
- effect page
- content detail
- creator profile
- analytics.

Attribution does not expose private user data.

Creators receive aggregate usage metrics.

## 16. Filter monetization
Approved models:
- paid effect packs
- premium templates
- creator subscriptions
- tips
- licensed brand effects
- sponsored effects.

Free viral effects can generate creator reputation and, where program rules allow, usage-based rewards.

QuantCooks never silently charges a user because an effect was installed.

Price and purchase intent are explicit.

## 17. Cross-product creator graph
One creator can publish multiple resource types:
`Creator → Game / Filter / Template / Lens / Bot / Playable`.

Each resource keeps its own ownership, version and runtime policy.

Creator profile aggregates the portfolio.

Cross-product ranking never gives automatic privileged exposure merely because another resource is popular.

Safety history may restrict publication across the ecosystem when policy permits.

## 18. Discovery and attribution
Discovery items carry:
- resource reference
- creator reference
- attribution source
- version
- provenance.

If a game is shared into QuantChat, the share points to the QuantMax resource rather than duplicating the game.

If a filter-generated video reaches QuantGram/QuantWave/QuanTube, the effect attribution follows the content provenance chain.

## 19. Creator analytics
Developer dashboard shows:
- installs/plays/uses
- DAU/WAU where eligible
- completion
- retention
- crash rate
- latency
- device distribution
- geographic aggregates
- revenue
- payout status
- moderation events
- version performance.

Privacy thresholds prevent small cohorts from exposing individual users.

## 20. Creator reputation tiers
Possible progression:
- New
- Verified Creator
- Trusted Creator
- Featured Creator
- Ecosystem Partner.

Tiering is policy-driven and reversible.

Payment or spending alone cannot purchase trust status.

## 21. Featured placement
Creators can earn organic discovery through quality and verified popularity.

Paid promotion is a separate labeled mechanism.

Featured placement requires eligibility checks.

Safety, malware, crash and user-harm metrics remain hard gates.

## 22. Creator marketplace
Marketplace can list:
- games
- filters
- templates
- assets
- packs
- developer services where enabled.

Every listing has:
- creator
- version
- price
- platform compatibility
- license
- permissions
- safety status.

Marketplace search is not the same as recommendation ranking.

## 23. Licenses and ownership
Every asset declares ownership/license terms.

Platform distribution rights are explicit.

Remixes require the source license to permit them.

Creator attribution is preserved through derivative chains where technically possible.

Disputes create a moderation/legal case rather than silently changing ownership metadata.

## 24. Remix / fork system
Developers can fork projects only when the source license permits it.

Fork records preserve:
- parent resource
- source version
- fork creator
- license.

Derivative games/effects can earn independently while preserving required attribution.

## 25. QuantGit developer profile
Developer profile includes:
- verified identity
- repositories
- releases
- projects
- game/filter portfolio
- contribution graph
- reputation
- earnings summary
- badges.

Private source code remains private unless published.

Analytics never expose private repositories.

## 26. Developer → product deployment
Deployment targets are product-owned.

QuantGit produces an immutable artifact and deployment intent.

QuantMax/QuantCooks/etc. decide publication eligibility and runtime activation.

QuantGit cannot directly make a product publish an unsafe artifact.

## 27. Cross-app build examples
### Game developer
`QuantGit repo → Game SDK → build → review → QuantMax → players → verified usage → creator reputation + payout`.

### QuantCooks filter creator
`QuantGit/Creator Studio → Filter SDK → device tests → QuantCooks → users create videos → attribution → usage/reputation + payout`.

### Game + filter creator
`game studio → game resource + optional approved filter pack → QuantMax → QuantCooks-linked discovery → shared creator portfolio`.

### Playable advertiser
`QuantGit/Ads SDK → QuantAds review → sandbox → QuantMax playable placement → verified interaction → advertiser measurement`.

## 28. Quanty developer assistant
Quanty can:
- explain SDK errors
- generate starter code
- inspect build logs
- suggest performance fixes
- generate test cases
- prepare release notes
- explain rejection reasons.

Quanty cannot silently publish or change permissions.

Publishing and monetization actions require explicit capability/approval.

## 29. Security
Developer runtime threats:
- malicious package
- supply-chain compromise
- credential theft
- sandbox escape
- unauthorized network access
- user-data exfiltration
- economy fraud.

Controls:
- signed artifacts
- dependency/SBOM checks
- sandbox
- allowlisted APIs
- capability tokens
- runtime quotas
- egress controls
- provenance
- revocation.

## 30. Moderation and enforcement
Lifecycle:
`report → automated triage → review → decision → appeal → enforcement → payout hold/release`.

Possible actions:
- content removal
- release rollback
- resource suspension
- creator warning
- payout hold
- developer suspension.

Emergency malicious artifacts can be revoked immediately while preserving audit evidence.

## 31. Economy boundary
Creator systems create **economy operation intents**.

QuantTrinity owns:
- wallet
- ledger
- settlement
- refunds
- payout state.

Product services own:
- entitlement
- attribution
- verified usage.

Developer services never directly mutate balances.

## 32. Event model
- `creator.project.created.v1`
- `creator.build.completed.v1`
- `creator.release.published.v1`
- `creator.resource.published.v1`
- `creator.resource.suspended.v1`
- `creator.usage.verified.v1`
- `creator.attribution.recorded.v1`
- `creator.revenue.eligible.v1`
- `creator.payout.state_changed.v1`
- `creator.reputation.changed.v1`.

## 33. Core schemas
- creator_profile
- creator_project
- creator_project_member
- creator_manifest
- creator_build
- creator_release
- creator_resource
- creator_attribution
- creator_usage
- creator_reputation
- creator_license
- creator_fork
- creator_monetization
- creator_payout_projection
- creator_review
- creator_enforcement.

## 34. Implementation sequence
**CREATOR-01** — canonical creator/resource/provenance contracts.
**CREATOR-02** — QuantGit project manifests + SDK registry.
**CREATOR-03** — build/sign/SBOM/security pipeline.
**CREATOR-04** — artifact/release provenance.
**CREATOR-05** — QuantMax game deployment adapter.
**CREATOR-06** — QuantCooks effect/filter deployment adapter.
**CREATOR-07** — usage attribution spine.
**CREATOR-08** — creator reputation projection.
**CREATOR-09** — monetization/economy operation contract.
**CREATOR-10** — creator analytics.
**CREATOR-11** — marketplace/licensing/remix.
**CREATOR-12** — moderation/appeal/payout hold.
**CREATOR-13** — Quanty developer copilot.
**CREATOR-14** — cross-app portfolio/discovery.
**CREATOR-15** — security/load/privacy evidence.

## 35. Definition of done
A developer can create a real project in QuantGit, build it with the official SDK, pass automated and human review, publish it into an owning Quant product, receive verified usage attribution, appear in the ecosystem creator profile, earn according to transparent rules, inspect analytics, release updates and appeal enforcement decisions.

> **Invariant:** Create once, attribute correctly, distribute through the owning product, measure verified value, and settle money through QuantTrinity.