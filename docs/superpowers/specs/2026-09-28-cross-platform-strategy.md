# Quant Ecosystem — All-Platform Delivery Strategy

**Date:** 2026-09-28
**Status:** Design only. No code, no migration performed by this document.
**Scope:** Every product on Web + Android (APK/AAB) + iOS (IPA) + Desktop + Terminal, with the
"best and deep UI/UX for all platforms, all interconnected" (owner intent).
**Authority basis:** `.agents/project-memory/APP_MAP_AND_DEDUPLICATION_DECISIONS.md` (owner-approved
2026-09-11) is treated as the canonical app map and structural ruleset throughout.

---

## 0. Executive summary

The whole ecosystem is, in reality, a **web core rendered inside a platform-native WebView on every
GUI platform**, plus an **API-only terminal client**. There is no React Native anywhere; the shared
UI library is React-DOM (`packages/shared-ui/src/index.ts` imports framer-motion, dompurify,
livekit-client). Therefore "reuse across all platforms" means: **ship one web UI (each app's
Next/React + `@quant/shared-ui` + `@quant/brand`) and wrap it in per-platform native shells** that
add device APIs, deep links, notifications, and native chrome. The terminal reuses `@quant/brand`
tokens only.

Four delivery surfaces already exist in skeleton form and are individually verified below:

| Surface  | Package              | Tech (verified)                               | Maturity                              |
| -------- | -------------------- | --------------------------------------------- | ------------------------------------- |
| Web      | `apps/*`             | Next 15.5 / React 19 / Tailwind 3 / Fastify 5 | Production                            |
| Mobile   | `apps/quant-mobile`  | Capacitor 6 + Vite 6 + React 18.3             | Launcher shell, no native folders yet |
| Desktop  | `apps/quant-desktop` | Tauri 2 (Rust) + Vite 6 + React 18.3          | Shell + VFS (ProjFS/FileProvider)     |
| Terminal | `packages/cli`       | Node + commander/chalk/ora/inquirer           | Working `quant` binary                |
| (stray)  | `android-project/`   | Kotlin/Compose + WebView, 9 flavors           | Violates structural rule 2            |

**Headline recommendation on React 18/19:** upgrade both shells to React 19 (details in §4). It is a
version bump + reinstall, not a rewrite, and it removes a skew that already exists in the repo.

---

## 1. Verified current state (every claim cited)

### 1.1 Web (production)

- Apps are Next 15.5 + React 19 + Tailwind 3.4 + Fastify 5. Example: `apps/quantmail/package.json:50`
  (`next ^15.5.16`), `:52-53` (`react/react-dom ^19.0.0`), `:46` (`fastify ^5.2.1`), `:63`
  (`tailwindcss ^3.4.13`), and it consumes `@quant/shared-ui` (`:38`) and `@quant/brand` (`:28`).
- Monorepo: pnpm 10.28.1 (`package.json:7`), Node >=22 (`:8`), Turborepo (`turbo.json:12-14`).
  Workspaces are `apps/*`, `packages/*`, `services/*` (`pnpm-workspace.yaml:1-4`).
- **Root override forces React 19 types on the whole repo:** `package.json:63-64` pins
  `@types/react`/`@types/react-dom` to `^19.0.0` for every package, and `:66` pins `vite ^6.4.3`.

### 1.2 Mobile — `apps/quant-mobile` (Capacitor launcher shell)

- Capacitor 6 + Vite 6 + React 18.3: `package.json:23-26` (`react/react-dom ^18.3.0`,
  `@capacitor/core ^6.1.0`), `:35` (`vite ^6.4.2`). Note `@types/react ^19` at `:30/:36` (the skew).
- It is a **launcher that opens hosted web apps in the in-app browser**, not a native renderer:
  `src/App.tsx:9-10` defaults `APP_BASE_URL` to `https://app.quant.app`; `:19-23` launches an app via
  `window.open(`${APP_BASE_URL}${route}`)`. Entry uses `createRoot` (`src/main.tsx:2,10`) — no legacy
  `ReactDOM.render`.
- Rich native scaffolding already present (TypeScript, unit-tested): plugin service wrappers for
  Push, Contacts, Camera/Media, FileSystem, Share, Biometric, BackgroundFetch, WebRTC, Haptics,
  InAppBrowser (`src/plugins/index.ts:1-56`); PKCE Apple/Google OAuth (`src/auth/oauth.ts`, exported
  `src/index.ts:93`); Universal-Link/App-Link handler that emits the iOS AASA and Android assetlinks
  (`src/deep-linking/deep-link-handler.ts:84-113`); widgets, offline-sync queue, crash reporting,
  perf/size budgets (`src/index.ts:113-150`).
- The launcher's app list is **stale**: `src/app-launcher.ts:14-119` still lists 13 apps including
  retired ones (`quantdocs`, `quantdrive`, `quantcalendar`, `quantmeet`) and pre-rename ids
  (`quantneon`, `quantsync`, `quantedits`).
- Native folders are NOT generated yet — `README.md:14-25` documents the `cap add ios/android` steps
  that require a Mac/Android SDK and "CANNOT run in CI"; `:37-41` lists store signing as remaining.
- **Structural rule:** `APP_MAP…:52` — `apps/quant-mobile` must be **re-homed to
  `apps/quanttrinity/native/`** (it is the cross-app launcher, the one exception to per-app native).

