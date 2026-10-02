---
title: Flutter Omni-Presence — Unified Cross-Platform Client Design
date: 2026-10-02
status: Draft — awaiting user review
supersedes: docs/superpowers/specs/2026-09-28-cross-platform-strategy.md
---

# Flutter Omni-Presence: One Client for Every Device

## 0. Status & Supersession

This document **supersedes** `2026-09-28-cross-platform-strategy.md`, which proposed wrapping
the React/Next.js web core in Capacitor (mobile) and Tauri (desktop) shells behind a
`@quant/platform` adapter. That strategy is retired. The `apps/quant-mobile` (Capacitor+React)
and `apps/quant-desktop` (Tauri) shells it depended on have already been removed from `main`
in the 2026-10-02 infra teardown. This spec replaces WebView-wrapping with **native Flutter
rendering** as the single client for iOS, Android, web, Windows, macOS, Linux, tablet, foldable.

This is a design/architecture document. **No Flutter code, scaffolding, or dependency has been
created.** Implementation begins only after this spec is approved and a plan is written.

## 1. Decision & Scope

**Decision (user-made):** adopt Flutter as the unified "omni-presence" client for the whole
9-product ecosystem (the apps enumerated below; QuantGit/Drive/Calendar/Contacts are surfaces
inside QuantMail). Write the UI once in Dart; render natively on every device class.

**Why now:** the teardown already deleted the fragmented client layer — the Capacitor mobile
shell, the Tauri desktop shell, the marketing/admin/trinity shells, and the pnpm/turbo monorepo
infra. `origin/main` now carries **9 product web apps + their backends + one Kotlin/Compose
Android app** (`android-project/`). Rather than rebuild five per-platform shells, we converge on
one Flutter client. The timing is deliberate: we are not discarding a working client layer — that
layer was just removed.

**In scope:** the entire presentation/client layer for all products — QuantMail, QuantChat,
QuantGram, QuantUbe, QuantMax, QuantWave, QuantAI, QuantCooks, QuantAds, and the
QuantGit/Drive/Calendar/Contacts surfaces inside QuantMail.

**Out of scope (survives unchanged):** the backend. Fastify 5 / Node-TS services, Prisma/Postgres,
Redis/BullMQ, REST+OpenAPI, Bearer-JWT auth, the `/ws` realtime gateway, the `/collab` Yjs
protocol, and LiveKit SFU all stay. Flutter is a new consumer of the same contracts the web apps
use today.

**Explicitly NOT replaced by Flutter:** public SEO/marketing pages (stay server-rendered Next.js)
and a small register of "hard web surfaces" (§5) that remain Next.js embedded in WebViews.

## 2. Verified Current-State Architecture (grounded in origin/main)

### 2.1 What exists on `main` today
- **9 product apps** under `apps/` (quantads, quantai, quantchat, quantcooks, quantgram,
  quantmail, quantmax, quantube, quantwave) — Next.js (App Router) front-ends whose
  `app/api/*/route.ts` files are thin proxies (`proxyToBackend(...)`) to Fastify "engine"
  backends. The API surface faithfully maps real backend features.
- **One native client:** `android-project/` — native **Jetpack Compose (Kotlin)**, actively
  edited by a concurrent agent (do NOT touch). The sole surviving native surface after teardown.
- **Shared packages intact:** `packages/brand` (design tokens, dependency-free), `packages/
  shared-ui` (React component library), `packages/ai` (real multi-model engine),
  `packages/agent-runtime` (12 agent pilots + orchestrator), and peers.
- **Infra removed on main:** `pnpm-workspace.yaml`, `turbo.json`, `vitest.config.ts`, `patches/`,
  `.husky/`. `package.json` still references them (expected intermediate state). **Any Flutter
  workspace must be self-contained and must NOT depend on the pnpm/turbo graph.**

### 2.2 Contracts the Flutter client must speak (verified)
- **Auth:** `POST /auth/login` returns a **body** token (access 3600s / refresh 2592000s).
  `/auth/refresh` is **cookie-only and unusable by a native client** — use the non-browser
  body-token path (`backend/__tests__/oauth-non-browser-compat.test.ts`). Envelope
  `{success,data,error}`, base `/api/v1`. Single-flight refresh in `packages/api-client/src/core/
  http-client.ts`.
