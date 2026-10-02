# QuantWave Flutter workspace

Phase 3 (Shift 1) scaffold of the QuantWave client — the **discussion /
threads face of the Quant 9-app ecosystem**, competing with X/Reddit.

Auth reuses the QuantMail SSO: **OAuth2+PKCE** against the existing backend
(D1 — no new endpoints). No backend contract invented here; anything
unverified is marked `TODO(UNVERIFIED)`.

## Layout

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md
└── packages/
    ├── quant_wave_app/         # the Flutter application (Riverpod + go_router)
    │   ├── android/            # minimal Gradle wiring (applicationId below)
    │   ├── ios/                # Info.plist + AppDelegate + SETUP_NOTE
    │   ├── macos|linux|windows/# runner stubs / setup notes
    │   └── lib/src/router/     # app_router.dart (W4): exports `appRouterProvider`
    └── quant_wave_core/        # shared domain: theme, auth, api core (W2 fills in)
```

## Packages

- **quant_wave_app** — the installable app. Android `applicationId`
  `com.quantrinity.quantwave`, `minSdk 24`. OAuth2 redirect scheme:
  `quantwave://oauth/callback`.
- **quant_wave_core** — shared app logic: design tokens theme, auth
  (OAuth2+PKCE via QuantMail SSO), and the Dio API core. Depends on
  `dio`, `flutter_secure_storage`, `rxdart`, `crypto`, `flutter_riverpod`.
  No `go_router` in core — navigation lives in the app package.

Both packages depend on the Phase 0 foundation package, which lives OUTSIDE
this workspace and is referenced by relative path (read-only from here; never
edited from this workspace):

```
../../../../../../phase0/foundation   # relative to packages/<name>/pubspec.yaml
```

That depth resolves from `phase3/apps/quantwave/flutter/` up to the
`quantmail-omnipresent/` root: `flutter/` → `quantwave/` → `apps/` →
`phase3/` → `quantmail-omnipresent/` → `workspace/` → home. Re-verify with
`flutter pub get` once the SDK is available.

`quant_foundation` provides: the Dio API client (auth/refresh/retry
interceptors), `TokenManager` (secure storage + auth-state stream), OAuth2 PKCE
helpers, and the `@quant/brand` Material 3 theme. Design docs:
`../../../../phase0/foundation/README.md`,
`../../../../phase0/AUTH_CONTRACT.md`,
`../../../../phase0/API_CLIENT.md`.

## Bootstrap (needs Flutter SDK >= 3.22.0, Dart >= 3.4.0)

```sh
dart pub global activate melos
melos bootstrap        # links local path deps + `flutter pub get` everywhere
melos run analyze      # dart analyze across all packages
melos run test         # flutter test across all packages
```

The build agents' environment has no Flutter SDK, so `melos`/`flutter` have
not been run here — config is written carefully against `flutter_lints`
conventions and validated on the next SDK-equipped run. The scaffold is
**uncompiled** until then.

## Platform runners

- **android/** ships minimal, real Gradle wiring (Kotlin DSL) plus
  `AndroidManifest.xml` (INTERNET permission, Custom Tabs query for the
  OAuth2/PKCE system-browser flow, `android:allowBackup="false"` per the
  quantmail S5 finding) and a one-line `MainActivity`.
- **ios/** ships a real `Info.plist` + `AppDelegate.swift`. Redirect scheme
  `quantwave` registered under `CFBundleURLSchemes`.
- **macos/linux/windows** each carry a `SETUP_NOTE.md` explaining how to
  generate the full, buildable runner with `flutter create .` on a machine
  with the SDK. We do not commit fabricated `project.pbxproj`/`CMakeLists`
  files.

## Conventions

- No mocks: where a backend contract is unverified, mark `TODO(UNVERIFIED)`.
- `flutter_lints` conventions everywhere; strict casts and strict raw types on.
- GitHub is read-only for build agents; repo-ready changes go to
  `phase3/repo-staging/`.

## Shift 2 — verify shift (2026-10-03)

Pehli baar `flutter analyze` + `flutter test` (SDK era). SDK:
`/home/hatch/flutter/bin/flutter` — Flutter **3.47.6** stable, Dart
**3.13.5**. (Bootstrap section ka "no SDK" note ab stale hai.)

```sh
cd packages/quant_wave_app && flutter pub get && flutter analyze && flutter test
cd ../quant_wave_core && flutter pub get && flutter analyze && flutter test
# ya melos se:  melos run analyze   /   melos run test
```

**W4 scope me verify hua (is shift):**
- Android `AndroidManifest.xml`: `quantwave://oauth/callback` deep-link
  intent-filter present (`android:scheme="quantwave"`, host `oauth`);
  `android:allowBackup="false"` (S5) present. Koi fix zaroori nahi tha.
- iOS `Info.plist`: `CFBundleURLSchemes` me `quantwave` registered
  (matches `quantwave://oauth/callback`). Koi fix zaroori nahi tha.
- Dono packages me `.dart_tool/package_config.json` maujood → `flutter pub
  get` already bootstrapped.
- `TODO(UNVERIFIED)` inventory: **13 matching lines, 7 Dart files me**
  (config, theme, timeline stub, browser launcher, auth API/repository).

**Baaki (W1/W2/W3 domain, parallel):** `flutter analyze` + `flutter test`
results unki reports se aayenge — yahan green claim nahi kiya gaya
(verify-don't-assume, army law 7).

**Blockers (unchanged):**
- U1: OAuth `client_id` unprovisioned (login vertical slice blocked).
- Prod API base URL `TODO(UNVERIFIED)`.
- `app-foundations/quantwave/` spec abhi bani nahi → timeline / thread view /
  compose-reply vertical slices spec ke baad.