### 1.3 Desktop — `apps/quant-desktop` (Tauri shell + VFS)

- Tauri 2 (Rust) + Vite 6 + React 18.3.1: `package.json:20-24`, `src-tauri/Cargo.toml:13`
  (`tauri 2.0` with `tray-icon`), `:15` (`plugin-notification`). Depends on `@quant/brand`,
  `@quant/api-client`, `@quant/auth`, `@quant/common` — **but not `@quant/shared-ui`**
  (`package.json:16-24`). Entry uses `createRoot` (`src/main.tsx:2,10`).
- Native virtual file system: FastCDC-64KB CAS drive via Windows ProjFS (`Cargo.toml:24-30`,
  `src-tauri/src/vfs/windows.rs`) and a macOS FileProvider extension
  (`macos/FileProviderExtension/FileProviderItem.swift`).
- UI shell: TitleBar + frosted Dock + `CommandPalette` (Cmd/Ctrl+K and Alt+n shortcuts,
  `src/App.tsx:66-92`) + Nexsas bento dashboard. Apps are embedded via **iframe to
  `http://localhost:<port>`** or a mock preview (`src/components/AppFrame.tsx:14-15,78-85`).
- Its app list is also **stale/misaligned**: `src/constants/apps.ts:3-120` lists 8 (`codehub`,
  `quantdrive`, `quantcalendar` — retired/renamed in the canonical map).

### 1.4 Terminal — `packages/cli` (`@quant/cli`)

- A real Node CLI, binary `quant` (`package.json:6-8`), built with tsc; deps commander/chalk/ora/
  inquirer (`:17-25`). `createCli()` registers auth, repo, pr, mail, drive, calendar, invoice, room
  commands (`src/index.ts:29-53`). API access is a fetch client with bearer token from config
  (`src/client.ts:50-96`, token resolution `:41-48`).

### 1.5 Stray `android-project/` (native Kotlin/Compose, violates rule 2)

- A **second, parallel Android approach**: 15 Kotlin files, Jetpack Compose + WebView. It is a
  top-level sibling, which structural rule 2 forbids (`APP_MAP…:56-63`: native clients live per-app
  or in quanttrinity, never as a sibling top-level app).
- It is a hardened WebView wrapper with 9 product flavors (per-app `applicationId`, host, scheme,
  App Links): `app/build.gradle.kts:26-153` (`com.quant.mail`→`quantmail.in`,
  `com.quant.chat`→`quantchat.quantrinity.in`, …), release signing from env keystore
  (`:155-186`), `minSdk 26`/`targetSdk 35` (`:13-15`).
- `MainActivity.kt` has genuinely useful, portable learnings: hardened `WebSettings`
  (`:171-184`: `MIXED_CONTENT_NEVER_ALLOW`, file/content access off), Chrome Custom Tabs for OAuth
  to avoid Google's `disallowed_useragent` (`:134-163`), and deep-link → session-restore URL
  resolution (`:79-121`).
- Committed Gradle `build/` artifacts are present (thousands of files) and should be gitignored.

### 1.6 Shared UI foundation

- `@quant/shared-ui` peerDeps are `react ^18.0.0 || ^19.0.0` (`package.json:30-33`) but it is
  authored and tested on React 19 (`:37-41`). It is a large **React-DOM** component library:
  base components, Media (LiveKit), Chat, Feed, Navigation, AI, the QuantAI presence
  (`BubbleAvatar`/`QuantSidekick`, `src/index.ts:119-142`), Auth (`LoginPage`/`ConsentScreen`),
  `EcosystemShell` provider (`:518`), and an interconnection layer (`:540`).
- It already ships **platform-adaptive / touch / keyboard primitives**: `useBreakpoint` (`:417`),
  `useOrientation` (`:419`), `useSwipeActions` (`:439`), `BottomSheet`/`PullToRefresh` (`:388-389`),
  `ResponsiveShell` (`:412`), `useKeyboardShortcuts` (`:427`), `OfflineIndicator` + `resilience`
  mutation queue (`:266,:546`), and `useAuth`/`configureQuantAuth` (`:145-148`).
- `@quant/brand` is **platform-agnostic** (no React; `package.json` has no react dep): color/type/
  motion tokens, per-app brand configs, WCAG contrast utils, and CSS/theme generators
  (`src/index.ts:51` `generateBrandCSS/…`, `:52` themes, `:54` contrast, `:57` icon-set generator,
  `:60-67` the `quantrinity` masterbrand foundation). This is the one asset reusable by _every_
  surface including the CLI.
- Canonical app registry: `packages/common/src/constants.ts:8-58` — the `QUANT_APPS` record contains
  **17 entries**: the 10 canonical post-rename ids (`quantmail`, `quantchat`, `quantwave`, `quantgram`,
  `quantcooks`, `quantads`, `quantube`, `quantmax`, `quantai`, `quanttrinity`) **plus 7 deprecated
  aliases** (`quantsync`, `quantneon`, `quantedits`, `quantdocs`, `quantdrive`, `quantcalendar`,
  `quantmeet`) retained for back-compat with persisted rows/tokens (migration 0061). This is the id
  set deep links, notifications (`Notification.sourceApp`), and the launcher must use — but consumers
  must **filter to the 10 canonical ids first** (via a `deprecated` flag or an explicit allowlist), so
  no surface ever renders or routes a legacy alias.