- **Realtime:** `/ws` gateway (`services/ws-gateway/src/main.ts`, `@quant/realtime`), JWT via
  query/header, 64KB frames, 30s heartbeat; event names in `packages/common/src/constants.ts`.
- **Collaboration:** separate `/collab/:docId?token=` **binary** Yjs protocol, server-authoritative
  (`backend/services/yjs-server.ts`; frame `[type:SYNC|AWARENESS][subtype][yjs-binary]`;
  compaction every 200 updates).
- **Calls:** LiveKit SFU (`apps/quantchat/backend/services/sfu.service.ts`).
- **Design tokens:** `packages/brand/src/*` — pure TS, 6 themes (dark/light/neon/bharat/
  highContrast/colorblindSafe), canonical `--quant-*` namespace unified in Wave-0 (`theme-css.ts`
  + `generated/quant-tokens.css` + `generate:tokens` drift guard, merged #344/#345).

### 2.3 Native integration surface
~13 native capability shims per app today (`apps/*/src/mobile/*.ts`): camera, AR, push,
biometrics, haptics, geolocation, share, filesystem. In Flutter these become plugin-backed
`quant_native` services. The desktop VFS (ProjFS/FileProvider) lived in the deleted Tauri shell
and must be re-homed (§6.4).

## 3. Options Analysis ("deep architecture comparison")

The user has decided on Flutter; this section documents the trade space and the recommended
**shape** of that adoption, informed by 2026 production evidence.

### 3.1 Option A — Flutter everywhere + hybrid web (RECOMMENDED)
One Dart codebase renders natively on all six platforms; the few hard web surfaces are embedded
Next.js in WebViews; public SEO pages stay standalone Next.js.
- **Pros:** one UI language, pixel-identical cross-platform, strongest multi-device story
  (mobile+desktop+web+foldable from one tree), native performance via Impeller, real spring physics
  and shader marks. Matches the write-once/many-devices intent exactly.
- **Cons:** Flutter web is a canvas app — poor SEO and document flow (keep those as Next.js); Dart
  has no Yjs CRDT runtime (WebView-embed the collab editor); desktop multi-window still maturing;
  team must learn Dart.

### 3.2 Option B — Flutter for installed apps only; web stays Next.js
Flutter ships iOS/Android/Windows/macOS/Linux; the browser experience remains the existing Next.js
PWA.
- **Pros:** sidesteps every Flutter-web weakness; smaller risk surface.
- **Cons:** two UI codebases forever (Dart + React) — the exact fragmentation we are ending;
  "omni-presence" becomes "most-presence." Rejected as the primary target, but the **natural
  fallback** if Flutter-web PWA quality proves insufficient for a given product.

### 3.3 Option C — React Native / Expo universal
Reuse React skills; Expo + Expo Router + Solito + Tamagui + React-Strict-DOM for web.
- **2026 evidence:** RN's New Architecture (JSI/Fabric/TurboModules/Hermes) is default since 0.76,
  mandatory since 0.82 — old bridge criticisms are obsolete; still heavy use (Discord, MS Office,
  Meta). BUT **Shopify reversed RN→native in Sept 2026** — explicitly NOT for performance ("our RN
  apps are fast") but because AI coding agents erased the shared-codebase cost advantage (Shop app
  rebuilt native in ~12 weeks).
- **Why not chosen:** our problem is client *fragmentation*; RN-Web shares *logic* (60-80%) far
  better than *UI*. Flutter's single rendering system gives tighter cross-device visual parity for a
  design-heavy, 9-product super-app. The React-skills argument is real, but the surviving web apps
  already ARE React (kept for SEO), so those skills don't vanish.

### 3.4 When native-per-platform is right (holdout patterns)
Gmail/Workspace share logic (J2ObjC/GWT) but write UI natively; WhatsApp = native UI + shared C++
core; Apple apps = native. Dropbox and Airbnb retreated from shared mobile code (C++ / RN) over
tooling, hiring, and OS-divergence costs. **Lesson applied:** keep the most platform-divergent,
performance-critical, or deeply-OS-integrated surfaces escapable to native via platform channels —
don't force 100% Dart where a native SDK is the right tool (maps, some camera/AR pipelines, the
Rust VFS).

