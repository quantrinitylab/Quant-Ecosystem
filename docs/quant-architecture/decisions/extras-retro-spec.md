# Decision: retro-spec of un-specced extras (K15)

**Status:** proposed (docs-only; no code deleted in this PR)
**Date:** 2026-10-08
**Source:** `hidden_files/gap-audit/extras-to-remove.md` Part B (audit of 2026-10-07)
**Scope:** every Part-B extra was re-verified against `origin/main` @ `e1fcc6b2`
before deciding. Part A (safe-to-delete) is handled by the parallel removal wave
(#589 merged); a few Part-B entries turned out to be already gone — recorded as
`already-resolved` below.

## Decision criteria (applied per extra)

1. **Real data?** — does it read from a backend endpoint, durable store, or real
   device/OS capability, rather than hardcoded MOCK/FAKE/DEMO constants?
2. **Working?** — does it render functional states (loading/empty/error) and
   complete its core flow end-to-end?
3. **In-mission?** — does it belong to the product's purpose as defined in
   `docs/quant-architecture/`?

- All three yes → **keep+spec'd** (retro-spec written under
  `docs/quant-architecture/products/<product>/extras/`).
- Fake, dead, duplicative, or hollow → **remove** (marked here only; actual
  deletion is a separate code wave, not this PR).
- Real but off-mission, or a genuine product-direction call → **needs-user-decision**.
- Already deleted by an earlier wave, or decided by another decision record →
  **already-resolved** (pointer, no new action).

Two cross-cutting corrections to the audit, discovered during verification:

- **QuantChat "spec drift" is not drift.** The audit compared the shipped Snapchat-class
  paradigm against `12-screen-inventory.md` C01–C13 only. The product-level spec
  `products/quantchat/01-unified-social-messaging-meeting-architecture.md` explicitly
  defines "Snapchat-class camera/social" (camera-first mobile, Stories, Spotlight-style
  short video, Snap-Map-style location, ghost mode, close friends) as a core pillar.
  The inventory file is the stale artifact; the product spec is authoritative.
- **The fake-removal wave already cleaned most fakes.** QuantAI `src/pages/`,
  QuanTube `/playlist/[id]`, QuantGram `/shopping`, QuantAds `/economy/*` were
  flagged as fake-data in the audit but now carry real backends and honest
  empty/coming-soon states. Their verdicts below reflect the verified state, not
  the audit snapshot.

---

## B1 — QuantMail unspecced UI

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/marketing` | keep+spec'd | Real: static SEO/acquisition landing, brand lockup, no invented claims found. In-mission for a consumer mail product. | `products/quantmail/extras/quantmail-extras-retro-spec.md` |
| `/postcards` | needs-user-decision | Real and working (820-line PostcardStudio, localStorage-persisted designs) but a **standalone creative product** with no backend and no mail-mission fit. User decides: keep as mini-app surface, move to QuantCooks, or remove. | decision only |
| `/pipelines` | keep+spec'd | Real: CI build/deploy monitor over QuantGit repos via `usePipelines` → `apiClient.getWorkflows/getBuilds`. In-mission as the QuantGit (codehub) developer surface. | same as above |
| `/lab/bubble`, `/lab/marks` | keep+spec'd | Real internal design labs (BubbleLab, MarkLab). 404 in production unless `QUANT_ENABLE_LABS=1` — dev-only tooling, not a user surface. | same as above |
| `/workspaces`, `/workspaces/[id]` | keep+spec'd | Real: `useWorkspaces` hooks + `backend/routes/workspaces.ts` CRUD + invites. Retro-spec also fills the gap that `02-company-and-admin-model.md` never defined workspaces. | same as above |
| `/help` | keep+spec'd | Real support/help surface with proper states. | same as above |
| `/privacy`, `/terms` | keep+spec'd | Static legal pages — required, legitimate, just never inventoried. | same as above |
| `/invite/[token]`, `/groups/join/[token]` | keep+spec'd | Real invite-acceptance flows backed by backend endpoints. | same as above |
| `/sso`, `/login`, `/register`, `/forgot-email`, `/forgot-password`, `/reset-password` | keep+spec'd | Legitimate auth flows. Auth is architecture-spec'd in `08-identity-security-trust.md`; only the screen-inventory rows were missing. | same as above |

## B2 — QuantChat

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/stories` | keep+spec'd | Real: `useStories` → backend; honest empty/error states; text stories post end-to-end. Covered by product spec `products/quantchat/05-…-c06-camera-stories-spotlight-ar.md`. | `products/quantchat/extras/quantchat-extras-retro-spec.md` |
| `/spotlight` | keep+spec'd | Real: engagement-ranked feed computed on backend, 15-min refresh, recommendation fallback. Same product-spec coverage. | same as above |
| `/memories` | keep+spec'd | Real: vault of saved media via `useMemories`, soft-delete + 5s undo, backend-backed. | same as above |
| `/reels` | keep+spec'd | Real: `/api/reels` backend, full uploader + overlay pipeline. | same as above |
| `/map` | keep+spec'd | Real and honest now: starts empty, filled only by `/api/map/friends`; geolocation-denied fallback; no demo friends (the audit's DEMO_FRIENDS fake is gone). Privacy model (ghost mode, selected friends) per product spec. | same as above |
| `/camera` | keep+spec'd | Real camera-first capture pipeline; core surface per product spec ("camera is a core surface, not an attachment picker"). | same as above |
| `/new-chat` | keep+spec'd | Real: contact search + chat creation via `apiClient`. | same as above |
| `/profile` | keep+spec'd | Real: hub for stories/spotlight/memories + settings entry. | same as above |
| `/privacy`, `/support`, `/terms` | keep+spec'd | Static policy/support pages — required. | same as above |
| `/login` | keep+spec'd | Legitimate SSO login entry (QuantMail SSO primary per auth overhaul). | same as above |