### 1.7 Problems this strategy must resolve

1. **Two Android toolchains** (Capacitor `quant-mobile` vs native `android-project`) — must converge.
2. **`quant-mobile` is a top-level sibling** — must move under `apps/quanttrinity/native/`.
3. **`android-project` is a top-level sibling** — must be folded in and removed.
4. **Stale app registries** in both shells vs the canonical `QUANT_APPS`.
5. **React skew**: 18.3 runtime but 19 types forced repo-wide (§4).
6. **Domain inconsistency**: `app.quant.app` (mobile), `quant.app` (deep-link default,
   `deep-link-handler.ts:35`), `quantmail.in` + `*.quantrinity.in` (android). Canonical domains must
   be chosen before any AASA/assetlinks file is signed.
7. **Neither shell consumes `@quant/shared-ui` today** — desktop uses only `@quant/brand`; mobile
   uses neither. The reuse story is currently aspirational.

---

## 2. Per-product platform matrix (phased by priority)

Products are the canonical ten from `packages/common/src/constants.ts:8-58`. "Native" mobile/desktop
means the web build wrapped in the shared Capacitor/Tauri shell (§3), **not** a separate codebase.
Terminal coverage is API-only via `@quant/cli` sub-commands; only products with a scriptable surface
get a command. quanttrinity is the cross-app launcher/shell, not a leaf product — it is the vessel
that carries all others on mobile.

Legend: ✅ ship · ◐ partial/embed-only · ➖ not applicable · Phase P0 (core) → P2 (long tail).

| Product      | Web      | Android (APK/AAB) | iOS (IPA)   | Desktop  | Terminal              | Phase        |
| ------------ | -------- | ----------------- | ----------- | -------- | --------------------- | ------------ |
| quantmail    | ✅       | ✅                | ✅          | ✅       | ✅ `mail`             | **P0**       |
| quantchat    | ✅       | ✅                | ✅          | ✅       | ✅ `room`/dm          | **P0**       |
| quantai      | ✅       | ✅                | ✅          | ✅       | ✅ `ai` (new)         | **P0**       |
| quantube     | ✅       | ✅                | ✅          | ◐ embed  | ➖                    | P1           |
| quantgram    | ✅       | ✅                | ✅          | ◐ embed  | ➖                    | P1           |
| quantwave    | ✅       | ✅                | ✅          | ✅       | ✅ `drive`/`calendar` | P1           |
| quantcooks   | ✅       | ✅                | ✅          | ◐ embed  | ➖                    | P2           |
| quantads     | ✅       | ◐ embed           | ◐ embed     | ✅       | ✅ `invoice`/ads      | P2           |
| quantmax     | ✅       | ✅                | ✅          | ✅       | ✅ `repo`/`pr`        | P2           |
| quanttrinity | ✅ shell | ✅ launcher       | ✅ launcher | ✅ shell | ➖                    | **P0 shell** |

Phasing rationale:

- **P0 = `dev:core`** (`package.json:24` runs quantmail/quantchat/quantai together) plus the
  quanttrinity shell, because every other native app inherits the shell's OAuth, deep-link, push and
  navigation plumbing. Nothing mobile ships until the shell is real.
- **P1 = high-DAU consumer surfaces** (media/social/productivity) that most benefit from native
  push, camera and share-sheet.
- **P2 = long-tail / operator tools**; several are desktop- or terminal-first (quantads, quantmax)
  and only need an embed on the weaker platform.

Per-surface count: **Web 10/10; Android 9/10 (ads embed-only); iOS 9/10; Desktop 10/10 (7 full +
3 embed); Terminal 6/10** (only products with a scriptable API get a command — matches the existing
`auth/repo/pr/mail/drive/calendar/invoice/room` set at `packages/cli/src/index.ts:29-53`, with `ai`
added).

---

## 3. Architecture per platform

One web core, four wrappers, one API client. Each app's Next/React build is the single source of UI;
the wrappers add device APIs and native chrome; the CLI never renders UI and only speaks to the API.

```
        ┌────────────────────── @quant/shared-ui (React-DOM) + @quant/brand (tokens) ──────────────────────┐
        │        Next 15 app per product  ·  EcosystemShell  ·  QuantSidekick  ·  interconnection            │
        └───────┬───────────────┬───────────────────────┬───────────────────────┬────────────────┬─────────┘
   Web (SSR/CSR)│   Android WebView│   iOS WKWebView       │  Tauri WebView (WRY)  │   —            │
        ▼        ▼ Capacitor 6     ▼ Capacitor 6           ▼ Tauri 2 (Rust)        ▼                │
   Vercel/Node   quanttrinity/native (shared shell)        quant-desktop           @quant/cli ──────┘ (fetch + bearer)
```

### 3.1 Web (Next 15 / React 19) — the source of truth

- Each product stays a standalone Next 15.5 app (`apps/<product>`) with its Fastify 5 backend behind
  Next `/api/*` proxy routes (pattern already in `apps/quantmail`). No change to the web runtime.
- The web build is what every wrapper loads. For wrappers we add **one static-export or hosted URL
  per app** (Capacitor can bundle a static export or point at the hosted origin; today mobile points
  at a hosted origin via `APP_BASE_URL`, `src/App.tsx:9-10`).
