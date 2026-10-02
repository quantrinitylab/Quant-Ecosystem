# QuantGram Flutter workspace

Dedicated Flutter monorepo for **QuantGram** — the social/photo face of the
Quant ecosystem, competing with Instagram. Media performance (image caching,
smooth 60fps feed scroll) is the primary engineering constraint of every shift.

> **Note:** the Flutter SDK is NOT present in this build environment, so the
> code cannot be compiled here. Import paths and constructor signatures were
> hand-verified against the Flutter/Dart APIs and the phase1 copy-adapt
> sources. Run `melos bootstrap` + `melos run analyze` on a machine with the
> SDK before trusting any shift's output.

## Workspace map

```
flutter/
├── melos.yaml                 # workspace: quantgram_flutter, packages/**
├── analysis_options.yaml      # flutter_lints + strict-casts/strict-raw-types
├── README.md                  # this file
└── packages/
    ├── gram_core/             # shared config + bootstrap (+ theme/auth in W2/W3)
    │   ├── pubspec.yaml
    │   └── lib/
    │       ├── gram_core.dart              # barrel (config + bootstrap only)
    │       └── src/
    │           ├── config/app_config.dart  # --dart-define config, AppEnv, S4 https-only
    │           └── bootstrap/app_bootstrap.dart  # cold-start + PERF-2 post-frame probe
    └── gram_app/              # the app
        ├── pubspec.yaml       # + cached_network_image (feed, declared early)
        └── lib/
            ├── main.dart      # bootstrap → runApp → unawaited probe
            └── src/app.dart   # GramApp (MaterialApp.router, system themeMode)
```

## Shift 1 file ownership (W1–W4, parallel workers)

| Owner | Files (owned exclusively — do not touch another worker's files) |
|-------|----------------------------------------------------------------|
| **W1** (scaffold/config/bootstrap) | `melos.yaml`, `analysis_options.yaml`, `README.md`, `packages/gram_core/pubspec.yaml`, `packages/gram_core/lib/gram_core.dart`, `packages/gram_core/lib/src/config/**`, `packages/gram_core/lib/src/bootstrap/**`, `packages/gram_app/pubspec.yaml`, `packages/gram_app/lib/main.dart`, `packages/gram_app/lib/src/app.dart` |
| **W2** (theme) | `packages/gram_core/lib/src/theme/**`, theme exports in `gram_core.dart` |
| **W3** (auth/api) | `packages/gram_core/lib/src/auth/**`, `packages/gram_core/lib/src/api/**`, `packages/gram_core/lib/src/providers/**`, auth/api exports in `gram_core.dart` |
| **W4** (router + login) | `packages/gram_app/lib/src/router/**`, `packages/gram_app/lib/src/features/login/**` |

Cross-cutting contracts this shift:
- W2 implements `ThemeData buildGramTheme(Brightness brightness)` (used by `GramApp`).
- W4 implements `src/router/app_router.dart` exposing the `GoRouter` passed to `GramApp(router:)`.
- W3 replaces the raw secure-storage probe with a warmed `TokenManager` (TODO in `app_bootstrap.dart`).

## Build commands

Requires Flutter SDK ≥ 3.22.0 / Dart ≥ 3.4.0.

```bash
dart pub global activate melos
melos bootstrap        # link local packages + `flutter pub get`
melos run analyze      # dart analyze across all packages
melos run test         # flutter test across all packages
```

## Configuration (`--dart-define`)

| Flag | Default | Notes |
|------|---------|-------|
| `GRAM_API_BASE_URL` | `https://api.quantgram.example` | **TODO(UNVERIFIED)** — prod host pending board decision |
| `GRAM_APP_ENV` | `dev` | `dev` / `staging` / `prod` |
| `GRAM_OAUTH_CLIENT_ID` | `""` | **TODO(UNVERIFIED)** — QuantGram SSO client not provisioned yet |
| `GRAM_OAUTH_REDIRECT_SCHEME` | `quantgram` | |
| `GRAM_OAUTH_REDIRECT_URI` | `quantgram://oauth/callback` | |
| `GRAM_OAUTH_TOKEN_PATH` | `/oauth/token` | **TODO(UNVERIFIED)** — assumed from QuantMail contract |
| `GRAM_OAUTH_AUTHORIZE_PATH` | `/oauth/authorize` | **TODO(UNVERIFIED)** — assumed from QuantMail contract |
| `GRAM_REQUEST_TIMEOUT_SECONDS` | `30` | |
| `GRAM_REFRESH_LEEWAY_SECONDS` | `120` | |

## Security & perf notes

- **S4 (Security):** `GRAM_API_BASE_URL` must use `https`. `AppConfig.validateBaseUrlScheme()`
  asserts in debug and throws in release for non-https; only `localhost` /
  `127.0.0.1` / `10.0.2.2` are tolerated, and only in non-release builds.
- **PERF-2:** the secure-storage readability probe runs via `unawaited()` AFTER
  `runApp` (never pre-first-frame), with a 400 ms timeout guard.
- **No theatre:** unknown endpoints/configs are marked `TODO(UNVERIFIED)` —
  the app-foundations spec for QuantGram does not exist yet, so no API wiring
  happens in Shift 1.