**Recommendation:** Option A (Flutter everywhere + hybrid web), with Option B as a per-product
fallback and native escape hatches per §3.4.

### 3.5 Production maturity — honest read (2026)
- **Proven at scale (self-reported):** Google Pay (~1.1M LOC replacing ~1.7M, ~70% effort cut),
  Google Classroom (~98% shared mobile code), eBay Motors (98.3% Dart), Nubank (48M customers; chose
  Flutter over RN/KMP in a bake-off), BMW My BMW (one codebase, 96 build variants), Alibaba Xianyu,
  ByteDance (700+ Flutter devs — but NOT TikTok/Douyin themselves).
- **Caveats (design around):** Realtor.com adopted then *reverted* to native (cross-switching cost +
  an outdated Flutter version). Google's 2024 layoffs touched Flutter/Dart; the Flock fork (Oct 2024)
  alleges a lean core team and desktop/web under-investment. Non-Google contributors now outnumber
  Googlers (healthy community, leaner first-party team). Impeller is default on iOS/Android/desktop;
  web still uses Skia/CanvasKit.
- **Net:** Flutter is actively maintained and the most-used cross-platform framework since 2021, but
  mobile gets the most investment; desktop/web are community-load-bearing. Our hybrid strategy hedges
  exactly where Flutter is weakest.

## 4. Target Architecture — the `flutter/` workspace

### 4.1 A self-contained Dart workspace (decoupled from the teardown)
A new top-level `flutter/` directory: a **Dart pub workspace + Melos** monorepo with **zero**
dependency on pnpm/turbo. (Melos now builds on native pub workspaces — Dart 3.6+/Flutter 3.27+.
Coexistence with any surviving Node tooling is fine; the tools key off different manifests, kept at
separate roots.) CI uses `subosito/flutter-action` + `melos exec` for change-based fan-out.

```
flutter/
  pubspec.yaml                 # workspace root (resolution: workspace)
  melos.yaml                   # analyze/test/build fan-out
  packages/
    quant_tokens/              # GENERATED pure-Dart tokens (no Flutter import)
    quant_theme/               # 6 ThemeData + ThemeExtension<QuantTheme> + QuantFlavor
    quant_motion/              # Durations/Curves/SpringDescription + reduced-motion
    quant_adaptive/            # window size classes + layout primitives
    quant_ui/                  # the Quant* widget library (mirrors shared-ui)
    quant_marks/               # brand marks: CustomPainter + FragmentProgram + Rive
    quant_core/                # auth, http (dio), token store, error envelope
    quant_api_<product>/       # OpenAPI-generated dio clients per product
    quant_offline/             # Drift local-first + sync engine
    quant_collab/              # WebView bridge to the Yjs editor
    quant_native/              # camera/push/biometric/geo/share/haptics plugins
    quant_i18n/                # ARB/intl + Indic/RTL
    features/<product>/        # per-product feature packages
  apps/
    quant/                     # flavor entrypoints main_<app>.dart + a super-app
```

### 4.2 Flavors & entrypoints
Per-product flavor entrypoints (`main_quantchat.dart` …) plus a unified super-app entry. Per-app
branding is a **runtime** flavor (a user crosses Mail→Chat→Feed in one binary), not a build flavor:
carry `appColor`/`appHue` in `QuantTheme` and patch `ColorScheme.tertiary` per section. Android maps
to the existing `flavorDimensions "app"`; iOS schemes; `--dart-define` for build-time pins.

## 5. The Hybrid-Web Crux — hard-surface register

Flutter renders to a canvas, not the DOM. Five surfaces are therefore **kept as Next.js embedded in
a WebView** (`webview_flutter` on mobile/desktop; `HtmlElementView`/iframe on Flutter web), bridged
through `quant_collab`/`quant_native`:

