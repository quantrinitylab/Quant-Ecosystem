# ECOSYSTEM FRONTEND UNIFICATION + AI-AGENTIC LAYER

## Cross-app deep audit, verified May 29, 2026 (every app scanned screen-by-screen against the live tree)

> Kiro: I audited all 13 product apps screen-by-screen and feature-by-feature. The backends are
> largely real (Prisma, authz, services). The **frontends share one systemic disease**: rich screens
> and components were built, but they are inconsistently routed, off-brand/unstyled, not wired to a
> reachable backend, and the AI-agentic control layer is not connected. This document turns every
> finding into ordered phases. Goal: make every screen of every app **branded, wired, real-time,
> accessible, 60fps, and AI-operable.**
>
> **Conflict rule (mandatory):** ONE app per PR. Only one PR at a time may touch shared foundations
> (`packages/shared-ui`, `packages/brand`, `packages/api-client`, root config). Rebase on latest
> main before each PR. Small PRs, merged frequently.

---

## A — VERIFIED ECOSYSTEM SCORECARD

| App | Scope | Screens | Backend (tests) | Wiring | Brand/style | Functional |
| --- | --- | --- | --- | --- | --- | --- |
| QuantAI | AI hub | 14 | strong (6) | ✅ 22 Next routes | branded (chat only) | ~50% |
| QuantMail | Gmail+GitHub | 13 | strong (31) | 🟡 only `/api/drive/*` exist | 2-gen split | ~40% |
| QuantChat | Snapchat | 13 | real (6) | 🟡 baseUrl=remote, no token | 2-gen split; **WS client unused** | ~35% |
| QuantTube | YouTube+Spotify | 15 | big (7) | 🟡 apiClient, no Next routes | mixed bespoke | ~40% |
| QuantMax | TikTok+Tinder+Omegle | 14 | real (3) | 🟡 | mixed | ~35% |
| QuantNeon | Instagram | 19 | thin (2) | 🟡 | mixed | ~35% |
| QuantEdits | CapCut | 9 | thin (3) | 🟡 | mixed | ~35% |
| QuantSync | Twitter/Reddit | 17 | thin (3) | ❌ 0 Next routes, all `/api/*` 404 | ❌ 0 shared-ui | ~20% |
| QuantAds | Ad platform | 12 | solid (4) | ❌ 0 Next routes | ❌ 0 shared-ui | ~20% |
| QuantCalendar | Calendar | 1-2 | strong | 🟡 2 routes | ✅ clean | shallow |
| QuantDocs | Docs | 1-2 | strong (Yjs) | 🟡 2 routes | ✅ clean | shallow |
| QuantDrive | Drive | 1-2 | strong | ✅ routes exist | ✅ clean | shallow |
| QuantMeet | Meet | 1-2 | strong (LiveKit) | 🟡 2 routes | ✅ clean | shallow |

### The 7 systemic problems (apply across apps)
1. **Wiring broken:** `api-client` baseUrl hardcoded (`localhost:3001`, `localhost:3010`, or `https://chat.quant.app/api`); token never set in `app-providers`; many screens fetch `/api/*` Next routes that don't exist (QuantSync 83, QuantAds 39, QuantChat 31). → most screens load no data.
2. **Inconsistent routing:** 3 hybrid (ai/chat/mail — App + Pages, no `_app.tsx`), 6 Pages-only (sync/ads/neon/tube/max/edits), 4 App-only (calendar/docs/drive/meet). 9 apps have no shared shell.
3. **Off-brand / unstyled:** QuantSync & QuantAds use 0 `@quant/shared-ui`; others use bespoke CSS class names that are defined in no stylesheet → render unstyled. Brand applied to library, not screens.
4. **Real-time dead / orphaned infrastructure:** the hard real-time pieces are built in backends but NOT wired into any UI:
   - QuantChat's `QuantChatWSClient` (330 LOC, reconnect logic) → wired into nothing (no live messages/typing/presence).
   - **QuantMeet: LiveKit is in 8 backend files but 0 references in `src/`** → ParticipantGrid/VideoTile/ControlBar/PreJoinLobby are UI shells with **no real video**.
   - **QuantDocs: Yjs is in 12 backend files but 0 references in `src/`** → DocEditor/PresenceBar/CommentsPanel have **no real live collaboration**.
   The defining feature of each of these apps (live chat, video calls, collaborative editing) does not actually work despite the infra existing.
