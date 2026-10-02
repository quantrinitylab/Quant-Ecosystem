# 🌐 QUANTMAIL DUAL-SURFACE SUPER-APP DESIGN SPECIFICATION
## Next.js 15 Web + Flutter Native Omni-Presence Architecture

> **AUTHORITATIVE DESIGN SPECIFICATION**: This document defines the complete architectural blueprint for **QuantMail** as an enterprise-grade Super-App, inspired by **Amazon, Flipkart, Superhuman, and Linear**. It specifies the dual-surface connection model (Next.js 15 Web + Flutter Native Mobile & Desktop), shared zero-stub backend infrastructure, screen-by-screen UX hierarchy, SVG vector design tokens, Three.js/WebGL 3D visual layers, and production deployment pipeline.

---

## 🎯 1. CORE ARCHITECTURAL LAWS & SYSTEM INVARIANTS

### Invariant 1: STRICTLY ZERO RAW UNICODE EMOJIS
- **Zero Raw Emojis Rule:** Raw Unicode emojis (e.g. smileys, rockets, sparkles, folders) are permanently banned across all source code, comments, UI strings, and notifications.
- **Pure Vector Iconography:**
  - **Web (Next.js 15):** Strict SVG paths rendered via Lucide, Heroicons, or dedicated `<svg>` components with scalable `viewBox` and currentColor strokes.
  - **Flutter Native:** Strict Material 3 `Icon(Icons.xxx)` vectors, custom `VectorDrawable`, or `SvgPicture.string()` from `flutter_svg`.

### Invariant 2: ZERO SKIA `clipPath` CRASHES
- **RenderThread Safety:** Zero invocations of Skia `canvas.clipPath()`, chained `.clip().shadow()`, or complex path clipping that trigger SIGSEGV crashes on Android Ganesh/Vulkan drivers.
- **Hardware-Accelerated Geometry:** Use `RoundedRectangleBorder`, `BoxDecoration(borderRadius)`, and `canvas.drawRRect` for hardware-accelerated 120 FPS rendering across all devices.

### Invariant 3: THREE.JS, WEBGL & WEBGPU 3D INTEGRATION
- **Web Workspace (Next.js 15):** Three.js / React Three Fiber / WebGL canvas for interactive 3D spatial data visualizations (e.g., Global Mail Delivery Map, 3D Vector Memory Cluster, and Code Dependency Topography).
- **Native Flutter Client:** Hardware-accelerated Impeller CustomPainter shaders (`FragmentProgram`) and 3D matrix transforms (`Transform(transform: Matrix4.identity()..setEntry(3, 2, 0.001)...)`) providing smooth 60–120 FPS depth without third-party webview overhead.

### Invariant 4: DUAL-SURFACE HARMONY (Sab Alag, Fir Bhi Connected)
- **Web Surface:** Retains Next.js 15 for instant SSR/SSG (<100ms cold start), Google SEO indexing, native HTML email DOM rendering, Monaco code editor, and xterm.js terminal.
- **Native App Surface:** Retains Flutter for buttery-smooth 120 FPS touch physics, offline SQLite (Drift) vault, system tray/notifications, hardware biometric authentication, and low memory consumption (40–60 MB RAM).
- **Single Source of Truth:** A unified Fastify + PostgreSQL + Redis backend shared seamlessly between Web and Apps.

---

## 🏛️ 2. DUAL-SURFACE CONNECTION & NERVOUS SYSTEM