- Web is the only surface that must be SEO/SSR-correct; wrappers always load the CSR/hosted variant.

### 3.2 Mobile (Capacitor 6) — re-homed shared shell

- **Re-home `apps/quant-mobile` → `apps/quanttrinity/native/`** per `APP_MAP…:52`. This single
  Capacitor project is the quanttrinity launcher AND the host for every per-app native build; it is
  the sanctioned exception to "native lives per-app" (`APP_MAP…:56-63`).
- Keep all existing scaffolding (it is already unit-tested): plugin wrappers (`src/plugins/index.ts`),
  PKCE OAuth (`src/auth/oauth.ts`), deep-link handler (`src/deep-linking/deep-link-handler.ts`),
  offline queue, widgets, crash reporting.
- **Fix the stale registry**: drive `src/app-launcher.ts:14-119` from the canonical `QUANT_APPS` in
  `@quant/common` (`constants.ts:8-58`) so ids never drift. Note `QUANT_APPS` is a `Record<QuantApp, …>`
  metadata map, **not** a launcher model — it carries no per-app `route`/`icon`/deep-link target. So do
  not import it raw or `.find()` over it; instead **filter to the 10 canonical ids** (dropping the 7
  deprecated aliases) and **map** each to the launcher's own entry shape, joining the shared routing
  metadata. Ids come from the single registry; launcher-specific fields stay in the launcher.
- **Per-app store artifacts from one project via Capacitor flavors/targets**: reproduce the 9-flavor
  matrix the Kotlin project already encodes (`android-project/app/build.gradle.kts:26-153`) as Gradle
  product flavors under `native/android` after `cap add android`, each with its own `applicationId`,
  App-Links host and scheme. The launcher build is the 10th (`com.quant.app`).
- **Adopt `@quant/shared-ui`** in the shell so native chrome (BottomNav, CommandMenu, QuantSidekick)
  is the same components as web — closes problem 7 (§1.7).

### 3.3 Desktop (Tauri 2) — shell + native VFS

- Keep `apps/quant-desktop` as the single desktop shell (TitleBar + Dock + CommandPalette + bento).
  It already carries the differentiator no WebView can: the FastCDC-64KB CAS virtual file system via
  Windows ProjFS (`src-tauri/src/vfs/windows.rs`) and macOS FileProvider
  (`macos/FileProviderExtension/FileProviderItem.swift`).
- **Replace iframe-to-localhost embedding** (`AppFrame.tsx:14-15,78-85`) with either the hosted app
  origin or a bundled static export, guarded by Tauri's `dangerousRemoteDomainIpcAccess`/CSP allowlist
  so only known product origins load. The `http://localhost:<port>` + `quant://…` mock preview is a
  dev affordance, not the shipping path.
- **Fix the stale registry**: replace `src/constants/apps.ts:3-120` (has retired `codehub`,
  `quantdrive`, `quantcalendar`) with the canonical `QUANT_APPS`.
- **Adopt `@quant/shared-ui`** (today it depends only on `@quant/brand`, `package.json:16-24`) so the
  Dock/CommandPalette/QuantSidekick are shared components, not desktop-only reimplementations.

### 3.4 Terminal (`@quant/cli`) — API-only, tokens shared

- No UI. Keep the commander CLI; it consumes the same REST surface as the web `/api/*` routes via the
  bearer-token fetch client (`src/client.ts:41-96`). Reuse from the ecosystem is limited to
  `@quant/brand` **tokens for ANSI theming** (chalk color map derived from brand palette) — brand has
  no React dep so it imports cleanly into Node.
- Add an `ai` command (parity with the P0 set) and align token storage with the shells' auth (§6) so
  `quant auth login` yields a token the desktop/mobile shells can also read from the OS keychain.

### 3.5 `android-project/` reconciliation (converge, then delete)

- The native Kotlin/Compose app **duplicates** the Capacitor Android target and **violates structural
  rule 2** (top-level sibling; `APP_MAP…:56-63`). Decision: **do not ship it; fold its learnings into
  the Capacitor shell, then remove it.**
- Salvage these portable, verified learnings into the Capacitor Android config/plugins:
  1. Hardened `WebSettings` (`MainActivity.kt:171-184`: `MIXED_CONTENT_NEVER_ALLOW`, file/content
     access off) → Capacitor `android` server/security config + a small WebView hardening plugin.
  2. Chrome Custom Tabs for OAuth to dodge Google's `disallowed_useragent`
     (`MainActivity.kt:134-163`) → the shell already has InAppBrowser; route external auth through
     Custom Tabs, mirroring the PKCE flow in `src/auth/oauth.ts`.
  3. Deep-link → session-restore URL resolution (`MainActivity.kt:79-121`) → merge into
     `deep-link-handler.ts`.
  4. The 9-flavor `applicationId`/host/scheme table (`build.gradle.kts:26-153`) → the Gradle flavor
     matrix under `quanttrinity/native/android` (§3.2), after canonical-domain reconciliation (§6).
- Also `.gitignore` the committed Gradle `build/` artifacts before removal so history stays clean.

### 3.6 Workspace-glob consequence (must be decided, not skipped)