5. **AI-agentic gap:** QuantAI backend has cross-app-orchestrator + tool + agent-marketplace services, and `packages/quant-tools` exists (85 tools), but the UI does not let QuantAI actually execute tools across apps. The control layer isn't connected.
6. **Faked streaming:** `useAIChat` simulates streaming with `setInterval` instead of real SSE/token streaming.
7. **Orphaned richness:** every app has rich components (EmailComposer, StoryViewer, Timeline/Canvas, SwipeStack, AuctionViewer, ARCamera) that are not fully wired into screens.

---

## B — PHASES (ordered; one app per PR within each phase)

### PHASE 66.2 — Single API client + auth + env (foundation, do FIRST, one PR)
- In `packages/api-client` (or per-app `api-client.ts`): baseUrl from `NEXT_PUBLIC_API_URL` per app; remove all hardcoded `localhost`/remote URLs.
- Central auth: on login store tokens; `apiClient.setTokens()`; wire into every app's `app-providers`; auth guard → `/login`.
- Remove every `localStorage.getItem('token')` raw-fetch auth path; route all data through the typed client.
- **Gate:** no hardcoded base URLs; token set after login in all apps; `grep "localStorage.getItem('token')"` → 0.

### PHASE 66.3 — Build every missing Next API route (mirror QuantDrive/QuantAI)
For each app, create `src/app/api/*` route handlers that proxy to the app's Fastify backend with the bearer token, covering every endpoint the screens call. Priority by breakage:
1. **QuantSync** (0 routes; needs feed, posts/[id]/{like,repost,bookmark}, communities, spaces, trending, notifications, search, polls)
2. **QuantAds** (0 routes; campaigns, auctions, audiences, creatives, analytics, fraud, billing, pixels)
3. **QuantChat** (conversations, messages list/send, calls, typing, reactions, read-receipts)
4. **QuantMail** (emails CRUD/search/batch/snooze, threads, folders, contacts, calendar, repos, pulls, issues, ci, security, admin)
5. QuantTube / QuantMax / QuantNeon / QuantEdits (videos, shorts, music, live; matches/swipe/speed-dating; reels/stories/shop; projects/assets/export)
- **Gate per app:** every screen's data call resolves to an existing route; 0 `404` data paths in an E2E crawl.

### PHASE 66.4 — Unify on App Router + shared shell (per app, one PR each)
- Standardize every app on App Router. Add a real shell layout (Sidebar/TopBar/BottomNav from `@quant/shared-ui`) wrapped in `AppProviders` (ThemeProvider + Cmd+K + brand). Real nav between all sections.
- Migrate Pages Router screens into `src/app/<route>/page.tsx`. Delete `src/pages/` when empty.
- Fix login/register to be real route pages (default export) wired to the client.
- **Gate per app:** single router; every screen reachable via nav; shared shell + theme on every screen; no orphaned routes.

### PHASE 66.5 — Brand + restyle every screen (per app)
- Replace bespoke undefined CSS classes with `@quant/shared-ui` components + Tailwind/brand tokens. Priority: **QuantSync, QuantAds** (0 shared-ui today), then all bespoke-heavy screens.
- Every screen: skeleton/empty/error/success states, dark mode, responsive 360→1440, safe-area, 60fps.
- Wire orphaned rich components into their screens (EmailComposer→/compose, StoryViewer→stories, Timeline→editor, SwipeStack→matching, AuctionViewer→ads, ARCamera→camera).
- **Gate per app:** 0 undefined CSS classes; every screen uses brand; Lighthouse ≥90; axe 0 violations; visual regression baseline.

### PHASE 66.6 — Real-time everywhere (WS wiring)
- Wire QuantChat's `QuantChatWSClient` into `useMessages`/typing/presence → live messages, typing indicators, read receipts, online status.
- **QuantMeet: wire LiveKit client into the UI** (PreJoinLobby device preview, ParticipantGrid tracks, ControlBar mute/camera/screen-share) → real video calls.
- **QuantDocs: wire Yjs into DocEditor** (Y.Doc + provider) → real collaborative editing, live cursors/presence (PresenceBar), comments.
- Add live updates where relevant: QuantSync (live feed/comments/trending), QuantTube (live chat/viewer counts), QuantMax (matching/video signaling), QuantAI (streaming).
- **Gate:** 2 clients see live message/typing in QuantChat; 2 users join a QuantMeet call with video flowing; 2 users co-edit a QuantDoc live; live counters update without refresh.

