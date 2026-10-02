# QuantAI Flutter workspace

Dedicated Flutter app for **QuantAI** — the AI face of the 9-app Quant
ecosystem (Quanty lives here). Competes with ChatGPT/Claude-class assistants:
fast, conversational, multi-app AI actions, deep QuantMail context.

Phase 3b, Shift 1 scope: **melos scaffold + theme (design tokens) + login
(OAuth2+PKCE, QuantMail SSO)**. Chat/conversation UI, SSE streaming, and
optimistic AI actions come in later shifts **only against the verified spec**.

## Mission context

Read `~/workspace/quantmail-omnipresent/MISSION.md` first for the full program
(vision, competitors, D1–D5, the 3 bets). QuantAI is the AI-first surface, so
**D5 (AI-first latency architecture)** matters most here — SSE time-to-first-byte
instrumentation ships as a stub in Shift 1 and gets wired in Shift 2+.

## Layout

```
flutter/                        # this workspace root (melos)
├── melos.yaml                  # workspace definition + scripts
├── analysis_options.yaml       # shared lints (flutter_lints + strict casts/types)
├── README.md                   # this file
└── packages/
    ├── quantai_app/            # the Flutter application (Riverpod + go_router)
    │   ├── android/            # minimal runner (SETUP_NOTE until SDK run)
    │   ├── ios/                # Info.plist + SETUP_NOTE
    │   └── test/               # widget/unit tests (W4; unexecuted — no SDK)
    └── quantai_core/           # shared domain: providers, repositories, models
        ├── lib/
        │   ├── quantai_core.dart  # barrel (9 exports)
        │   └── src/            # AppConfig, providers, AuthRepository,
        │                       # AuthSessionNotifier, QuantAiApiClient,
        │                       # UsageGate, QuantAiSseClient
        └── test/               # unit tests (W4; unexecuted — no SDK)
```

**This directory is owned exclusively by the QuantAI fleet program.**
Other fleet programs must not write here. Conversely, nothing is written to
`phase1/`/`phase0/` or other apps' directories from here.

## Packages

- **quantai_app** — the installable app. Riverpod + go_router, Material 3
  theme from `@quant/brand` tokens (see Phase 0 foundation), login screen
  with OAuth2+PKCE against the shared QuantMail SSO.
- **quantai_core** — app logic shared by present and future clients
  (config, Riverpod providers, `AuthRepository`, session notifier, API/SSE
  client stubs, `UsageGate` credits stub). Plain providers, no codegen.

Both packages depend on the Phase 0 foundation package, which lives OUTSIDE
this workspace and is referenced by relative path (read-only from here; never
edited from this workspace):

```
../../../../../phase0/foundation   # relative to packages/<name>/pubspec.yaml
```

The real nesting is `phase3/apps/quantai/flutter/`, so the pubspecs use six
levels up (`../../../../../../phase0/foundation`), matching the Phase 1
QuantMail workspace. Re-verify with `flutter pub get` once the SDK is available.

`quant_foundation` provides: the Dio API client (auth/refresh/retry
interceptors), `TokenManager` (secure storage + auth-state stream), OAuth2 PKCE
helpers, and the `@quant/brand` Material 3 theme. Design docs:
`~/workspace/quantmail-omnipresent/phase0/foundation/README.md`,
`~/workspace/quantmail-omnipresent/phase0/AUTH_CONTRACT.md`,
`~/workspace/quantmail-omnipresent/phase0/API_CLIENT.md`.

Allowed foundation APIs used here: `AuthApi`, `TokenManager`,
`OAuthException`, `TokenSet`, `AuthorizeRequest`, `QuantApiClient`,
`QuantApiConfig`, `ApiResult`, `AuthState`, `RetryInterceptor`, `QuantColors`,
`QuantAppColors`, `QuantTextStyles`, `QuantTypography`. Anything else is a
drift finding (see Shift 1 drift notes below).