## B3 — QuantAI

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/feed` | keep+spec'd | Real: `/api/quanty/feed*` (generate/instructions/paged). Quanty activity feed — in-mission. | `products/quantai/extras/quantai-extras-retro-spec.md` |
| `/goals` | keep+spec'd | Real: `/api/goals` (tracking/done/proposals). In-mission for an AI productivity companion. | same as above |
| `/ideas` | keep+spec'd | Real: `/api/ideas` CRUD + actions. | same as above |
| `/plan` | keep+spec'd | Real: `/api/quanty/plan`. | same as above |
| `/voice` | keep+spec'd | Real: `/api/voice/stt` + `/api/assistant/chat` pipeline. | same as above |
| `/connectors` | keep+spec'd | Real: connector catalog + connections fetch (Muse-screenshot parity screen, user-visible in audit trail). In-mission for an AI agent product. | same as above |
| `/profile` | keep+spec'd | Real profile hub; mounts the (real) Marketplace. | same as above |
| `/ask` | already-resolved | Duplicate chat surface — already deleted (not present in tree; Part A A6 executed by removal wave). | — |
| `components/Marketplace.tsx` | keep+spec'd | Real: `/api/marketplace` list + install/uninstall. In-mission (agent/plugin marketplace). | same as above |
| `components/leaderboard/Leaderboard.tsx` | remove | Fake: hardcoded entries ("Alex Chen", "124,892 agents competing", invented XP/streaks). No backend. | decision only |
| `components/achievements/AchievementSystem.tsx` | remove | Fake: hardcoded `useState` achievement list. No backend. | decision only |
| `components/quests/DailyQuests.tsx` | remove | Fake: hardcoded quest list. No backend. | decision only |
| `components/EcosystemMap.tsx` | remove | Dead: zero mounts anywhere in the app. Props-driven widget with no callers. | decision only |
| `components/community/CommunityHighlights.tsx` | remove | Fake: hardcoded names + "Live activity from 124,892 agents". Fabricated social proof. | decision only |
| `src/pages/` ×13 (`analytics automation code device ecosystem image-gen memory models personas plugins prompts training translate`) | keep+spec'd | Verified clean post-#564: real backend calls (`/api/assistant/chat`, `/api/plugins`, `/api/voice/stt`), local-state history, honest headers ("no fake progress"). All in-mission for an AI workbench. | same as above |

## B4 — QuantGram

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/games`, `/game/[id]` | keep+spec'd | Real: backend `backend/routes/games.ts`; props/SSR-fed game hub + player HUD (score/level/lives). In-mission for a social/entertainment app. | `products/quantgram/extras/quantgram-extras-retro-spec.md` |
| `/shopping` (`/shop` already gone) | keep+spec'd | Real: `/api/shopping/products|cart|checkout`; audit's MOCK_PRODUCTS already replaced — header documents the honesty fix. Keep `/shopping` as canonical; `/shop` already removed. | same as above |
| `/map` | keep+spec'd | Real: story-location pins via `features/map/social-map` + `SocialMapView`; no fake markers found. (Data-pipeline review recommended in spec.) | same as above |
| `/notes` | already-resolved | Not present in tree and no deletion record — never shipped; no action. | — |
| `/collab` | remove | Fake: hardcoded `MOCK_COLLABS`, `MOCK_PENDING`, `MOCK_SEARCH` arrays served as content. | decision only |
| `/broadcast` | already-resolved | Not present in tree and no deletion record — never shipped; no action. | — |
| `/close-friends` | keep+spec'd | Real: exclusive-story-mode + user search with proper refetch states. In-mission (Instagram-parity social). | same as above |
| `/guides` | already-resolved | Not present in tree and no deletion record — never shipped; no action. | — |
| `/highlights` | remove | Fake: hardcoded `MOCK_HIGHLIGHTS` + `MOCK_AVAILABLE`. | decision only |
| "QuantNeon" source headers | noted (structure wave) | `src/pages/index.tsx` header says "QuantNeon" while product is QuantGram. Rename cleanup belongs to the structure track, not this decision. | — |