- `pnpm-workspace.yaml:1-4` globs `apps/*`, not `apps/*/native/`. Re-homing mobile to
  `apps/quanttrinity/native/` means that nested package **won't auto-register**. Choose one:
  (a) add `apps/*/native` to `pnpm-workspace.yaml`, or (b) make `native/` a non-workspace project
  built by its own Capacitor/Gradle tooling and consuming `@quant/*` via the workspace only at the
  `quanttrinity` package boundary. **Recommendation: (a)** — keeps `@quant/shared-ui`/`@quant/brand`
  as normal workspace deps and lets Turborepo cache the native web build.

---

## 4. `@quant/shared-ui` + `@quant/brand` reuse and the React 18/19 reconciliation

### 4.1 The React 18 vs 19 decision — DECIDED: upgrade both shells to React 19

**Recommendation: upgrade `apps/quant-mobile` and `apps/quant-desktop` to `react`/`react-dom`
`^19.0.0`. Reject dual-support and reject a React-18 freeze.** Rationale, all from verified state:

- **The skew already exists and is the wrong way round.** Both shells run the React 18.3 _runtime_
  (`quant-mobile/package.json:23-26`, `quant-desktop/package.json:20-24`) while the root
  `pnpm.overrides` force `@types/react`/`@types/react-dom` to `^19` **repo-wide**
  (`package.json:63-64`). Every shell is already typechecked against React 19 types on a React 18
  runtime — a latent mismatch, not a safe steady state.
- **It is a version bump + reinstall, not a rewrite.** Both entrypoints already use the React 18/19
  client API `createRoot` (`quant-mobile/src/main.tsx:2,10`, `quant-desktop/src/main.tsx:2,10`); no
  legacy `ReactDOM.render`, no `string refs`, no `defaultProps`-on-function-components, no other
  React-19-removed API is in use. The upgrade is `pnpm add react@^19 react-dom@^19` per shell.
- **It matches everything else.** Web apps are React 19 (`quantmail/package.json:52-53`) and
  `@quant/shared-ui` is authored/tested on React 19 (`package.json:37-41`). Upgrading the shells lets
  them consume `@quant/shared-ui` on the same major the web uses — the whole point of the reuse story.
- **Keep `@quant/shared-ui` peerDeps at `^18.0.0 || ^19.0.0`** (`package.json:30-33`). That is correct
  for a _published library_ (maximises consumer compatibility) and costs nothing; the applications
  pin 19, the library stays broad.
- **Add a root `pnpm.overrides` pin for `react`/`react-dom` to `^19`** alongside the existing types
  pins (`package.json:63-64`) so a transitive dep can never drag a second React copy in — the classic
  "Invalid hook call / two Reacts" failure. One React, one types major, repo-wide.
- **Why not dual-support (apps on 18, lib on 18||19)?** Nothing in the repo requires React 18; it only
  perpetuates the types/runtime skew and forces `shared-ui` consumers in the shells to be tested on a
  major the web never runs.
- **Why not freeze on 18?** It strands the shells off the web's major and off `shared-ui`'s authored
  target, and the types are already 19 — a freeze would mean _downgrading_ the pinned types, churn in
  the wrong direction.

### 4.2 What is reusable, and where

| Asset                                                                                         | Web | Mobile     | Desktop    | Terminal          |
| --------------------------------------------------------------------------------------------- | --- | ---------- | ---------- | ----------------- |
| `@quant/brand` tokens/CSS/icons (no React)                                                    | ✅  | ✅         | ✅         | ✅ (ANSI palette) |
| `@quant/shared-ui` React-DOM components                                                       | ✅  | ✅ (adopt) | ✅ (adopt) | ➖                |
| `EcosystemShell`/`QuantSidekick`/interconnection (`index.ts:518,119-142,540`)                 | ✅  | ✅         | ✅         | ➖                |
| responsive/touch primitives (`useBreakpoint`,`useSwipeActions`,`BottomSheet`,`PullToRefresh`) | ✅  | ✅         | ◐          | ➖                |
| `useKeyboardShortcuts`/`CommandPaletteUI` (`index.ts:427,447`)                                | ✅  | ◐          | ✅         | ➖                |
| `resilience` mutation queue / `OfflineIndicator` (`index.ts:546,266`)                         | ✅  | ✅         | ✅         | ➖                |
| `useAuth`/`configureQuantAuth` (`index.ts:145-148`)                                           | ✅  | ✅         | ✅         | via CLI token     |

The reuse story becomes real only after §3.2/§3.3 adopt `shared-ui` in the shells. Brand tokens are
already reusable everywhere and are the single asset the terminal can consume.

### 4.3 Bridge device APIs behind one interface — `@quant/platform`

`shared-ui` is React-DOM and must stay platform-agnostic about _where_ it runs. Introduce a thin
`@quant/platform` adapter package (design only) exporting capability interfaces —
`notifications`, `share`, `filesystem`, `biometric`, `haptics`, `camera`, `secureStore`, `deepLink` —
with three implementations resolved at build/runtime:

- **web** → Web APIs (Web Push, Web Share, File System Access, WebAuthn).
- **capacitor** → the existing plugin wrappers (`quant-mobile/src/plugins/index.ts:1-56`).
- **tauri** → Tauri plugins (`plugin-notification` already in `Cargo.toml:15`, fs, dialog, updater).
  Components import `@quant/platform`, never a Capacitor/Tauri symbol directly, so one component tree
  renders on all three GUI surfaces. This is the missing seam that lets `shared-ui` be adopted by both
  shells without leaking native deps into the web build.

