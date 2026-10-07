# QuantChat Flutter workspace

Shift 1 of the dedicated QuantChat Flutter build (Phase 3b — deep per-app
fleet): **melos scaffold + app entry (OAuth2+PKCE login via QuantMail SSO)**.
QuantChat is the chat face of the 9-app Quant ecosystem — QuantMail's
chat-bhai, not its copy. Real-time messaging against the ws channels of the
QuantChat API contract.

## Spec source (do NOT invent endpoints)

- `~/workspace/quantmail-omnipresent/app-foundations/quantchat/openapi.yaml`
  — 122 paths, already repaired/reviewed.
- `~/workspace/quantmail-omnipresent/app-foundations/quantchat/API_NOTES.md`

Only endpoints present in that contract may be called. Unverified contract
details are marked `TODO(UNVERIFIED)` in code, never invented.

## Layout

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md
└── packages/
    ├── quant_chat/             # the Flutter application (Riverpod + go_router)
    │   ├── android/            # (W3, shift 1: minimal runner setup)
    │   ├── ios/                # (W3, shift 1: minimal runner setup)
    │   └── test/               # widget/unit tests
    └── chat_core/              # shared domain: providers, repositories, models
```

## Packages

- **quant_chat** — the installable app.
- **chat_core** — app logic shared by present and future clients
  (repositories, Riverpod providers, domain models). Plain providers, no
  codegen — `build_runner` is deliberately absent in this phase.

Both packages depend on the Phase 0 foundation package, which lives OUTSIDE
this workspace and is referenced by relative path (read-only from here; never
edited from this workspace):

```
../../../../../../phase0/foundation   # relative to packages/<name>/pubspec.yaml
```

That is 6 levels up from `packages/<name>/`:
`quant_chat → packages → flutter → quantchat → apps → phase3 →
quantmail-omnipresent`. Verified identical depth to the QuantMail workspace
(also 6 ups), so the same relative path is used here.

`quant_foundation` provides: the Dio API client (auth/refresh/retry
interceptors), `TokenManager` (secure storage + auth-state stream), OAuth2 PKCE
helpers, and the `@quant/brand` Material 3 theme. Design docs:
`../../../../phase0/foundation/README.md`,
`../../../../phase0/AUTH_CONTRACT.md`,
`../../../../phase0/API_CLIENT.md`.

## Auth: QuantMail SSO (D1)

QuantChat does NOT run its own OAuth2 flow. Sign-in happens through the
**QuantMail OAuth2+PKCE system-browser flow** (the same `TokenManager` +
`url_launcher` pattern as `phase1/apps/quantmail/flutter/`); QuantChat
receives the ecosystem token. No new endpoints, no new client registration.
The OAuth client_id and issuer URLs live in config, marked
`TODO(UNVERIFIED)` until confirmed against the deployed backend.

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

## Conventions

- No mocks: where a backend contract is unverified, mark `TODO(UNVERIFIED)`.
- `flutter_lints` conventions everywhere; strict casts and strict raw types on.
- GitHub is read-only for build agents; repo-ready changes go to
  `phase6/repo-staging/`.
- This workspace only: never write into `phase1/`, `phase0/`, or other apps'
  directories from here (read-only copy-adapt sources).