| Hard surface | Why Flutter struggles | Strategy |
|---|---|---|
| Yjs CRDT docs (Drive) | no Dart Yjs runtime; server-authoritative binary protocol | WebView-embed the existing Next.js collab editor; Flutter chrome around it |
| Rich contentEditable composer | Flutter reimplements text editing, not browser contentEditable | WebView for the WYSIWYG composer; native Flutter elsewhere |
| HTML email body rendering | Flutter can't render arbitrary HTML/CSS (flutter_html partial) | WebView renders the email body (standard email-client pattern) |
| Live terminal (QuantGit/code) | xterm.js / PTY streaming | WebView-embed the terminal |
| Public SEO/marketing/help | Flutter web has no real SEO | Keep as standalone server-rendered Next.js (not embedded) |

Everything else — feeds, chat, calls, mail triage list, calendar, contacts, dashboards, settings,
auth, AI chat — is **native Flutter**. The register is deliberately small and each item is
independently revisitable as Flutter/Dart tooling matures.

## 6. Dart Technical Stack

| Concern | Choice | Rationale |
|---|---|---|
| State + DI | **Riverpod v2** | compile-safe, testable, no BuildContext coupling |
| Routing | **go_router** | declarative deep links across products |
| HTTP | **dio** + OpenAPI-generated dart-dio clients | generate from `apps/*/openapi.yaml`; single-flight refresh interceptor |
| Auth storage | **flutter_secure_storage** (+ flutter_appauth/oauth2) | Keychain/Keystore; body-token path (not cookie refresh) |
| Realtime | **web_socket_channel** | `/ws` + the binary `/collab` frames |
| Calls | **livekit_client** | native LiveKit SFU client |
| Offline/local-first | **Drift** (SQLite) | typed, migratable; not Isar |
| Background | **workmanager** | upload / pre-transcode / sync |
| Push + local notif | **firebase_messaging** + **flutter_local_notifications** | |
| i18n | **gen_l10n** (ARB) | greenfield — no i18n exists today |
| Observability | **sentry_flutter** | crash + perf |
| Monorepo | **Melos + pub workspaces** | self-contained, decoupled from pnpm/turbo |

### 6.4 Desktop VFS re-home
The ProjFS/FileProvider virtual filesystem (deleted with the Tauri shell) is re-homed as a **native
plugin behind FFI (flutter_rust_bridge)** — keep the Rust VFS core, drive it from Flutter. Not a Dart
rewrite; not a return to Tauri.

### 6.5 Backend touch-ups (small, additive)
- Emit per-product `openapi.yaml` for dart-dio codegen (most routes already typed).
- Confirm **multipart** upload parity for native (web uses FormData).
- The non-browser body-token refresh path already exists — document it as the official mobile
  contract (no new auth work).

## 7. Design System Port — UI/UX ("deep uiux plan")

### 7.1 Tokens → Dart via codegen (single source of truth)
Extend the existing `generate:tokens` + drift-guard pattern to emit `quant_tokens.dart` from the
**same** `packages/brand` TS source. A designer changing `primary.500` can never desync the Flutter
client. Collapse the three legacy web namespaces (`--brand-*`/`--quant-*`/`--qt-*`) to **one** Dart
set from the canonical `--quant-*` layer. **Drop the RGB-triplet encoding** — Dart `Color` composes
alpha natively (`const Color(0xFFFF8C42)`), so the triplet workaround the web needs is dead weight.

### 7.2 Six themes → six `ThemeData` (NOT `fromSeed`)
Construct each `ColorScheme` field-by-field to preserve the contrast-tuned hex (seed-derived tones
would overwrite deliberate values, e.g. `destructive #DC2626` chosen for 4.83:1 on dark). Map the 14
semantic slots to M3 roles; everything M3 lacks (surfaceElevated, muted, focusRing, aiContext,
per-app appColor, motion, radius) rides in a `ThemeExtension<QuantTheme>` that implements `lerp` so
theme switches animate. Six themes selected at runtime via a `QuantThemeId` enum (shared_preferences);
`ThemeMode.system` maps OS brightness to dark/light.

### 7.3 Motion
`motion.ts` → `QuantMotion`: durations→`Duration`, easings→`Cubic`, and the four spring configs → real
`SpringDescription`/`SpringSimulation` (an upgrade over the CSS bezier approximation). Gate everything
behind `MediaQuery.disableAnimations` (collapse to `Duration.zero`).

