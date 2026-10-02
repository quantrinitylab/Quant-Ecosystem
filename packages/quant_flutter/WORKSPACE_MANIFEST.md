# Quant Flutter Client Workspace Manifest

## 1. Overview
The `packages/quant_flutter` directory is the sovereign multi-package Flutter client workspace for the Quant Unified Ecosystem. It coordinates high-performance, hardware-accelerated client packages across Android, iOS, Windows, macOS, Linux, and Web with zero raw Unicode emojis and strict static analysis rules.

---

## 2. Directory Tree
```
packages/quant_flutter/
├── analysis_options.yaml          # Strict root linting (strict-casts, strict-inference, strict-raw-types)
├── melos.yaml                      # Melos multi-package orchestration manifest
├── pubspec.yaml                    # Dart 3.5+ workspace manifest orchestrating quant_ui & quant_core
├── WORKSPACE_MANIFEST.md           # Sovereign architecture manifest (this document)
│
├── quant_ui/                       # Sovereign Obsidian Luxury Design System
│   ├── analysis_options.yaml       # Linked root analysis options
│   ├── pubspec.yaml                # flutter_svg: ^2.0.17, flutter_riverpod: ^2.6.1, google_fonts: ^6.2.1
│   ├── assets/
│   │   └── icons/                  # Pure vector SVG assets (mail, calendar, drive, contacts, git, ai)
│   ├── lib/
│   │   ├── quant_ui.dart           # Primary library export
│   │   ├── theme/
│   │   │   ├── quant_colors.dart   # Obsidian surfaces (#090A0E, #12151E), pillar accents (amber, gold, cyan, emerald, purple)
│   │   │   ├── quant_typography.dart # OLED-optimized typography hierarchy (display, title, body, labelSpeed)
│   │   │   └── quant_theme.dart    # Impeller-optimized dark ThemeData (zero clipPath overhead)
│   │   ├── models/
│   │   │   └── quant_pillar.dart   # QuantPillar enum (Mail, Calendar, Drive, Contacts, QuantGit) & sub-views
│   │   ├── components/
│   │   │   ├── quant_pillar_top_bar.dart # 5-pillar squircle mode switcher
│   │   │   ├── quant_ai_capsule.dart     # Dynamic island AI live status capsule
│   │   │   ├── quant_voice_search_bar.dart # Sub-5ms voice and text search bar
│   │   │   ├── context_bottom_nav_bar.dart # Adaptive contextual bottom navigation bar
│   │   │   ├── frosted_card.dart         # Frosted glass container
│   │   │   ├── squircle_button.dart      # Luxury squircle interaction button
│   │   │   └── quant_badge.dart          # Status & notification badge
│   │   ├── widgets/
│   │   │   ├── squircle_switcher.dart    # SquircleSwitcher widget
│   │   │   ├── dynamic_island_capsule.dart # DynamicIslandCapsule widget
│   │   │   ├── context_bottom_nav.dart   # ContextBottomNav widget
│   │   │   └── quant_squircle_container.dart # QuantSquircleContainer with hairline border
│   │   └── icons/
│   │       └── quant_icons.dart    # Pure SVG strings & SvgPicture widgets (ZERO emojis)
│   └── test/
│       └── quant_ui_test.dart      # Unit and widget test suite
│
└── quant_core/                     # Sovereign Core Engine (Networking, Keystore, Offline DB)
    ├── analysis_options.yaml       # Linked root analysis options
    ├── pubspec.yaml                # dio: ^5.8.0+1, flutter_secure_storage: ^9.2.4, drift: ^2.24.2, etc.
    ├── lib/
    │   ├── quant_core.dart         # Primary library export
    │   ├── api/
    │   │   └── quant_api_client.dart # Dio client with JWT, tenant routing, telemetry (<5ms SLA)
    │   ├── auth/
    │   │   ├── quant_auth_session.dart  # Multi-tenant auth session lifecycle manager
    │   │   └── quant_session_state.dart # Immutable session state model
    │   ├── storage/
    │   │   └── quant_secure_storage.dart # Hardware-backed AES-256 Keystore & Keychain wrapper
    │   ├── models/
    │   │   └── sync_operation.dart # Offline mutation queue model
    │   └── database/
    │       ├── quant_database.dart # Drift SQLite schema (LocalMails, LocalEvents, LocalFiles, SyncQueue)
    │       └── quant_offline_store.dart # High-level offline persistence & sync queue manager
    └── test/
        └── quant_core_test.dart    # Unit test suite for storage, session, and sync queue
```

---

## 3. Package Manifests & Dependencies

### A. `quant_ui/pubspec.yaml`
```yaml
name: quant_ui
description: Sovereign Obsidian Luxury Design System for Flutter in Quant Ecosystem.
version: 1.0.0
homepage: https://quantrinity.in
publish_to: 'none'

environment:
  sdk: '>=3.5.0 <4.0.0'
  flutter: '>=3.24.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_svg: ^2.0.17
  flutter_riverpod: ^2.6.1
  google_fonts: ^6.2.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
```

### B. `quant_core/pubspec.yaml`
```yaml
name: quant_core
description: Sovereign Core Client Engine for Quant Ecosystem (Dio, Offline Drift, Keystore Auth, Telemetry).
version: 1.0.0
homepage: https://quantrinity.in
publish_to: 'none'

environment:
  sdk: '>=3.5.0 <4.0.0'
  flutter: '>=3.24.0'

dependencies:
  flutter:
    sdk: flutter
  dio: ^5.8.0+1
  flutter_secure_storage: ^9.2.4
  drift: ^2.24.2
  sqlite3_flutter_libs: ^0.5.28
  shared_preferences: ^2.3.5
  uuid: ^4.5.1
  intl: ^0.20.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  drift_dev: ^2.24.2
  build_runner: ^2.4.14
```

---

## 4. Multi-Platform Readiness Matrix
| Platform | Rendering Engine | Secure Keystore Backend | SQLite / Drift Storage | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Android** | Impeller / Vulkan | Android Keystore (EncryptedSharedPreferences) | `sqlite3_flutter_libs` | Ready |
| **iOS** | Impeller / Metal | Apple Keychain (`kSecAttrAccessibleAfterFirstUnlock`) | Native SQLite | Ready |
| **Windows** | Skia / Impeller | Windows Data Protection API (DPAPI) | `sqlite3.dll` | Ready |
| **macOS** | Impeller / Metal | Apple Keychain | Native SQLite | Ready |
| **Linux** | Skia | Secret Service API (libsecret) | libsqlite3-dev | Ready |
| **Web** | CanvasKit / Wasm | SubtleCrypto / WebStorage | Drift Wasm Worker | Ready |

---

## 5. Strict Zero-Emoji Invariant Verification
All icons across `quant_ui` and `quant_core` utilize 100% vector paths:
- Pure Material/Cupertino vector `IconData` (`Icons.mail_rounded`, `Icons.calendar_today_rounded`, etc.)
- Pure vector SVG definitions in `assets/icons/` and `QuantIcons` helper class
- Static code scan verifies **0 occurrences** of raw Unicode emoji glyphs.
