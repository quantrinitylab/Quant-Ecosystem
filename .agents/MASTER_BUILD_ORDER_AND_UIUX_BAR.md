# MASTER BUILD ORDER + SCREEN-BY-SCREEN UI/UX EXCELLENCE BAR

## The single execution bible for Kiro (May 29, 2026)

> Read with: `KIRO_AUTONOMOUS_POLISH_AND_COMPLETE.md` (BLOCK 0 + roadmap),
> `QUANTMAIL_WIREUP_AND_UNIFY.md`, `ECOSYSTEM_FRONTEND_UNIFY_AND_AGENTIC.md`.
> This doc gives (1) the exact sequenced order to execute, and (2) the premium
> UI/UX bar for every screen of every app. Goal: every screen is wired, branded,
> animated, accessible, 60fps — and AI-operable. One app per PR; rebase on main first.

---

## PART 1 — SEQUENCED EXECUTION ORDER (do in this order)

### Wave 0 — Foundation (serial, one PR each, blocks everything)
1. **62.1** Deterministic build/typecheck (turbo outputs + concurrency + composite refs). 3 cold runs green.
2. **62.2** Honest state files + `verify-state` CI.
3. **66.2** Single `api-client`: baseUrl from `NEXT_PUBLIC_API_URL`, token set on login, kill `localStorage` token + hardcoded URLs. (Shared foundation — must land before per-app work.)
4. **67.x** Brand pass on `@quant/shared-ui` + `@quant/brand`: ensure every primitive (AppShell, Sidebar, TopBar, BottomNav, Card, lists, inputs, modals, motion) is brand-tokened, dark-mode, responsive, reduced-motion-correct (close BUG-3).

### Wave 1 — Per-app: wire + unify + brand (one app per PR, in this priority)
Order by how broken each app is (worst first):
1. **QuantSync** (0 shared-ui, 0 routes) — adopt shared-ui, build Next routes, wire feed.
2. **QuantAds** (0 shared-ui, 0 routes) — same.
3. **QuantMail** (Phase 66.1 full spec) — unify router, build routes, restyle, single auth, wire compose/dead handlers.
4. **QuantChat** — wire WS (live), fix baseUrl, BottomNav, migrate Snapchat screens, restyle.
5. **QuantAI** — real streaming, model selector, migrate 13 screens, lead agentic layer.
6. **QuantTube** → **QuantMax** → **QuantNeon** → **QuantEdits** — wire hooks→routes, restyle, wire rich components.
7. **QuantMeet** (wire LiveKit) + **QuantDocs** (wire Yjs) + **QuantCalendar** + **QuantDrive** — deepen + wire real-time.

Each per-app PR must satisfy: single router + shell, every screen wired (no 404), branded (no undefined CSS), Lighthouse ≥90, axe 0, 60fps, responsive 360→1440, E2E click-through green.

### Wave 2 — Cross-cutting excellence
- **66.6** Real-time everywhere (Chat WS, Meet LiveKit, Docs Yjs, Sync/Tube live).
- **66.7** Real AI streaming (kill setInterval).
- **64.1** Real tests for thin packages (≥15 each).
- **69.0** Vuln remediation. **83.0** `@simulated` labeling of naive core.

### Wave 3 — Agentic
- **70.2** Wire `quant-tools` + cross-app-orchestrator: "Ask Quant" in every app; QuantAI executes multi-app plans (confirm/cost/undo/audit).

### Wave 4 — Then the roadmap continues (Phase 69 hardening → 70-72 → Block 5 features → Block 8 agentic-internet).

---

## PART 2 — UNIVERSAL UI/UX BAR (every screen, no exceptions)
Layout: shared `AppShell` + Sidebar/TopBar/BottomNav; responsive 360/414/768/1024/1440; portrait+landscape; safe-area insets; no layout jump on keyboard.
Motion: spring physics (never linear); entrance fade/slide; list stagger; shared-element list↔detail; button/toggle/like springy + haptic; skeleton→content crossfade; reduced-motion correct.
States: every screen has skeleton, empty (branded illustration + CTA), error (human copy + retry), success. Optimistic UI + rollback for mutations.
Data: real data via apiClient; no mock; no 404; loading priorities (blurhash → full image).
Brand: `@quant/shared-ui` + brand tokens only; per-app accent; beautiful dark mode; animated theme switch; ~44px tap targets; hover/press/focus states.
A11y: axe 0 violations; keyboard navigable; ARIA; contrast AA.
Perf: Lighthouse ≥90; 60fps scroll (mid Android).
Agentic: command palette (Cmd+K) + universal capture (Cmd+Shift+Q) + "Ask Quant" on every screen.

---

## PART 3 — SCREEN-BY-SCREEN UI/UX TARGETS (per app)