### PHASE 66.7 — Real AI streaming
- Replace `useAIChat` `setInterval` simulation with real SSE/`ReadableStream` token streaming from the AI backend; show streaming state; cancel support.
- **Gate:** real token-by-token stream; cancel works; no setInterval fake.

### PHASE 70.2 — AI-AGENTIC LAYER (make QuantAI operate the whole ecosystem)
This is the founder's "AI agentic" core. Connect the existing `packages/quant-tools` + QuantAI `cross-app-orchestrator` to the UI:
- Every app exposes its core actions as typed tools (compose/send email, post, upload video, create event, start match, edit clip, run campaign…). Auto-register in `quant-tools`.
- QuantAI chat can plan + execute multi-app tool calls ("find the file in Drive, attach to an email, send to Riya, add a follow-up to Calendar") with permission tiers, cost preview, confirm-on-write, undo, and audit (the engine exists — wire it).
- Surface agent actions in each app's UI (an "Ask Quant" affordance + activity/audit view).
- Wire WorkflowBuilder + EcosystemMap screens to real automations (`quant-automate`) and the cross-app orchestrator.
- **Gate:** QuantAI executes a real multi-app plan across ≥3 apps in staging, every step confirmed/audited/undoable; an "Ask Quant" action works inside ≥3 apps.

---

## C — PER-APP QUICK FIX NOTES (uniques beyond the systemic phases)
- **QuantAI:** real streaming (66.7); wire model `<select>` onChange to model router; wire history/settings nav; connect WorkflowBuilder/EcosystemMap/PersonaCreator to backend; this app leads the agentic layer (70.2).
- **QuantMail:** see `QUANTMAIL_WIREUP_AND_UNIFY.md` (Phase 66.1) — full detail there.
- **QuantChat:** wire WS client (66.6); fix baseUrl; BottomNav tab nav; migrate 11 Snapchat screens; wire StoryViewer/ARFilters/VideoCall/SnapMap.
- **QuantSync:** biggest lift — adopt shared-ui from scratch, build all Next routes, wire feed/like/repost/bookmark/communities/spaces.
- **QuantAds:** adopt shared-ui, build routes; wire CampaignWizard/AuctionViewer/AudienceBuilder; campaign create→serve→analytics loop.
- **QuantNeon:** wire reels/stories/shop/AR camera; restyle bespoke screens.
- **QuantTube:** wire VideoPlayer/MusicPlayer/Shorts/LiveChat to backend; studio/monetization flows.
- **QuantMax:** wire SwipeStack/RandomMatcher/VideoChatRoom (matchmaking service); SafetyOverlay must be enforced (minor-safety P0).
- **QuantEdits:** wire Timeline/Canvas/Keyframe/Export to project/asset/export services; real render/export.
- **QuantCalendar/Docs/Drive/Meet:** cleanest frontends (App Router + shared-ui) with the STRONGEST backends (3.9K-5.7K LOC, 9-17 tests each) but only 1-2 screens AND their defining feature isn't live:
  - **QuantMeet** — wire LiveKit (66.6); deepen to grid/speaker/spotlight, breakout, recording, live captions.
  - **QuantDocs** — wire Yjs (66.6); deepen to suggestions, version history, AI sidebar, export.
  - **QuantCalendar** — deepen views (month/week/day/agenda already as components), recurring/RRULE, drag-reschedule, smart scheduling.
  - **QuantDrive** — already the best-wired (routes exist); deepen previews, sharing, search, AI organize.

---

## D — GLOBAL HARD GATES (no app "done" until all true for that app)
- Single router; shared shell + theme + brand on every screen; nav reaches every screen.
- Every data call hits an existing route (Next `/api/*` or apiClient→backend); 0 `404` in E2E crawl.
- 0 hardcoded base URLs; single auth via apiClient; login works end-to-end.
- 0 undefined CSS classes; `@quant/shared-ui` everywhere; Lighthouse ≥90; axe 0; 60fps; responsive 360→1440.
- Real-time live where relevant; real AI streaming (no setInterval fake).
- "Ask Quant" agentic action works in the app; core actions exposed as tools.
- Gates green: typecheck, build (cold-stable), test, lint, audit-high. Playwright E2E click-through, no dead-ends.

## E — EXIT
All 13 apps are one cohesive, branded, fully-wired, real-time, accessible product where every screen
works and QuantAI can operate the whole ecosystem by voice/text. Ecosystem functional level
~20-50% → 90%+. This is the depth that earns "Meta + Google + agentic-internet killer."
