# QuantAds Flutter workspace

Phase 3b (fleet) slice of the Quant ecosystem program: **QuantAds**, the
ads/monetization face of the ecosystem. Competitors: **Meta Ads, Google Ads**.
QuantAds is the app through which the **Quant Credits economy** (ecosystem
bet #2) runs — advertisers spend credits, creators earn them, and the
attention economy is settled on the shared spine.

Phase 3b build order (bounded chunks, spec-gated): scaffold + theme + login
(OAuth2+PKCE, QuantMail SSO) → advertiser dashboard → campaign builder →
credits wallet. No API wiring before the QuantAds OpenAPI spec exists
(`../../app-foundations/quantads/openapi.yaml` + `API_NOTES.md`).

## Layout

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md
└── packages/
    ├── ads_app/                # the Flutter application (Riverpod + go_router)
    │   ├── android/            # minimal Gradle wiring (applicationId below)
    │   ├── ios/                # Info.plist + AppDelegate + SETUP_NOTE
    │   ├── macos|linux|windows/# runner stubs / setup notes
    │   └── test/               # widget/unit tests (later workers fill in)
    ├── ads_core/               # shared domain: campaign models, providers, repositories
    └── ads_theme/              # QuantAds design tokens on the Phase 0 brand theme
```

## Packages

- **ads_app** — the installable app. Android `applicationId`
  `com.quantrinity.quantads`, `minSdk 24`.
- **ads_core** — app logic (campaign/ad-group models, credits-wallet state,
  Riverpod providers, repositories). Plain providers, no codegen —
  `build_runner` is deliberately absent.
- **ads_theme** — design tokens adapted from the Phase 0 `@quant/brand`
  foundation into a QuantAds look (advertiser dashboards read like finance,
  not email).

All packages depend on the Phase 0 foundation package, which lives OUTSIDE
this workspace and is referenced by relative path (read-only from here; never
edited from this workspace):

```
../../../../../../phase0/foundation   # relative to packages/<name>/pubspec.yaml
```

> **Path note:** six levels up from `packages/<name>/pubspec.yaml`:
> `packages → flutter → quantads → apps → phase3 → quantmail-omnipresent`,
> then into `phase0/foundation`. Same depth as the Phase 1 QuantMail
> workspace (`phase1/apps/quantmail/flutter/`). Re-verify with
> `flutter pub get` once the SDK is available.

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
- GitHub is read-only for build agents; repo-ready changes stay in this
  workspace until the user approves a push.