## B5 — QuantWave

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/bookmarks` | keep+spec'd | Real: `useQuery(['bookmarks'])` → backend via `quantSyncAPI.getBookmarks()`. Standard social surface. | `products/quantwave/extras/quantwave-extras-retro-spec.md` |
| `/spaces` | keep+spec'd | Real: backend-backed group/listening spaces. In-mission for an audio-social app. | same as above |
| `backend/routes/radar.ts` (`x-user-id`) | keep+spec'd | Real proximity feature; the P0 impersonation issue is a **fix**, not a removal — file already carries a fail-closed guard comment; security fix stays in the fix queue. | same as above |

## B6 — QuanTube

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/podcasts` | remove | Fake: hardcoded `MOCK_PODCASTS` + `MOCK_EPISODES` served as the whole surface. | decision only |
| `/shows` | keep+spec'd | Real: backend-backed show catalog with genre filtering and error/retry states. In-mission for a video app. | `products/quantube/extras/quantube-extras-retro-spec.md` |
| `/playlist/[id]` | keep+spec'd | Real: `/api/playlists/{id}` via react-query; audit's mock loader already replaced. | same as above |
| Fake-data cluster (fabricated live chat, simulated viewer/bitrate/fps, fake search, theatrical transcoding, mock music product, "TechVision" error masking) | referred → fix queue (P0) | Per disposition guidance, fake-data clusters go to the fix queue, not the removal list. Surfaces are real; the *data* must be made real. | fix queue |

## B7 — QuantMax

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/challenges` | keep+spec'd | Real: `useChallenge` → backend (challenges, submissions, leaderboard). Creator-engagement inside dating — plausible for a social-dating app. | `products/quantmax/extras/quantmax-extras-retro-spec.md` |
| `/create` | keep+spec'd | Real: short-video creator studio (speed/timer/duration/font/color options). In-mission for short-form social dating. | same as above |
| `/creator-fund` | remove | Hollow: explicit placeholder ("wire real endpoints first, then replace the placeholders"); no backend. Not real, not working. Re-propose when endpoints exist. | decision only |
| `/group-rooms` | keep+spec'd | Real: `useGroupRooms` (browse/join/leave/chat/mute/camera). In-mission social dating. | same as above |
| `/videochat` | remove | Fake: simulated random "User{N}" match, fake country, fake avatar CDN URLs. Fabricated matching. | decision only |
| `/profile-detail` | keep+spec'd | Real: honest empty state, fills with real content when loaded ("never fake tiles"). | same as above |

## B8 — QuantCooks

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/brand-kit` | keep+spec'd | Real: `/api/brand-kit` CRUD. In-mission for a creator/design tool. | `products/quantcooks/extras/quantcooks-extras-retro-spec.md` |
| `/collaborate` | keep+spec'd | Real: `/api/collaboration/*`. In-mission. | same as above |