### 7.4 Widget library `quant_ui` (mirrors `shared-ui`)
Port the component tree one-to-one, each `Quant*` widget a thin facade over a themed M3 base:
primitives (Button/Card/Dialog/Input/Avatar/Badge/Toast…), Navigation (BottomNav/TopBar/SearchBar),
Layout (AppShell/PageContainer/Sidebar), the super-app connective tissue (AppSwitcher, CommandMenu,
UniversalSearch, NotificationCenter, AIDock), Motion, Chat, Feed, AI/agent, Media, Bento. The
`advanced/` TS engines map to Flutter built-ins/packages: keyboard-shortcuts→Shortcuts/Actions/Intent,
virtual-list→Sliver (built-in), rich-text→super_editor/quill (or WebView per §5), charts→fl_chart,
maps→flutter_map, drag-drop→Draggable/Reorderable.

### 7.5 Multi-device adaptive strategy (the core of omni-presence)
Standardize on **Material 3 window size classes** as the single breakpoint ladder (reconciling the
repo's three overlapping web ladders):

| Class | Width (lp) | Nav | Content |
|---|---|---|---|
| Compact | <600 | bottom NavigationBar | single pane; list→push detail |
| Medium | 600–839 | NavigationRail (icons) | single / list+peek |
| Expanded | 840–1199 | NavigationRail | **two-pane** list/detail |
| Large | 1200–1599 | Rail extended / Drawer | two-pane, wider |
| XL | ≥1600 | Drawer | two/three-pane (+AI) |

The web's `899px` two-pane collapse maps onto the Compact↔Expanded boundary. `QuantAppShell` morphs
NavigationBar↔Rail↔Drawer (via `flutter_adaptive_scaffold` for the shell; bespoke `LayoutBuilder`
inside signature screens). Everything keys off `MediaQuery.sizeOf`, so dragging a desktop window
across 600/840/1200 reflows live. Input modality: 48×48 touch targets, hover/focus rings on pointer
devices only, full keyboard (Shortcuts/Actions) on desktop/web.

### 7.6 Signature screens across devices
- **Mail triage** — desktop two/three-pane, keyboard-first (j/k/e/#/r; ⌘K command palette via
  CallbackShortcuts + OverlayEntry); phone single-pane with `Dismissible` swipe actions +
  pull-to-refresh; AI copilot as a third pane (XL) or `DraggableScrollableSheet` (phone).
- **Chat** — two-pane (list+thread) on Expanded+, push-navigation on Compact; reversed
  `ListView.builder`; Enter-to-send on desktop, send button + long-press reactions on phone.
- **Social feed** — single column + StoryRing on Compact; masonry on Medium; three-zone (rail +
  feed + trends) on Expanded+; per-app accent colors each product.
- **AI chat** — full-screen (Compact) with AgentDock as a bottom sheet; three-zone (conversation +
  AgentDock side panel + artifact pane) on Expanded+; the `aiContext` accent keeps AI chrome distinct
  in all six themes.

### 7.7 Brand marks — tiered port (match source tiers)
- **SDF fragment-shader marks** (`gl-renderer.ts`) → **Flutter `FragmentProgram` GLSL** (near-verbatim;
  Impeller). Pause the Ticker off-screen/backgrounded; cap DPR.
- **Canvas-2D ember/iridescent plates** (`canvas-mark.ts`) → **`CustomPainter`** (RadialGradient/
  SweepGradient / superellipse Path).
- **Static SVG symbol/wordmark** → **flutter_svg**.
- **Scripted brand animations** (splash, "by QUANTRINITY" lockup) → **Rive**.

All behind one `QuantMark(appId, size, animated)` widget in `quant_marks`.

### 7.8 Accessibility, i18n, Indic
Port `contrast.ts` to Dart plus a **CI test asserting every ColorScheme pairing in all 6 themes meets
AA** (the Flutter twin of the existing theme-contrast guard). Semantics on every widget (translate each
React `aria-*`). Honor `textScaler` (test at 200%), `disableAnimations`, `highContrast`. **Bundle Noto
Indic fonts** (Devanagari/Tamil/Bengali/Telugu/Gujarati) via `fontFamilyFallback` (offline-first;
HarfBuzz shapes conjuncts). RTL via `Directionality` + directional insets. The `bharat` theme is the
culturally-tuned default for that market; a `lite` device-tier flag swaps shaders→CustomPainter/SVG and
reduces motion on low-end hardware.

## 8. Competitor Gap Backlog ("what we must build to beat them")

Cross-product, from the three gap dossiers. Priority: **P0** table-stakes, **P1** differentiator,
**P2** moonshot.

### 8.1 The moat (press this)
No competitor spans productivity + social + video + dating + microblog + ads + creator-economy under
**one first-party AI**. The structural win is "everything-app" convergence: unified SSO (in progress),
one cross-app wallet, cross-publish, federation, and ecosystem-wide fact-check.

### 8.2 AI / creator / ads (highest leverage)
- **P0 — Finish the cross-app orchestrator with the real engine.** `cross-app-orchestrator.service.ts`
  has real connectors/permissions/citations but **hardcoded intelligence** (`draftReply()` canned,
  `chatFollowup()` keyword-matches). Wire the real `packages/ai` engine. *Single highest-leverage gap.*
- **P0 — Delete the mock** `multi-llm-router.service.ts` (returns `"[MagicAI…]"`); refresh the stale
  model catalog.
- **P0 — Realtime speech-to-speech voice**; prove `agent-runtime` wired live end-to-end.
- **P1** — real generative-video backend (today "Vizion" is a stub); goal-based AI campaigns +
  auto-bidding; generative ad creative beyond text; CapCut-grade auto-captions.

### 8.3 Social & media
- **P0** — QuantGram **Live streaming** (no `/live` today) — reuse quantube live + quantmax gifts.
- **P0** — QuantMax **trust & safety** (selfie/liveness verification, age/ID gate, realtime AI
  moderation + human review, romance-scam/deepfake detection) — now regulatory; highest-risk gap.
- **P0** — QuantWave **DMs (+encrypted)** — reuse `quantchat/api/e2ee/*`.
- **P0** — QuantChat encrypted backups, usernames, scheduled messages, chat polls.
- **P0** — QuantGram native **creator monetization** (gifts/subs); QuantUbe live micro-tips +
  memberships + offline download.
- **P1** — shared generative-AI content studio (vs TikTok Symphony / Meta Muse / YouTube Create) on the
  `feed/triton` ML infra; unified wallet; ecosystem-wide federation + fact-check; Twitch-class live
  engagement; AI matchmaking (QuantMax); lossless audio + AI music discovery (QuantUbe).

### 8.4 Productivity
- **P0 — "Make it real":** eradicate fake-as-live gaps (recent commits de-faked GPG + security-scan;
  the dropped `meeting_reminder`/`daily_digest` consumer is PR #358, reusable).
- **P1** — truly-missing features: Drive doc templates, Calendar meeting polls, QuantGit package/
  container registry, Notion-style databases/wikis, Contacts enrichment/CRM timeline.
- **P1** — the integrated-suite + offline + agentic moat (offline is web-only today → `quant_offline`
  Drift makes it native).

## 9. CI/CD, Testing, Release

- **CI:** GitHub Actions + `subosito/flutter-action` (cached), `melos exec --diff=origin/main...HEAD`
  for change-based analyze/test/build fan-out. Matrix: macos (iOS+macOS), windows, ubuntu (+ninja/gtk
  for Linux; web+Android on any runner).
- **Testing:** unit + widget (`flutter_test`) + **golden** (Alchemist — Ahem font + diffThreshold to
  kill cross-platform font flakiness; generate goldens on one pinned Linux image) + integration
  (`integration_test`, `xvfb-run` on Linux CI, Firebase Test Lab for device coverage).
- **Signing/release:** fastlane — `match` (iOS certs in a separate encrypted repo) + App Store Connect
  **API key** (solves 2FA) + `upload_to_testflight`; Android upload-key (base64 CI secret) + Play
  `supply` service account. Codemagic is an option for high-volume signed releases; GitHub Actions for
  PR gating.
- **Rollout:** internal → closed/beta → **staged** (Play 1→5→10→25→50→100; App Store 7-day phased) with
  crash-rate gates (Sentry/Crashlytics) and auto-halt.

## 10. Migration Sequencing

- **Phase 0 — Foundation:** stand up `flutter/` workspace, `quant_tokens` codegen, `quant_theme` (6
  themes + CI AA test), `quant_core` (auth body-token + dio + envelope), `quant_native` scaffolds, CI
  (`flutter-action`+melos). No product features yet.
- **Phase 1 — Pilot = QuantChat (vertical slice):** exercises auth, `/ws` realtime, LiveKit calls,
  camera/AR (native), offline messages, and all 6 themes **without** the hardest surfaces. Mirrors the
  Google Pay 3-engineer vertical-slice playbook. Ship to internal track on iOS+Android+web PWA.
- **Phase 2 — Social cluster** (QuantGram/QuantMax/QuantWave/QuantUbe): feed/reels/stories/live;
  proves the adaptive feed + brand marks + per-app flavor at scale.
- **Phase 3 — QuantAI + agent surfaces:** AI chat + AgentDock; wire the real orchestrator.
- **Phase 4 — QuantMail suite (hardest, last):** mail triage native; **WebView-embed** the Yjs Drive
  editor, HTML email body, and terminal (§5). The Next.js collab editor stays alive behind the WebView.
- **Phase 5 — Desktop + VFS:** Windows/macOS/Linux builds; re-home the Rust VFS via flutter_rust_bridge.
- Each phase ships a new client only; backends untouched; the existing Next.js apps keep serving
  web/SEO until each product's Flutter PWA reaches parity.

## 11. Survives-vs-Rewrite Cost Model

- **Survives (0 rewrite):** all backends, Prisma schema, Redis/BullMQ jobs, LiveKit, Yjs server, auth,
  the `packages/ai` + `packages/agent-runtime` engines, the `packages/brand` token *source*, and the
  Next.js apps (demoted to SEO/public + the 5 embedded hard surfaces).
- **Ported (mechanical):** design tokens (codegen), the `shared-ui` component API (→ `quant_ui`),
  motion, brand marks, native shims (→ plugins).
- **Rewritten (genuine new work):** the Dart UI tree per product (feature packages), offline/local-first
  in Dart (Drift), i18n (greenfield ARB), OpenAPI dart clients (generated).
- **Biggest single new risk:** the Dart↔Yjs gap (no CRDT runtime) — bounded by the WebView embed, not
  solved in Dart.

## 12. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Dart has no Yjs/CRDT runtime | High | WebView-embed the existing collab editor (§5); never port Yjs to Dart |
| Flutter web = no SEO, weak document flow | High | Keep public pages as Next.js; Flutter web is an authenticated PWA only |
| Flutter desktop multi-window still maturing | Med | Phase desktop late; single-window first; watch Canonical's multi-window work |
| Google's leaner first-party investment / Flock fork | Med | Hybrid hedges web/desktop; community is net-growing; pin a known-good Flutter version |
| Golden-test cross-platform flakiness | Med | Alchemist Ahem + diffThreshold; pinned CI image |
| Team Dart ramp | Med | Pilot vertical slice; eBay/Nubank report days-to-productive onboarding |
| Verification-blocked box (no local Flutter build here) | Med | CI (`flutter-action`) is the verification oracle, mirroring the current web-CI posture |
| `android-project` (Kotlin) is Gemini-live | Low | Flutter work is additive in `flutter/`; do not touch `android-project/` until a cutover decision |

## 13. Open Questions for Review

1. **Web target:** ship a Flutter-web PWA for all products (Option A), or keep Next.js as the browser
   experience and use Flutter only for installed apps (Option B)? *Recommendation: A, with B as a
   per-product fallback.*
2. **Super-app vs per-product binaries:** one unified binary with runtime flavors, separately-installable
   product apps, or both? *Recommendation: both — shared packages, one super-app + optional standalone
   installs.*
3. **Pilot confirmation:** QuantChat as the Phase-1 vertical slice?
4. **`android-project` disposition:** does the Kotlin app get superseded by Flutter Android, or coexist?
   (Affects the concurrent Gemini work — needs an explicit call before any cutover.)
5. **Hard-surface scope:** accept the five-item WebView register (§5), or push harder to make any of them
   native Dart now?

---

*End of spec. No Flutter code, scaffolding, or dependency has been created. Implementation begins only
after this spec is approved and an implementation plan is written (the `writing-plans` step).*













