# QuantAds — Non-Intrusive Ecosystem & Game Advertising Architecture

**Status:** Target-state architecture / execution contract

> **Ad principle:** Ads should feel like useful content, rewards, sponsorship or world-building—not an interruption. The platform optimizes long-term user trust and creator value, not maximum ad impressions.

## 1. The QuantAds experience ladder
Prefer ad formats in this order:
1. **Native discovery** — sponsored content that behaves like the surrounding feed and is clearly labeled.
2. **Opt-in reward** — user chooses to watch/interact in exchange for a clearly stated benefit.
3. **Playable sponsorship** — a short interactive experience that is itself useful/fun.
4. **World-integrated sponsorship** — branded game objects, environments or events that fit the experience.
5. **Utility sponsorship** — sponsored tools, templates, filters, creator resources or offers.
6. **Interstitial** — exceptional fallback, frequency-capped and only at natural boundaries.

Forced interruption is the last resort, not the default monetization strategy.

## 2. Universal ad contract
Every ad has:
- `ad_id`
- advertiser
- campaign
- creative version
- placement type
- disclosure label
- targeting policy
- frequency policy
- age eligibility
- landing/action destination
- measurement policy.

Users should always know when something is sponsored.

## 3. The best game format: Rewarded Choice
QuantMax games should primarily use **Rewarded Choice Ads**.

At a natural checkpoint the game can show:
"Watch a 15-second sponsor to receive 2 extra retries?"

Choices:
- Continue normally
- Watch & receive reward
- Not now.

No reward is silently withheld from normal gameplay.

The reward is delivered only after verified completion.

## 4. In-game sponsor objects
Games can integrate branded objects naturally:
- branded football
- sponsored racing car
- branded restaurant inside a city game
- sponsored avatar clothing
- branded arcade cabinet
- sponsored stadium.

The object must remain relevant to the game's world and cannot block controls.

Creators can configure approved sponsor slots without receiving raw advertiser targeting data.

## 5. Sponsored game worlds
Brands can sponsor a temporary QuantMax event:
`Brand Quest → limited-time map → optional participation → cosmetic/reward → event ends`.

This creates an actual game experience instead of an interruption.

Sponsored worlds are labeled as sponsored.

## 6. Playable ads
Playable ads are mini-games themselves.

Flow:
`sponsored card → instant playable preview → optional interaction → CTA`.

Recommended interaction window: short and voluntarily entered.

After completion:
- close
- visit advertiser
- claim eligible offer.

No forced app installation.

## 7. QuantCooks sponsored filters
Brands can commission:
- AR filters
- effects
- templates
- stickers
- transitions.

Creator can co-create a branded effect.

Attribution can show:
`Created by Creator X · Sponsored by Brand Y`.

This gives both creator reputation and advertiser value.

## 8. Creator-sponsored ecosystem
QuantAds should enable **Creator + Brand** campaigns.

Example:
`game creator → creates branded game mode → QuantAds sponsor → users play → creator earns → brand gets verified interaction`.

Revenue attribution can split among creator, platform and approved partners according to the campaign contract.

## 9. Feed advertising
Feed ads should look and behave like the content format around them:
- short video ad in short-video feed
- playable card in playable feed
- creator-style sponsored effect in effect discovery.

Always show a clear Sponsored label.

Never disguise advertising as an ordinary friend post.

## 10. Ads inside games
Supported formats:
- rewarded choice
- sponsor object
- sponsor map/event
- branded cosmetic
- optional playable sponsor
- end-of-session sponsor card.

Avoid by default:
- ads during active gameplay
- forced video after every round
- banners covering controls
- fake close buttons
- ads immediately after loading
- ads that interrupt competitive moments.

Competitive matches should be protected from ad interruptions.

## 11. Natural breakpoints
Ads may appear only at declared breakpoints:
- before a match starts
- after a completed round
- after a session ends
- while waiting for matchmaking
- between chapters/levels.

Developers declare breakpoints in their game manifest.

QuantAds policy engine can reject excessive or badly placed inventory.

## 12. Ad frequency budget
Frequency is controlled globally and per product.

Signals include:
- ads recently shown
- session length
- recent rewarded interaction
- user preference
- subscription/ad-free entitlement.

Frequency caps are enforced server-side.

A user should not encounter a chain of ads merely because multiple products share the same account.

## 13. Ecosystem-level ad fatigue
QuantAds maintains a **global ad-fatigue budget**.

If a user has recently encountered ads in QuantMax, QuantGram should know the user has consumed the ecosystem's ad budget without receiving private behavioral details from unrelated products.

Products request an ad opportunity; QuantAds decides whether the user is eligible for another impression.

## 14. Reward quality
Rewarded ads must disclose the reward before viewing.

Examples:
- extra life
- cosmetic trial
- temporary boost
- game currency where permitted
- creator support token
- bonus content.

Rewards must not create unfair competitive advantage in ranked/paid competitive play unless the game rules explicitly permit it.

## 15. No dark patterns
Forbidden:
- fake system warnings
- fake download buttons
- deceptive close controls
- forced redirects
- accidental click traps
- disguised ads
- hidden recurring charges.