## Bootstrap (needs Flutter SDK >= 3.22.0, Dart >= 3.4.0)

```sh
dart pub global activate melos
melos bootstrap        # links local path deps + `flutter pub get` everywhere
melos run analyze      # dart analyze across all packages
melos run test         # flutter test across all packages
```

The build agents' environment has **no Flutter SDK**, so `melos`/`flutter`
have not been run here. Config is written against `flutter_lints`
conventions; a manual drift check covers every new file (imports, constructor
signatures, foundation API surface, cross-worker contracts) and is validated
on the next SDK-equipped run.

## Config: `--dart-define` flags

As implemented (W1, `src/config/app_config.dart`):

| Flag | Default | Meaning |
|---|---|---|
| `QUANTAI_API_BASE_URL` | `https://api.quantrinity.example` `TODO(UNVERIFIED)` | Backend base URL |
| `QUANTAI_OAUTH_CLIENT_ID` | `""` (empty — **unprovisioned, U1**) | Public OAuth client id for QuantAI |
| `QUANTAI_OAUTH_REDIRECT_SCHEME` | `quantai` | Custom scheme for OAuth callback |
| `QUANTAI_OAUTH_REDIRECT_URI` | `quantai://oauth/callback` | OAuth redirect URI |
| `QUANTAI_WEB_ORIGIN` | `https://quantai.quantrinity.in` `TODO(UNVERIFIED)` | Web origin for web build |
| `QUANTAI_REQUEST_TIMEOUT_SECONDS` | `30` | Dio connect/receive timeout |
| `QUANTAI_REFRESH_LEEWAY_SECONDS` | `120` | Token refresh leeway |
| `QUANTAI_AI_STREAM_TIMEOUT_SECONDS` | `90` | SSE stream idle timeout |

> **Drift D4 (coordinator decision):** the fleet brief quoted a `QUANT_`
> prefix and a 60 s refresh leeway; W1's implementation uses `QUANTAI_` and
> 120 s. The fleet must harmonize one prefix + one leeway before the first
> SDK build; this README documents the code reality.

Example:

```sh
flutter run --dart-define=QUANTAI_API_BASE_URL=https://api.quantrinity.com \
            --dart-define=QUANTAI_OAUTH_CLIENT_ID=<provisioned-id>
```

## OAuth redirect scheme

The redirect URI is **`quantai://oauth/callback`**. On an SDK-equipped
machine (next shift), register the scheme:

- **Android:** add an `<intent-filter>` with `android:scheme="quantai"` to the
  deep-link activity in `AndroidManifest.xml`.
- **iOS:** add `quantai` to `CFBundleURLSchemes` in `Info.plist`.

Until then, the login flow is written against `AuthorizeRequest` and is
unverifiable on-device.

## Spec status

- API contract: `~/workspace/quantmail-omnipresent/app-foundations/quantai/openapi.yaml`
  + `API_NOTES.md` — **spec not yet built (pending)**. This shift builds
  **scaffold + theme + auth only**; API wiring is blocked until the spec lands.
- No AI endpoints are invented: everything unverified is marked
  `TODO(UNVERIFIED)`.

## D5 note (AI-first latency)

Shift 1 ships stubs only:
- `QuantAiSseClient` — SSE client surface with **time-to-first-byte (TTFB)
  instrumentation**; real streaming wiring lands with the spec (Shift 2+).
- `UsageGate` — credits/entitlement gate stub in front of AI actions.

## Conventions

- No mocks: where a backend contract is unverified, mark `TODO(UNVERIFIED)`.
- `flutter_lints` conventions everywhere; strict casts and strict raw types on.
- GitHub is read-only for build agents; repo-ready changes go to
  `phase3/repo-staging/`.
- `AuthSessionState` subclasses are **positional**: `AuthFailure('msg')` is
  correct, `AuthFailure(message: 'msg')` is drift (flag it).