### 4.4 Responsive / touch / keyboard — already present, apply per surface

- **Responsive**: `ResponsiveShell` + `useBreakpoint` + `useOrientation` (`index.ts:412,417,419`)
  drive phone/tablet/desktop layout from one tree. Mobile shell uses `BottomNav`; desktop uses
  `Sidebar` + `Dock`; both come from `shared-ui`.
- **Touch**: `useSwipeActions`, `BottomSheet`, `PullToRefresh` (`index.ts:388-389,439`) are the mobile
  interaction primitives — wire them in the re-homed shell.
- **Keyboard**: `useKeyboardShortcuts` + `CommandPaletteUI` (`index.ts:427,447`) power desktop's
  Cmd/Ctrl+K palette (`quant-desktop/src/App.tsx:66-92`) and give web the same. Deep, native-feeling
  UX per platform from shared code — the owner's "best and deep UI/UX for all platforms" intent.

---

## 5. Build & release pipeline per platform

Turborepo already gates `build`/`test`/`lint` with `dist/**` + `.next/**` outputs (`turbo.json`).
Native builds are added as leaf tasks that depend on the web build. The three constraints that shape
this: (a) iOS/Android device builds **cannot run in CI without a Mac/Android SDK**
(`quant-mobile/README.md:14-25`), so they run on hosted mac/linux runners, not the default CI; (b)
signing secrets come from env, never the repo; (c) each surface has a distinct artifact and store.

### 5.1 Web

- `turbo run build` → Next `.next/**`; deploy per app (Vercel or Node/Fastify host). Already working.
- Gate: `test`, `test:a11y`, `test:e2e` (Playwright, root `package.json`) before deploy.

### 5.2 Android (APK for sideload, AAB for Play)

- After `cap add android` (needs Android SDK; not the default CI, per `README.md:14-25`): build the
  web export → `npx cap sync android` → Gradle `bundleRelease` (AAB) / `assembleRelease` (APK).
- **Signing**: reuse the env-keystore pattern already proven in the Kotlin project —
  `KEYSTORE_FILE`/`KEYSTORE_PASSWORD`/`KEY_ALIAS`/`KEY_PASSWORD`
  (`android-project/app/build.gradle.kts:155-186`) — ported to the Capacitor `native/android` Gradle
  config. Secrets injected by the runner; debug keystore fallback for local builds.
- **Per-product artifacts**: Gradle product flavors (one per app, §3.2) yield one signed AAB per
  `applicationId` (`com.quant.mail`, `com.quant.chat`, …) plus the launcher. Play Console upload per
  flavor.
- `minSdk 26`/`targetSdk 35` (`build.gradle.kts:13-15`) carried over.
- **App Links verification** needs the signing cert SHA-256 in each host's assetlinks (§6); it can
  only be filled once the release keystore exists — placeholder today
  (`deep-link-handler.ts:102-113`).

### 5.3 iOS (IPA)

- **Mac-only** (`README.md:14-25`): `cap add ios` → `cap sync ios` → `xcodebuild archive` →
  `-exportArchive` to a signed IPA. Runs on a macOS runner (Xcode Cloud / self-hosted mac / CI mac).
- **Signing**: Apple Developer team, distribution cert + provisioning profile per bundle id
  (mirror the Android per-app ids: `app.quant.mail`, …). App Store Connect upload via `altool`/Fastlane.
- **Universal Links** need the Apple **Team ID** in each app's AASA — placeholder today
  (`deep-link-handler.ts:84-100`, `TEAMID`); filled once the Apple account/bundle ids exist. Associated
  Domains entitlement per app.
- One shared Capacitor iOS project, per-app targets/schemes (parallels the Android flavor matrix).

### 5.4 Desktop (Tauri bundles + updater)

- `tauri build` per OS produces native installers: **Windows** `.msi`/NSIS `.exe`, **macOS**
  `.app`/`.dmg` (notarized), **Linux** `.AppImage`/`.deb`. Cross-OS builds run one job per runner OS
  (Rust toolchain required; `src-tauri/Cargo.toml`).
- **Signing/notarization**: Windows Authenticode cert; macOS Developer ID + `notarytool` staple.
  ProjFS (Windows) and the FileProvider extension (macOS) need their platform capabilities/entitlements
  declared in the bundle.
- **Auto-update**: add the Tauri updater plugin (notification plugin already present,
  `Cargo.toml:15`) with a signed update manifest so desktop clients self-update.
- Artifact per OS uploaded to the release channel; version from the workspace.

### 5.5 Terminal (`@quant/cli` → npm)

- `tsc` build → `dist/**` (already `turbo` output); publish `@quant/cli` to the npm registry
  (`bin: { quant }`, `package.json:6-8`). `pnpm publish --access public` (or private registry) gated
  on `build`+`test`.
- Optional: bundle standalone binaries (pkg/`node --sea`) for users without Node, but npm is the
  primary channel. Version in lockstep with the API contract it targets (`src/client.ts`).

---

## 6. Interconnection across platforms

The ecosystem is "all interconnected" only if identity, links, memory and notifications are shared
across every surface. Four fabrics, each with a per-platform binding.

### 6.1 Shared SSO / identity (quantmail as IdP)