```
                                 ┌────────────────────────────────────────────────────────┐
                                 │               SHARED SOVEREIGN BACKEND                 │
                                 │      (14 Fastify Services + PostgreSQL + Redis)        │
                                 │                 https://quantmail.in/api               │
                                 └───────────────────────────┬────────────────────────────┘
                                                             │
                                     ┌───────────────────────┴───────────────────────┐
                                     │                                               │
                                     ▼                                               ▼
    ┌─────────────────────────────────────────────────┐     ┌─────────────────────────────────────────────────┐
    │           SURFACE 1: WEB WORKSPACE              │     │         SURFACE 2: FLUTTER NATIVE APPS          │
    │             (Next.js 15 App Router)             │     │      (Android SDK 36, iOS, Windows, Mac)        │
    │              https://quantmail.in               │     │           flutter_apps/apps/quant_mail          │
    ├─────────────────────────────────────────────────┤     ├─────────────────────────────────────────────────┤
    │ • Fast SSR / SSG Public Pages (<100ms)          │     │ • 120 FPS Impeller Smooth Touch Gestures        │
    │ • 100% Google SEO & Crawler Indexing            │     │ • Local-First SQLite (Drift) + FTS5 (<5ms)      │
    │ • Native DOM HTML Email Rendering (No iframes)  │     │ • Hardware Biometric KeyStore (Fingerprint/Face)│
    │ • Monaco Code Diff Engine & xterm.js Terminal   │     │ • Low Memory Footprint (40–60 MB RAM)           │
    │ • Smart Download Banner ("Open in Native App")  │     │ • Direct Desktop Global Hotkeys (Ctrl+K, Z)     │
    └─────────────────────────────────────────────────┘     └─────────────────────────────────────────────────┘
```

### A. Authentication & Session Synchronization (SSO Bridge)
1. **OAuth2 / OIDC Root Provider:** QuantMail is the master identity authority (`/api/auth/*`).
2. **Web Session:** Secure, HttpOnly, SameSite=Lax JWT session cookies with automated silent refresh.
3. **Flutter Native Session:** 
   - Cryptographically stored in Android Keystore / iOS Keychain via `flutter_secure_storage`.
   - Bearer JWT token automatically injected into every HTTP/2 request via `quant_api` Dio interceptors.
4. **Deep-Link Handoff:**
   - Web-to-App handoff protocol: `quantmail://oauth/authorize?token=...`
   - Single-tap QR code or magic link sign-in between desktop and mobile devices.

### B. Real-Time WebSocket Synchronization Gateway (`ws-gateway`)
- **Shared Event Bus:** Fastify WebSocket gateway backed by Redis Pub/Sub.
- **Bi-Directional Channels:**
  - `mail:incoming`: Triggers desktop badge update and phone push notification simultaneously.
  - `mail:read` & `mail:archive`: Updates read state across both Web and Mobile instantaneously.
  - `drive:sync`: Emits FastCDC chunk completion telemetry.
  - `calendar:lock`: Real-time slot mutex lock prevents double-booking across all platforms.

---

## 🛒 3. AMAZON & FLIPKART SUPER-APP UI/UX DESIGN SYSTEM