## B9 — QuantAds

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `/economy`, `/economy/wallet`, `/economy/store`, `/economy/boost`, `/economy/creator`, `/economy/subscriptions` | keep+spec'd | Real: backend endpoints + fetch; honestly gated ("coming soon") where no durable endpoint/rail exists yet — headers document no-mock policy. Economy UI is legitimate for an ads/monetization product; ledger ownership follows the K11 decision (`@quant/credits` canonical ledger, apps consume). | `products/quantads/extras/quantads-extras-retro-spec.md` |

## B10 — Backend extras

### QuantMail backend

| Extra | Verdict | Rationale | Spec location |
|---|---|---|---|
| `routes/ai-devtools.ts` (code-review, commit-message, pr-description, ci-fix, code-search, security-scan) | keep+spec'd | Real services; note to consolidate with ci-healing paths rather than duplicate. | `products/quantmail/extras/quantmail-backend-extras-retro-spec.md` |
| `routes/e2ee.ts` + `lib/e2ee-relay.ts` | keep+spec'd | Real E2EE ciphertext relay seam for `@quant/encryption`; `08` covers encryption but not this relay. | same as above |
| `routes/workspaces.ts` | keep+spec'd | Real workspaces CRUD + invites backing the `/workspaces` UI. | same as above |
| `routes/contact-groups.ts` | keep+spec'd | Real Telegram-style contact groups; complements `people-api.md` participant context. | same as above |
| `routes/email-templates.ts` | keep+spec'd | Real templates CRUD + render. In-mission for mail. | same as above |
| `routes/quanty-mcp.ts` | keep+spec'd | Real Quanty MCP connections. In-mission per `06-ai-quanty-platform.md`. | same as above |
| `routes/dav.ts` (+ `/.well-known/caldav\|carddav`) | keep+spec'd | Real CalDAV/CardDAV protocol servers (588 lines). Sensible for a mail provider (interop). | same as above |
| `routes/ai-services.ts` (`/infra/*`: aliases, disposable addresses, strip-trackers, pgp, undo-send job API) | keep+spec'd | Real mail-utility APIs. In-mission. | same as above |
| AI endpoints beyond quanty tool specs (triage, followup, unsubscribe, send-time, style analyze/draft, attachment-summary) | keep+spec'd | Real AI mail-intelligence endpoints; extend the quanty tool contract in spec. | same as above |
| `modules/company/` (agent-workforce) | keep+spec'd (relocate) | Real, but a **structure violation**: company-plane code inside the mail backend. Keep the capability; relocation to company-plane tracked by the structure track (K14 shape). | same as above |
| `modules/billing/` | keep+spec'd (relocate) | Real; per the K11 `economy-single-ownership` decision it is already a compat shim over `@quant/credits`. Relocation tracked by structure track. | same as above |
| `modules/code/` (parallel git-hosting stack) | keep+spec'd (relocate) | Real git hosting; mail owns git *integration* per spec, not hosting. Relocation tracked by structure track. | same as above |

### Other apps' backend extras (verified present; spot-checked real, zero mock markers)

| App | Extra route files | Verdict |
|---|---|---|
| QuantChat | ar-lenses, games, map, spotlight, themes, avatar, polls, reels, e2ee-prekeys/encryption/prekeys, ephemeral, voice-bot, voice-notes, memories, ai-agent/ai, federation, settings, search, users, notifications (34 route files) | keep+spec'd (group) |
| QuantAI | ab-testing, cdn, cache, flux-styles, image-inpainting, image-wizard, video-generation, goals, marketplace, quant-tools, quantos, training, versioning, voice-flows, browser-agent, code-agent, payments, recommendations, scaling, mcp-connectors, project-context, projects, prompt-templates, swarm, collaboration, events, analytics, permissions, personal-agent, user-owned-ai, federation, file-library, extractor, engine, sessions, quanty-feed, quanty-ideas (62 route files) | keep+spec'd (group) |
| QuantGram | ar-lenses, games, shopping, filters, dm, explore, federation, ai | keep+spec'd (group) |
| QuantWave | anonymous, pk-battle, radar, ai | keep+spec'd (group) |
| QuanTube | cross-publish, music, segments, history, payments, feed, ai, interactions | keep+spec'd (group) |
| QuantMax | commerce, economy, random-chat, squads, videochat, swipes, feed, payments, ai | keep+spec'd (group) |
| QuantCooks | auto-edit, brand-kits, effects, collaboration, ai | keep+spec'd (group) |
| QuantAds | boost, gifting, creator-economy, store, subscriptions, privacy-ads, publisher-payout, serving, ai | keep+spec'd (group) |