- **quantmail is the central OAuth/identity provider** (owner-approved model; the CLI already resolves
  a bearer token from config, `src/client.ts:41-48`, and `shared-ui` ships `useAuth`/
  `configureQuantAuth`/`QuantAuthEndpoints`, `index.ts:145-148`). All surfaces authenticate against
  the same IdP and carry the same token type.
- **PKCE Authorization-Code everywhere** (no implicit): the shell already has PKCE Apple/Google OAuth
  (`quant-mobile/src/auth/oauth.ts`). Native surfaces run auth in **Custom Tabs (Android) /
  ASWebAuthenticationSession (iOS)** — never the embedded WebView — to avoid Google's
  `disallowed_useragent` (learning salvaged from `MainActivity.kt:134-163`).
- **Token storage per surface**: OS keychain/Keystore on mobile, OS secure store on desktop (Tauri),
  config file on CLI (`src/client.ts`), httpOnly cookie/session on web. A single logout revokes at the
  IdP. This lets `quant auth login` and the GUI shells share one session (§3.4).

### 6.2 Canonical domains (decide before any AASA/assetlinks is signed)

- Today three schemes coexist: `app.quant.app` (mobile default, `quant-mobile/src/App.tsx:9-10`),
  `quant.app` (deep-link default, `deep-link-handler.ts:35`), and `quantmail.in` +
  `*.quantrinity.in` (android flavors, `build.gradle.kts:32-152`).
- **Assumption (must be owner-ratified):** adopt the `*.quantrinity.in` family already encoded in the
  Kotlin flavors as canonical per-app hosts (`quantmail.in`, `quantchat.quantrinity.in`, …), with a
  single custom scheme namespace `quant<app>://`. Every AASA/assetlinks file, `applicationId`, and the
  launcher's `APP_BASE_URL` must be regenerated from this one table. **No signed link file until this
  is fixed** — a wrong host bakes into the signed app.

### 6.3 Deep links / universal links

- One resolver, three bindings. The `UniversalLinkHandler` already emits both platform files —
  `getIOSAssociation()` (AASA) and `getAndroidAssetLinks()` (`deep-link-handler.ts:84-113`).
- **iOS Universal Links** (AASA served at `/.well-known/apple-app-site-association` per host, Team ID
  filled at §5.3) + **Android App Links** (assetlinks.json with the release SHA-256 from §5.2) +
  **custom schemes** `quant<app>://` as fallback. Desktop registers the `quant://` protocol handler
  (Tauri) so `quant://…` opens the desktop shell; web handles the https URL directly.
- Cross-app navigation uses canonical ids from `@quant/common` (`constants.ts:8-58`) so a link minted
  on any surface resolves on any other. This replaces the stale ids in `app-launcher.ts:14-119`.

### 6.4 Shared cross-app memory (QuantMail Drive as the store)

- Unified per-user "ecosystem memory" (recent items, cross-app relations, QuantSidekick context) is
  persisted in **QuantMail Drive** and surfaced through `shared-ui`'s `EcosystemShell`/interconnection
  layer (`index.ts:518,540`) and `CrossAppRelations`/`RecentItems`/`ActivityFeed` (`index.ts:268,264`).
- Every surface reads/writes the same store via the API; the **`resilience` mutation queue**
  (`index.ts:546`) + `OfflineIndicator` (`index.ts:266`) make writes offline-safe on mobile/desktop
  and replay on reconnect. The CLI participates through the same API with its bearer token.
- Result: an action in the terminal (`quant mail …`) shows up in the web/mobile/desktop activity feed
  because there is one memory store, not per-surface copies.

### 6.5 Push / notifications (one logical channel, per-platform transport)

- **Mobile**: FCM (Android) + APNs (iOS) via the Capacitor Push wrapper already scaffolded
  (`quant-mobile/src/plugins/index.ts`, `capacitor.config.ts` PushNotifications plugin).
- **Desktop**: Tauri notification plugin (already a dependency, `Cargo.toml:15`) for local/native
  toasts; server pushes over the app's existing WebSocket/realtime channel.
- **Web**: Web Push (service worker + VAPID).
- **Unification**: a notification carries the canonical `sourceApp` id (`Notification` type in
  `shared-ui` `index.ts:280`) and a deep link (§6.3), so tapping it lands on the right app/route on
  whatever surface received it. `@quant/platform` (`§4.3`) hides the transport from components; the
  server fans one logical notification out to the right transport per registered device.

---

## 7. Testing strategy

Test once at the layer of highest leverage, then smoke-test each wrapper.

- **Shared UI (unit/component)**: `@quant/shared-ui` is tested on React 19 today
  (`package.json:37-41`); keep that as the primary component test surface (Vitest + Testing Library).
  Post-upgrade, this is the same React major the shells run — one test run covers all GUI surfaces.
- **Web (E2E/a11y)**: existing Playwright `test:e2e` + `test:a11y` (root `package.json`) stay the
  gate for behaviour and accessibility (WCAG — brand ships `contrastRatio`/`meetsAA`,
  `brand/src/index.ts:54`).
- **`@quant/platform` adapter (contract tests)**: one interface, three implementations (§4.3) →
  contract tests asserting each backend (web/capacitor/tauri) satisfies the same capability shape.
  This is where cross-platform correctness is actually enforced.
