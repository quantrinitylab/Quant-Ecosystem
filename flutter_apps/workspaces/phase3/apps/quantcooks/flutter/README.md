# QuantCooks — Flutter app

QuantCooks is the **creator/tools face** of the 9-app Quant ecosystem: a
CapCut/Figma-class editing and canvas experience, omnipresent on iOS,
Android, and Desktop via Flutter. Canvas/editor performance is the core
bet, so the app is built to keep the 60fps editing surface sacred.

This directory (`flutter/`) is the Shift-1 workspace: a melos monorepo
with two packages.

## Packages

| Package            | Role                                                              |
|--------------------|-------------------------------------------------------------------|
| `quantcooks_core`  | Domain models, repositories, Riverpod providers (Shift 1: scaffold + auth groundwork) |
| `quantcooks_app`   | The Flutter app shell: routing, screens, theme consumption        |

Shared foundation (`quant_foundation`, read-only, in
`../../../../../..` → `phase0/foundation`) provides the Dio API client with
auth/refresh/retry interceptors, the secure `TokenManager`, OAuth2+PKCE
helpers, and the @quant/brand Material 3 theme. The Phase 1 QuantMail app
structure (`phase1/apps/quantmail/flutter`) is the copy-adapt reference for
the login flow, interceptors, and Riverpod+go_router layout.

## Shift 1 scope

- melos workspace scaffold (`melos.yaml`, per-package `pubspec.yaml`s,
  `analysis_options.yaml`, `.gitignore`, this README)
- Theme from Phase 0 design tokens (see worker W2's output)
- Login screen: OAuth2+PKCE against QuantMail SSO (worker W3, copied from
  the phase1 pattern)
- `lib/` source files: W2/W3/W4 (other workers own their files)

The QuantCooks OpenAPI spec (`app-foundations/quantcooks/openapi.yaml`)
does not exist yet; no backend endpoints are invented. Any unverified
backend fact is marked `TODO(UNVERIFIED)`. API wiring lands in a later
shift once the spec is published.

## Running it

Requires the Flutter SDK (>= 3.22.0, Dart >= 3.4.0), **not installed in
this build environment** — code here is written to `flutter_lints`
conventions and has not been compiled or analyzed here.

```bash
dart pub global activate melos
melos bootstrap   # link local packages + `flutter pub get` everywhere
melos run analyze # dart analyze across all packages
melos run test    # flutter test across all packages
flutter run       # run the quantcooks_app package
```

## Directory ownership

This `flutter/` tree belongs to the `flutter-quantcooks` program. Other
apps' trees (`phase3/apps/<other-app>/`) and `phase0`/`phase1` are
read-only; GitHub access is read-only. One shift = one bounded chunk.
