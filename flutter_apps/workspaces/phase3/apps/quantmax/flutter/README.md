# QuantMax Flutter workspace

QuantMax — the Quant ecosystem's **short-video / discovery app**, built to
compete with TikTok. Flutter (iOS, Android, Desktop) + retained web. The
non-negotiable: **60fps scroll and instant playback** — every architectural
choice below serves that.

## Where things are

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md
└── packages/
    ├── quantmax_app/           # the Flutter application (Riverpod + go_router)
    │   ├── android/            # minimal Gradle wiring (applicationId below)
    │   ├── ios/                # Info.plist + AppDelegate + SETUP_NOTE
    │   ├── macos|linux|windows/# setup notes (generate runners via flutter create)
    │   └── lib/src/
    │       ├── app.dart        # QuantMaxApp (dark-first theme)
    │       ├── router/app_router.dart   # /login, /, /oauth2redirect, auth gate
    │       └── screens/login_screen.dart # W4 (next): OAuth2+PKCE login
    └── quantmax_core/          # shared domain: config, providers, theme, auth, api
        └── lib/
            ├── quantmax_core.dart       # barrel (some exports land with W2/W3)
            └── src/
                ├── config/app_config.dart        # --dart-define backed config
                ├── bootstrap/app_bootstrap.dart  # first-frame-safe cold start
                └── providers/core_providers.dart # appConfig/secureStorage/dio
```

## Packages

- **quantmax_app** — the installable app. Android `applicationId`
  `com.quantrinity.quantmax`, `minSdk 24`. OAuth redirect:
  `com.quantrinity.quantmax:/oauth2redirect` (custom scheme — not an App Link).
- **quantmax_core** — app logic shared by present and future clients
  (config, Riverpod providers, theme, auth, API client). Plain providers, no
  codegen — `build_runner` is deliberately absent in the scaffold shift.

No Phase 0 `quant_foundation` path dependency here (unlike the QuantMail
workspace): QuantMax owns its Dio stack and theme inside `quantmax_core`
(W2/W3 fill them in).

## Shift 1 worker map (this scaffold)

| Worker | Owns |
|--------|------|
| W1 (scaffold) | this tree: melos, pubspecs, main/app/router, core config+bootstrap+providers, platform runners |
| W2 (theme) | `quantmax_core/lib/src/theme/`: `quant_colors.dart`, `quant_typography.dart`, `quant_motion.dart`, `quantmax_theme.dart` — must export top-level `quantmaxThemeDark` / `quantmaxThemeLight` (already referenced by `app.dart`) |
| W3 (auth+api) | `quantmax_core/lib/src/auth/`: `auth_exceptions.dart`, `auth_providers.dart` (**must provide `authStateProvider`**, assumed `StreamProvider<AuthState>` with `.isAuthenticated` — see `app_router.dart` TODO), `auth_repository.dart`, `auth_api.dart`, `token_manager.dart`, `silent_refresh.dart`; `src/api/`: `api_result.dart`, `quant_api_client.dart`, `interceptors/{auth,refresh,retry}_interceptor.dart` |
| W4 (login) | `quantmax_app/lib/src/screens/login_screen.dart` — `LoginScreen` (const ctor), OAuth2+PKCE via QuantMail SSO |

## Bootstrap (needs Flutter SDK >= 3.22.0, Dart >= 3.4.0)

```sh
dart pub global activate melos
melos bootstrap        # links local path deps + `flutter pub get` everywhere
melos run analyze      # dart analyze across all packages
melos run test         # flutter test across all packages
```

The build agents' environment has no Flutter SDK, so `melos`/`flutter` have
not been run here — config is written carefully against `flutter_lints`
conventions and validated on the next SDK-equipped run. **Expect analyzer
errors until W2/W3/W4 land** (barrel exports and the `LoginScreen` import are
pre-wired on purpose).

### --dart-define flags

```sh
flutter run \
  --dart-define=QUANTMAX_API_BASE_URL=https://api.quantrinity.in \
  --dart-define=QUANTMAX_OAUTH_CLIENT_ID=client_... \
  --dart-define=QUANTMAX_OAUTH_REDIRECT_SCHEME=com.quantrinity.quantmax \
  --dart-define=QUANTMAX_OAUTH_REDIRECT_URI=com.quantrinity.quantmax:/oauth2redirect
```

`QUANTMAX_API_BASE_URL` is **https-only** (asserted in `AppConfig`, S4 lesson).

## Platform runners

- **android/** ships minimal, real Gradle wiring (Kotlin DSL) plus
  `AndroidManifest.xml` (INTERNET permission, Custom Tabs query for the
  OAuth2/PKCE system-browser flow, `android:allowBackup="false"` per S5 so
  tokens never land in device backups) and a one-line `MainActivity`.
- **ios/** ships a real `Info.plist` (custom URL scheme
  `com.quantrinity.quantmax` for the OAuth return; `CADisableMinimumFrameDurationOnPhone`
  kept ON for ProMotion 120Hz — this is a video app) + `AppDelegate.swift`.
- **ios/macos/linux/windows** each carry a `SETUP_NOTE.md` explaining how to
  generate the full, buildable runner with `flutter create .` on a machine
  with the SDK. We do not commit fabricated `project.pbxproj`/`CMakeLists`
  files.

## Conventions

- No mocks: where a backend contract is unverified, mark `TODO(UNVERIFIED)`.
  The QuantMax OpenAPI spec is not built yet — no endpoints are invented here.
- `TODO(NEXT-SHIFT)` marks the planned vertical slice (vertical video feed).
- `flutter_lints` conventions everywhere; strict casts and strict raw types on.
- GitHub is read-only for build agents; repo-ready changes go to
  `phase3/repo-staging/` (when it exists).
- First frame is sacred: nothing in `main()` blocks it (PERF-2). The
  secure-storage probe runs **after** `runApp`, post first frame.
