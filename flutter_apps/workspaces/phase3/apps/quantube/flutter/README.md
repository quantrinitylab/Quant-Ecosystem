# QuanTube Flutter (Phase 3 — Fleet)

Dedicated Flutter monorepo for **QuanTube**, the video/audio face of the
9-app Quant ecosystem. Competes with YouTube/Spotify: playback performance and
offline downloads are the product's core differentiators.

## Layout

```
flutter/
├── melos.yaml                      # melos workspace (packages/quantube_*)
├── analysis_options.yaml           # workspace lint set (flutter_lints)
├── .gitignore
├── README.md
└── packages/
    ├── quantube_core/              # shared core: theme + auth (barrel exports)
    └── quantube_app/               # the app: main.dart + app shell
```

## Quick start

> **Note:** the Flutter SDK is NOT installed in this build environment.
> All commands below run on a machine with Flutter >=3.22.0 and Dart >=3.4.0.

```sh
# one-time: install melos
dart pub global activate melos

# link local path deps + fetch packages in every package
melos bootstrap

# analyzer across all packages
melos run analyze

# tests across all packages
melos run test
```

## Shift 1 scope (bounded)

- melos package scaffold (this tree)
- `quantube_core` theme (design tokens) + auth barrel
- `quantube_app` entry point + login screen (OAuth2+PKCE via QuantMail SSO)

API wiring waits for the QuanTube OpenAPI spec
(`app-foundations/quantube/` — not written yet; see `TODO(UNVERIFIED)`).