Close/skip behavior must be predictable.

## 16. Personalization
Ads can be relevant without building invasive profiles.

Preferred signals:
- current context
- declared interests
- coarse product category
- current game genre
- explicit advertiser campaign constraints.

Avoid using sensitive traits or unrelated private message contents for ad targeting.

E2EE message content is never used for advertising targeting.

## 17. Quanty and ads
Quanty can answer:
"Why am I seeing this sponsor?"
"Show me fewer gaming ads."
"Don't show me this advertiser."

Quanty can adjust explicit ad preferences through governed settings.

Quanty must never secretly increase ad exposure because an advertiser pays more.

## 18. Ad preference center
One ecosystem-level control surface:
- personalized ads on/off where available
- topic preferences
- advertiser controls
- recent sponsored experiences
- ad frequency explanation
- why-this-ad.

Product-specific settings can add stricter controls.

## 19. Subscription / ad-free
Where an eligible paid plan promises ad-free usage, the entitlement is enforced centrally.

Transactional, safety, legal and service notices are not treated as advertising.

Sponsored creator content can require separate disclosure even when ordinary ads are disabled, depending on product policy.

## 20. Game developer integration
Game SDK exposes a safe interface:
- `requestRewardedOpportunity()`
- `requestSponsorAsset()`
- `requestPlayableSponsor()`
- `getAdEligibility()`.

The game receives a typed result, not advertiser targeting data.

Ad SDK never exposes the QuantTrinity ledger.

Developers cannot bypass frequency caps.

## 21. Game manifest ad policy
Developer declares:
- allowed formats
- breakpoint locations
- maximum frequency
- reward type
- competitive restrictions
- supported devices.

QuantAds validates these declarations before publication.

Platform safety can further restrict them.

## 22. Creator revenue
Eligible creator-owned games/effects receive verified attribution from:
- rewarded completions
- qualified playable interactions
- sponsor object exposure where contractually valid
- campaign conversions.

Revenue is not based on raw client events.

Fraud-adjusted events feed the creator payout projection.

## 23. Advertiser measurement
Advertisers receive aggregated campaign metrics:
- impressions
- qualified starts
- completed interactions
- conversion events
- cost
- reach.

Individual user identity is not exposed by default.

Attribution uses privacy-preserving measurement and campaign-scoped identifiers.

## 24. Ad auctions
QuantAds may use an auction among eligible campaigns, but auction price cannot override:
- user safety
- age policy
- frequency caps
- ad quality
- creator/game placement rules.

The highest bid is not automatically the best ad.

## 25. Ads and recommendations
Organic recommendation and paid delivery remain separate pipelines.

Sponsored candidates carry explicit provenance.

Paid ranking cannot rewrite organic engagement statistics.

Users can distinguish:
- Recommended
- Following
- Sponsored.

## 26. Safety and brand suitability
Campaigns and creatives are scanned before activation.

Controls include:
- malware scanning
- landing-page checks
- prohibited category policy
- age suitability
- creative integrity
- advertiser verification.

Games can define stricter brand-safety categories.

## 27. Data architecture
QuantAds owns:
- campaign
- creative
- placement
- eligibility
- frequency budget
- auction
- measurement.

QuantMax owns:
- game session
- game UI
- game resource.

QuantCooks owns:
- effect runtime/resource.

QuantTrinity owns:
- financial ledger/settlement.

Creator platform owns:
- creator attribution/revenue projections.

## 28. Events
- `quantads.opportunity.created.v1`
- `quantads.impression.qualified.v1`
- `quantads.reward.completed.v1`
- `quantads.playable.completed.v1`
- `quantads.conversion.recorded.v1`
- `quantads.campaign.paused.v1`
- `quantads.frequency.updated.v1`
- `quantads.creator.attribution.v1`.

## 29. Failure behavior
If ad service fails: **continue the product experience**.

No game should freeze waiting for an advertisement.

Rewarded flow must be idempotent.

If verification fails, no reward is issued and the user can continue normally.

## 30. Implementation sequence
**ADS-01** — canonical ad opportunity contract.
**ADS-02** — global frequency/fatigue budget.
**ADS-03** — native sponsored content.
**ADS-04** — Rewarded Choice API.
**ADS-05** — QuantMax game sponsor SDK.
**ADS-06** — playable ads sandbox.
**ADS-07** — branded game worlds/objects.
**ADS-08** — QuantCooks sponsored effects.
**ADS-09** — creator-brand attribution.
**ADS-10** — privacy-preserving measurement.
**ADS-11** — auction/eligibility engine.
**ADS-12** — advertiser/creative safety.
**ADS-13** — ad preference + Quanty controls.
**ADS-14** — creator payout integration.
**ADS-15** — fraud/quality/reliability evidence.

## 31. The user experience we want
The user should think:
"I chose this."
"This is actually fun/useful."
"It didn't interrupt what I was doing."
"I know it's sponsored."
"I got something valuable from it."

Not:
"This app keeps showing me ads."

> **Invariant:** Monetize attention without disrespecting attention. The best Quant ad is one the user voluntarily enters because the experience itself has value.