### QuantAI (AI hub)
- **Chat**: streaming token bubbles (real SSE), model picker (working), tool-call cards inline (agentic), copy/regenerate/branch, voice toggle, attachment dropzone. Empty = suggested prompts.
- **Voice**: live orb + waveform, captions, barge-in, privacy lamp.
- **Automation/WorkflowBuilder**: drag node canvas, trigger/action/condition nodes, run history, live status.
- **Image-gen**: prompt bar, gallery grid, canvas edit, provenance badge.
- **Personas/Memory/Models/Devices/Plugins/Code/Translate/Ecosystem/Analytics/Training**: each a real CRUD + branded screen; EcosystemMap = live graph of apps + AI toggles.

### QuantMail (Gmail+GitHub)
- **Inbox**: category tabs + unread counts, batch toolbar, star/snooze/label drag, virtualized list, swipe actions (mobile), 3-pane on desktop. Row click → thread.
- **Thread**: collapsible quotes, inline reply/forward, AI summarize/suggest-replies chips, attachments, schedule-send/undo-send.
- **Compose**: rich editor (RichTextEditor), AI compose/tone, attachments, Cc/Bcc, send/draft.
- **Calendar/Contacts/Drive(in-mail)**: full views (below).
- **Repos/Repo/PRs/Pipelines/Reviews/Issues (GitHub side)**: repo browser + file tree + code view (syntax highlight), PR diff with comments, CI pipeline graph (live), issue board, code review UI.
- **Security/Settings/Admin/Login/Register**: real auth flows, 2FA, OAuth consent screen (this is the ecosystem IdP).

### QuantChat (Snapchat)
- **Chat list**: avatars, presence dots, streaks, unread, swipe actions; working BottomNav.
- **Conversation**: live messages (WS), typing presence, read receipts, reactions, voice notes, disappearing timer, media, AR/camera attach.
- **Stories/Spotlight/Discover**: full-screen vertical viewer, progress bars, reactions/replies; story ring rail.
- **Snap Map**: live map, friend bitmoji pins, location sharing.
- **Camera/AR/Bitmoji/Calls/Memories/Profile/Settings**: real camera + AR filter gallery, video call UI (grid), memories grid.

### QuantSync (Twitter/Reddit)
- **Feed**: post composer, infinite feed, like/repost/bookmark (optimistic), polls, threads, quote, media, communities switcher.
- **Trending/Communities/Spaces/Search/Lists/Notifications/Bookmarks/Verification/Anonymous/Profile**: live trending sidebar, community pages, audio Spaces room (live), verified badges.

### QuantNeon (Instagram)
- **Feed/Reels**: vertical reels player (autoplay, gestures), feed grid, double-tap like, stories ring.
- **Camera/AR/Shop/Stories/Close-friends/Broadcast/Games/Collab/Explore/Profile/Highlights**: AR try-on, shoppable tags, explore masonry grid, mini-games.

### QuantTube (YouTube+Spotify)
- **Watch**: video player (chapters, captions, quality), comments, recommendations rail, like/subscribe.
- **Shorts/Live/Music/Podcasts/Studio/Monetization/Library/Premium/Channel/Playlist**: shorts vertical player, live chat, music player with queue, creator studio dashboards.

### QuantMax (TikTok+Tinder+Omegle)
- **Feed**: vertical video feed, gestures, gifts.
- **Matching/Swipe**: swipe stack (spring physics), match modal, SafetyOverlay (enforced).
- **Live/VideoChat/SpeedDating/Nearby/GroupRooms/Matches/Virtual-dates/Creator-fund**: random match video UI, date timer, safety controls.

### QuantEdits (CapCut)
- **Editor**: timeline (multi-track, drag/trim), canvas preview, layers, effects/transitions, keyframes, green-screen, AI tools, export dialog with progress.
- **Templates/Assets/Projects/Brand-kit/Collaborate/Canvas/Export**: template gallery, asset library, project grid, live collab.

### QuantCalendar / QuantDocs / QuantDrive / QuantMeet
- **Calendar**: month/week/day/agenda/year, drag-reschedule/resize, recurring (RRULE), color calendars, quick-create NL, mini-calendar.
- **Docs**: live collaborative editor (Yjs), presence cursors, comments, suggestions, version history, AI sidebar, export, doc list/folders.
- **Drive**: grid/list/columns browser, drag-drop upload (progress), previews (image/pdf/video/code), sharing/permissions, search, trash, storage bar.
- **Meet**: pre-join lobby (device preview, blur), in-meeting grid/speaker/spotlight (real LiveKit video), screen share, chat, reactions, raise hand, recording, breakout, live captions, post-meeting AI notes.

---

## PART 4 — DEFINITION OF "BEST" (per screen, before it ships)
Wired (real data, no 404) · Branded (shared-ui + tokens, no undefined CSS) · Animated (spring, stagger,
transitions, reduced-motion) · All states (skeleton/empty/error/success) · Responsive 360→1440 + safe-area ·
A11y (axe 0, keyboard, AA) · 60fps · Real-time where relevant · Cmd+K + Ask-Quant present · E2E passes.
If any is false → not done.