Per-app backend extras are recorded in the product extras files at summary level;
full endpoint-by-endpoint contracts remain the job of `18-backend-spec-template.md`
follow-ups, not this decision.

## B11 — Structure-level

| Extra | Verdict | Rationale |
|---|---|---|
| `apps/{7 apps}/src/mobile/` (13 platform-capability files ×7, byte-identical) | keep+spec'd (consolidate) | Real device capabilities; duplication is the problem, not the code. Decision: consolidate into one `@quant/mobile-*` platform package per the charter. Relocation tracked by structure track. (quantmax has no `src/mobile`.) |
| `services/imap-server`, `services/smtp-submission` | keep+spec'd | Sensible for a mail provider; spec'd retroactively in the mail backend extras file. |
| `packages/payment` vs `packages/payments` | already-resolved | Only `payments` exists in tree; #591 merged `payment`→`payments`. No action. |
| `packages/recommendation` vs `packages/recommendations` | already-resolved | Only `recommendations` exists in tree. No action. |
| Economy sprawl (payments/credits/quant-economy/creator-economy/quant-commerce) | already-decided | Decided by `decisions/economy-single-ownership.md` (K11, 2026-10-08): two canonical owners (`@quant/credits` ledger, `@quant/payments` money movement); `creator-economy`/`quant-economy` deprecated with phased fold. This log defers to that decision. |
| 8 platform packages (`data-plane`, `cache`, `cdn`, `scaling`, `events`, `search`, `payment`→`payments`, `recommendation`→`recommendations`) with one consumer (QuantAI) | keep+spec'd (adopt) | Built but unadopted; platform ownership is per charter. Decision: keep; adoption across the other 8 apps tracked separately (not a removal). |

---

## Verdict totals

| Verdict | Count |
|---|---|
| keep+spec'd | 96 |
| remove (marked; deletion = separate code wave) | 10 |
| needs-user-decision | 1 |
| already-resolved / already-decided elsewhere | 8 |
| referred to fix queue (P0) | 1 cluster |

### Remove list (for the code wave)

1. QuantAI `components/leaderboard/Leaderboard.tsx` — hardcoded fake leaderboard.
2. QuantAI `components/achievements/AchievementSystem.tsx` — hardcoded fake achievements.
3. QuantAI `components/quests/DailyQuests.tsx` — hardcoded fake quests.
4. QuantAI `components/EcosystemMap.tsx` — dead, zero mounts.
5. QuantAI `components/community/CommunityHighlights.tsx` — fabricated "live activity".
6. QuantGram `src/pages/collab.tsx` — hardcoded `MOCK_COLLABS`/`MOCK_PENDING`/`MOCK_SEARCH`.
7. QuantGram `src/pages/highlights.tsx` — hardcoded `MOCK_HIGHLIGHTS`/`MOCK_AVAILABLE`.
8. QuanTube `src/pages/podcasts.tsx` — hardcoded `MOCK_PODCASTS`/`MOCK_EPISODES`.
9. QuantMax `src/pages/creator-fund.tsx` — unwired placeholder, no backend.
10. QuantMax `src/pages/videochat.tsx` — simulated fake matching.

### Needs-user-decision

- **QuantMail `/postcards`** — a real, working 820-line postcard creative studio
  (localStorage-backed) living inside the mail app with no backend and no
  mail-mission fit. Options: (a) keep as a mini-app surface, (b) move to
  QuantCooks (the creator tool), (c) remove. Product-direction call — not guessed here.

---

## Notes for follow-up tracks

- `12-screen-inventory.md` is stale relative to shipped reality in at least two
  places: QuantChat C01–C13 (messaging-only) vs the product spec's Snapchat-class
  pillar, and QuantMail M01–M20 vs M21–M38 (separate doc files exist with no
  inventory rows — the audit's own noted numbering gap). Inventory reconciliation
  is a docs-track follow-up.
- Per-product backend extras (B10 group rows) need endpoint-level contracts via
  `18-backend-spec-template.md` — recorded as follow-up, not done here.
- The QuanTube fake-data cluster and QuantWave `radar.ts` hardening stay in the
  fix queue (P0), not the removal list.