QuantMail adopts the proven **3-Tier Vertical Hierarchy** of world-class super-apps (Amazon, Flipkart, WeChat, Tata Neu):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: STICKY TOP COMMAND BAR                                                         │
│  [🏢] Quant Trinity Lab · rahul@quantmail.in ▾             [🔔 3]   [⚡ 2,450 QC]  [👤] │
│  [🔍 Search emails, files, events, repos, or ask Quanty...        Ctrl+K ] [🎤] [📷]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 2: HORIZONTAL MINI-APP CATEGORY RAIL (Flipkart Style)                             │
│  [✉ Mail (12)]   [📅 Calendar (3)]   [💾 Drive (85GB)]   [👥 Contacts]   [🐙 CodeHub]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 3: EXECUTIVE QUICK-GLANCE WIDGET TILES (Amazon Pay Style)                         │
│  ┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐         │
│  │ ⚡ PRIORITY MAIL  │ 📅 NEXT MEETING  │ 💾 DRIVE STORAGE │ ✍ QUICK ACTIONS │         │
│  │ 4 Urgent Triage  │ 11:30 AM Product │ 14.2 / 100 GB    │ [+ Compose]      │         │
│  │ [Triage Now ➔]   │ [Join Meet ➔]    │ [Upload Files ➔] │ [+ New Event]    │         │
│  └──────────────────┴──────────────────┴──────────────────┴──────────────────┘         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 4: MAIN HIGH-DENSITY WORKSPACE CANVAS (Superhuman / Linear Standard)              │
│  [ ]  ★  Google Cloud Billing    [✓] Production Invoice #INV-8891...    $412.50   10:42│
│  [ ]  ★  Satya Nadella           [✓] Executive Sync: Q4 Partnership...  [Doc 2MB] 09:15│
│  [ ]     GitHub Actions          [✓] [main] Build #4812 Passed Green    [Logs]    08:30│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ TIER 5: FIXED CONTEXTUAL BOTTOM DOCK (Mobile & PWA Standard)                           │
│     [ ✉ Inbox (12) ]    [ 📅 Calendar (3) ]    [ 💾 Drive ]    [ 🐙 Code ]    [ ⊞ Hub ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 4. THE 5 SOVEREIGN PILLARS INSIDE QUANTMAIL

QuantMail combines the 5 essential enterprise productivity applications into a single unified workspace:

### Pillar 1: QuantMail (Superhuman & Gmail Category Killer)
- **5 Split Lenses Strip:** `Primary (12)` · `Updates (4)` · `Promotions (1)` · `Forums (0)` · `VIPs (2)`.
- **Keyboard Triaging Dock:** `[J/K]` navigate, `[E]` instant archive, `[S]` star, `[R]` reply, `[Z]` undo, `[Ctrl+K]` command palette.
- **10-Second Undo-Send Countdown Bar:** Shrinking countdown bar with `[Undo (Z)]` cancellation and `[Send Now]` immediate flush.
- **Local-First SQLite FTS5 Search:** Sub-5ms instant indexed search across headers and bodies.
- **Cryptographic Security Inspector:** Live SPF, DKIM, DMARC, and ARC verification badges on every thread.

### Pillar 2: QuantCalendar (Google Calendar & Calendly Category Killer)
- **Dual-Timezone Header Pill:** Real-time conversion switcher: `IST (UTC+5:30) ⇋ PST (UTC-8)`.
- **Public Booking Engine (`/booking/:slug`):** Calendly-class public scheduling with 15/30/60 min duration pills and atomic database mutex locks preventing double-booking.
- **QuantMeet HD Integration:** 1-tap `[Join Video Meeting]` button directly launching WebRTC HD video call rooms.
- **RFC 5545 Recurrence Engine:** Full RRULE support, single-occurrence exception edits, and ICS import/export.

### Pillar 3: QuantDrive (Google Drive & Dropbox Category Killer)
- **FastCDC 64KB CAS Deduplication Telemetry:** Live meter displaying raw uploaded data vs deduplicated storage (**>94% bandwidth saved**, e.g., 82.8 GB raw ➔ 4.8 GB stored).
- **AES-256 E2EE Cryptographic Vault:** Secure enclave for confidential files with biometric/passphrase challenge and zero-knowledge client decryption.
- **Multi-Segment Storage Quota Bar:** 100 GB unified allowance meter across Mail, Drive, and Git with `85.8 GB free` badge.
- **File Version History & Rollback:** Linear version stack with 1-click restore to any previous snapshot.

### Pillar 4: QuantContacts / QuantDex (Apple Contacts & Superhuman VIPs)
- **Interactive A–Z Alphabet Jump Slider:** Fast right-edge slider enabling instant jumping across thousands of entries.
- **VIP Contact Cards:** Gradient avatar with online beacon dot, verified domain badge, and 4 circular action pills (`[Call]`, `[Email]`, `[Chat]`, `[Share]`).
- **AI Deduplication & Merge Wizard:** Automated scanning for duplicate phone numbers, emails, or names with side-by-side conflict resolution.

### Pillar 5: QuantGit / CodeHub (GitHub Mobile & Linear Category Killer)
- **Repository Code Tree Explorer:** Full branch switcher, file tree hierarchy, and syntax-highlighted code viewer.
- **PR 3-Way Merge & Inline Review:** Visual diff inspector (additions/deletions) with line-by-line comment threads and branch protection merge gate.
- **Streaming CI/CD Runner:** Real-time monotonic build log stream powered by gVisor container isolation.
- **Quanty In-Repo Copilot Drawer:** Expandable bottom drawer for automated AI pull request reviews and merge assistance.

---

## 🎨 5. VISUAL PALETTE, DESIGN TOKENS & SVG SPECIFICATIONS

### A. Obsidian Void Color Tokens
| Token | Hex Value | Semantic Purpose |
| :--- | :--- | :--- |
| `--quant-void-obsidian` | `#090A0E` | Main application background (OLED energy-saving) |
| `--quant-surface-card` | `#12151E` | Card containers, list items, and modal dialogs |
| `--quant-surface-elevated`| `#181C28` | Dropdown menus, tooltips, and floating docks |
| `--quant-border-hairline` | `#1E222A` | 1px hairline card borders and horizontal dividers |
| `--quant-text-primary` | `#F3F4F6` | High-contrast headings, unread email subjects |
| `--quant-text-secondary` | `#9CA3AF` | Read email text, timestamps, file size badges |
| `--quant-text-muted` | `#6B7280` | Subtle metadata, shortcuts, helper text |

### B. Pillar Accent Tokens
| Pillar | Hex Value | Semantic Purpose |
| :--- | :--- | :--- |
| **QuantMail** | `#F59E0B` (Amber) | Mail unread badges, star states, triage actions |
| **QuantCalendar** | `#10B981` (Emerald) | Calendar event indicators, meeting join pills |
| **QuantDrive** | `#3B82F6` (Electric Blue) | File upload progress, folder icons, quota meter |
| **QuantContacts** | `#8B5CF6` (Violet) | VIP badges, contact avatars, communication pills |
| **QuantGit** | `#22C55E` (Git Green) | Active branches, successful CI builds, PR approvals |

### C. Strict SVG Iconography Guidelines
- All icons must be rendered using vector paths with scalable `viewBox="0 0 24 24"`.
- Use `strokeWidth="1.75"` or `2.0` with `strokeLinecap="round"` and `strokeLinejoin="round"`.
- Sample SVG implementations:
  - **Mail Icon:** `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`
  - **Calendar Icon:** `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`
  - **Drive Icon:** `<polygon points="12 2 2 19 22 19"/><polyline points="7 14 12 5 17 14"/>`
  - **Code Icon:** `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`

---

## 💻 6. MONOREPO DIRECTORY STRUCTURE

```
Quant-Ecosystem/
├── apps/
│   └── quantmail/                     # NEXT.JS 15 WEB SURFACE
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/            # Login, SSO, Phone KYC routes
│       │   │   ├── drive/             # QuantDrive web interface
│       │   │   ├── calendar/          # QuantCalendar & /booking/:slug
│       │   │   ├── contacts/          # QuantContacts directory
│       │   │   ├── quantgit/          # CodeHub Git tree & PR review
│       │   │   ├── marketing/         # Public SEO landing with app download banner
│       │   │   ├── layout.tsx         # Super-App 3-Tier Top Bar & Root Shell
│       │   │   └── page.tsx           # Superhuman Mail Inbox
│       │   ├── components/            # High-density SVG & Three.js components
│       │   └── brand/                 # Design tokens and visual lockups
│       └── backend/                   # Fastify REST & WebSocket API endpoints
│
├── flutter_apps/
│   ├── apps/
│   │   ├── quant_mail/                # QUANTMAIL SOVEREIGN FLUTTER APP
│   │   │   ├── lib/
│   │   │   │   ├── models/            # Mail, Calendar, Drive, Contact models
│   │   │   │   ├── screens/           # Super-App screen implementations
│   │   │   │   │   ├── mail/          # Superhuman Inbox & Thread Details
│   │   │   │   │   ├── calendar/      # Schedule & Public Booking Sheets
│   │   │   │   │   ├── drive/         # FastCDC Explorer & Vault Sheets
│   │   │   │   │   ├── contacts/      # A-Z VIP List & Detail Sheets
│   │   │   │   │   ├── quantgit/      # Repos, PRs & Action Terminals
│   │   │   │   │   └── superapp/      # Amazon/Flipkart Top Bar & Category Rail
│   │   │   │   └── main.dart          # Multiplatform entrypoint
│   │   │   ├── android/               # Android SDK 36 Runner (com.quant.mail)
│   │   │   ├── ios/                   # iOS Xcode Runner (Impeller enabled)
│   │   │   ├── windows/               # Win32 C++ Desktop Runner
│   │   │   ├── macos/                 # macOS Cocoa Runner
│   │   │   └── test/                  # Test suites (quant_mail_test.dart)
│   │   │
│   │   ├── quant_chat/                # Sovereign WhatsApp/Signal killer
│   │   ├── quant_gram/                # Sovereign Instagram/TikTok killer
│   │   ├── quant_tube/                # Sovereign YouTube/Spotify killer
│   │   └── quant_ai/                  # Sovereign ChatGPT/Agent OS killer
│   │
│   └── packages/                      # SHARED FLUTTER PACKAGES
│       ├── quant_theme/               # Obsidian color tokens & typography
│       ├── quant_ui/                  # Reusable widgets (Zero emojis, Zero clipPath)
│       ├── quant_api/                 # Dio HTTP/2 client with Bearer auth
│       ├── quant_auth/                # Hardware KeyStore & Biometric authentication
│       └── quant_core/                # Shared utilities & FastCDC models
│
└── services/                          # 14 DISTRIBUTED BACKEND SERVICES
    ├── smtp-inbound/                  # Inbound RFC 5321 mail receiver
    ├── smtp-submission/               # Outbound SES delivery with DKIM/ARC
    ├── imap-server/                   # RFC 3501 mailbox synchronization
    ├── ws-gateway/                    # Realtime WebSocket event broker
    ├── git-server/                    # Praefect 3-Node Raft Git Engine
    └── ci-runner/                     # gVisor sandboxed task execution
```

---

## 🚀 7. PRODUCTION DEPLOYMENT & GO-LIVE RUNBOOK

### Surface 1: Next.js 15 Web Workspace
1. **Container Packaging:** Multi-stage Docker build targeting Node.js 22 LTS Alpine with Next.js standalone output.
2. **Kubernetes Deployment:** Rolling update deployments to AWS EKS cluster (`quant-staging` and `quant-production`).
3. **Edge Caching & DNS:** Cloudflare Enterprise CDN with automatic SSL termination, Brotli compression, and DDoS protection on `https://quantmail.in`.

### Surface 2: Android Native Application (`com.quant.mail`)
1. **Compilation:** Release compilation targeting Android SDK 36:
   ```powershell
   flutter build appbundle --release
   ```
2. **Direct APK Distribution:** Signed APK published to `https://quantmail.in/download/quant-mail.apk` for instant direct installation.
3. **Google Play Store:** Upload `.aab` bundle to Google Play Console with automated phased rollout.

### Surface 3: Windows Desktop Installer (`QuantMail.exe`)
1. **Compilation:** Native C++ release build via CMake:
   ```powershell
   flutter build windows --release
   ```
2. **Packaging:** Inno Setup script creating a standalone installer (`QuantMail-Setup.exe`) configuring start menu shortcuts, system tray minimization, and global hotkey hooks (`Ctrl+K`, `Z`).

### Surface 4: iOS Native Application
1. **Compilation:** Xcode archive signed with Apple Developer Distribution Certificate.
2. **Distribution:** TestFlight beta distribution followed by App Store production submission.

---

## 💡 8. VERIFICATION GATES & COMPLIANCE SCORECARD

Every commit to QuantMail must pass the following binary verification gates:

- [x] **Gate 1: Zero Raw Emojis:** 100% vector-only iconography across Web and Flutter codebases.
- [x] **Gate 2: Zero Skia `clipPath`:** No RenderThread SIGSEGV crashes on Android.
- [x] **Gate 3: Full Monorepo Typecheck:** `tsc --noEmit` and Dart static analysis exit with code 0 (zero errors).
- [x] **Gate 4: Comprehensive Test Suite:** 100% passing tests across Web Vitest suites and Flutter widget test files.
- [x] **Gate 5: Amazon/Flipkart Super-App UX:** Validated 3-Tier navigation hierarchy with instant pillar switching.