- **Mobile**: keep the shell's existing unit tests; add Capacitor smoke tests + a device/emulator
  matrix (`cap run`) for deep-link, push, OAuth-Custom-Tabs, and offline-queue replay. Cannot run in
  default CI (`README.md:14-25`) → macOS/Android-SDK runners.
- **Desktop**: Tauri WebDriver (`tauri-driver`) smoke tests for the shell + a VFS integration test on
  Windows (ProjFS) and macOS (FileProvider) runners.
- **Terminal**: command-level tests against a mocked API client (`src/client.ts`); assert token
  resolution and each sub-command's request shape.
- **Interconnection (cross-surface)**: an integration suite proving one identity/token works across
  web+CLI, a link minted on one surface resolves on another (§6.3), and a notification's `sourceApp`
  deep-links correctly (§6.5).

---

## 8. Effort & sequencing (aligned to APP_MAP wave W-H)

Wave **W-H** in the app map is "per-app native clients" (`APP_MAP…:137`); this plan is its design.
Ordering is dependency-driven: foundation first, then P0 apps, then fan-out. Estimates are
engineering-effort bands (S ≤3d, M ≤2wk, L ≤4wk), not calendar commitments.

| #   | Step                                                                                                                               | Depends on | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 0   | **React 19 upgrade** of both shells + root `react`/`react-dom` override pin (§4.1)                                                 | —          | **S**  |
| 1   | Re-home `quant-mobile` → `apps/quanttrinity/native/`; decide workspace glob (§3.6)                                                 | 0          | M      |
| 2   | Canonical-domain table + regenerate `APP_BASE_URL`/AASA/assetlinks placeholders (§6.2)                                             | —          | S      |
| 3   | `@quant/platform` adapter (web/capacitor/tauri) + contract tests (§4.3, §7)                                                        | 0          | M      |
| 4   | Adopt `@quant/shared-ui` in both shells; refresh stale registries to `@quant/common` (§3.2-3.3)                                    | 1,3        | M      |
| 5   | Fold `android-project` learnings into Capacitor shell, then delete + gitignore `build/` (§3.5)                                     | 1          | M      |
| 6   | Shared SSO/PKCE + token-store-per-surface; CLI/GUI single session (§6.1)                                                           | 3          | M      |
| 7   | Deep/universal links end-to-end + protocol handler; cross-app memory via Drive (§6.3-6.4)                                          | 2,6        | M      |
| 8   | Push: FCM/APNs/Tauri/Web Push behind one channel (§6.5)                                                                            | 3,6        | M      |
| 9   | **P0 native builds** (quantmail/quantchat/quantai + quanttrinity shell): Android AAB, iOS IPA, Tauri bundles, signing/updater (§5) | 4-8        | **L**  |
| 10  | `@quant/cli` `ai` command + npm publish pipeline (§5.5)                                                                            | 6          | S      |
| 11  | **P1** apps native (quantube/quantgram/quantwave)                                                                                  | 9          | L      |
| 12  | **P2** apps + embeds (quantcooks/quantads/quantmax)                                                                                | 11         | L      |

Critical path: **0 → 1 → 4 → 9**. Steps 0 and 2 are cheap and unblock everything; do them first.
Steps 9-12 need Mac/Android-SDK runners and store/signing accounts (§5), the only external
prerequisites in the plan.

---

## 9. Assumptions & risks

**Assumptions (stated, not verified with the owner — flagged for ratification):**

1. Canonical domains follow the `*.quantrinity.in` family already encoded in the Kotlin flavors
   (§6.2). If the owner prefers `quant.app`/`app.quant.app`, only the domain table changes; the
   architecture is unaffected.
2. quantmail is the identity provider for the whole ecosystem (consistent with the CLI token model
   and `configureQuantAuth`). Not re-litigated here.
3. Apple Developer + Google Play + code-signing accounts will exist before step 9; they are external
   and cannot be provisioned from the repo.
4. Wrappers load the **hosted** web origin (as mobile does today) rather than a bundled static export.
   Either works; hosted keeps release cadence decoupled from store review. Revisit per app if offline
   cold-start matters.
5. The canonical product set is the ten in `packages/common/src/constants.ts:8-58` (the task said "8
   products"; the registry has ten — this spec follows the registry as the source of truth).

**Risks:**

- **Two-Reacts / invalid-hook-call** if the override pin (§4.1) is omitted — the single highest-value
  guardrail; without it, adopting `shared-ui` in the shells can pull a second React copy.
- **Signed-in-wrong-domain**: shipping any AASA/assetlinks before §6.2 bakes a wrong host into a
  signed app; App/Universal Links then silently fail. Gate steps 7-9 on step 2.
- **CI cannot build mobile** (`README.md:14-25`): iOS/Android device builds need Mac/Android-SDK
  runners; treat as a separate pipeline, not the default CI, or step 9 stalls.
- **Nested workspace glob** (§3.6): if `apps/*/native` is not added and native/ is not made a
  standalone project, `@quant/*` deps won't resolve in the re-homed shell.
- **Desktop remote-content security**: replacing the localhost iframe (§3.3) must use a Tauri CSP/
  domain allowlist, or the shell can load untrusted origins. Carry over the Kotlin WebView hardening
  (§3.5).
- **Scope**: this is design only. No code, migration, or git action is performed by this document.

---

_End of strategy. Design-only; no files other than this spec are created or modified._
