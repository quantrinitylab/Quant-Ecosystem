# QuantMail Flutter workspace

Phase 1 vertical slice of the QuantMail omnipresent program:
**Login (OAuth2+PKCE) → Inbox list → Thread view**, built against the real
Fastify backend with an offline drift/SQLite cache.

## Layout

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md
└── packages/
    ├── quant_app/              # the Flutter application (Riverpod + go_router)
    │   ├── android/            # minimal Gradle wiring (applicationId below)
    │   ├── ios/                # Info.plist + AppDelegate + SETUP_NOTE
    │   ├── macos|linux|windows/# runner stubs / setup notes
    │   └── test/               # widget/unit tests (W2/W3 fill in)
    └── quant_core/             # shared domain: providers, repositories, models
```

## Packages

- **quant_app** — the installable app. Android `applicationId`
  `com.quantrinity.quantmail`, `minSdk 24`.
- **quant_core** — app logic shared by present and future clients
  (repositories, Riverpod providers, domain models). Plain providers, no
  codegen — `build_runner` is deliberately absent in Phase 1.

Both packages depend on the Phase 0 foundation package, which lives OUTSIDE
this workspace and is referenced by relative path (read-only from here; never
edited from this workspace):

```
../../../../../../phase0/foundation   # relative to packages/<name>/pubspec.yaml
```

> **Path note:** the leaf-task brief quoted `../../../../phase0/foundation`.
> That depth only resolves if the workspace sat directly under `phase1/`.
> The real nesting is `phase1/apps/quantmail/flutter/`, so the pubspecs use
> six levels up. Re-verify with `flutter pub get` once the SDK is available.

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
conventions and validated on the next SDK-equipped run.

## Platform runners

- **android/** ships minimal, real Gradle wiring (Kotlin DSL) plus
  `AndroidManifest.xml` (INTERNET permission, Custom Tabs query for the
  OAuth2/PKCE system-browser flow) and a one-line `MainActivity`.
- **ios/** ships a real `Info.plist` + `AppDelegate.swift`.
- **ios/macos/linux/windows** each carry a `SETUP_NOTE.md` explaining how to
  generate the full, buildable runner with `flutter create .` on a machine
  with the SDK. We do not commit fabricated `project.pbxproj`/`CMakeLists`
  files.

## Conventions

- No mocks: where a backend contract is unverified, mark `TODO(UNVERIFIED)`.
- `flutter_lints` conventions everywhere; strict casts and strict raw types on.
- GitHub is read-only for build agents; repo-ready changes go to
  `phase1/repo-staging/`.
