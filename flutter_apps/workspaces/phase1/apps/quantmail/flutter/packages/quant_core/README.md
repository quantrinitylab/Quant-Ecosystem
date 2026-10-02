# quant_core

Shared core for the QuantMail Flutter clients: app configuration, the Riverpod
provider graph, and cold-start bootstrap helpers. Built on
`quant_foundation` (Phase 0): `QuantApiClient`, `TokenManager`, OAuth2/PKCE
helpers, and the `@quant/brand` theme.

## What it provides

- **`AppConfig`** (`lib/src/config/app_config.dart`) — compile-time
  configuration, all `--dart-define` backed with documented defaults
  (`QUANT_API_BASE_URL`, `QUANT_OAUTH_CLIENT_ID`,
  `QUANT_OAUTH_REDIRECT_URI`, `QUANT_REQUEST_TIMEOUT_SECONDS`,
  `QUANT_REFRESH_LEEWAY_SECONDS`, …). OAuth2 endpoint paths and the
  `quantmail://oauth/callback` redirect match the verified contract in
  `phase0/AUTH_CONTRACT.md`.
- **Provider graph** (`lib/src/providers/core_providers.dart`) — plain
  Riverpod (no codegen), override-friendly for tests and flavors.
- **`AppBootstrap`** (`lib/src/bootstrap/app_bootstrap.dart`) — one-shot
  `initialize()` for cold start (logging + secure-storage probe; M2 adds PKCE
  init, drift DB open, FCM registration).

## Provider graph

```
appConfigProvider ──────┬──▶ apiClientProvider (QuantApiClient)
                        │         (Dio + Auth → Retry → Refresh interceptors,
tokenManagerProvider ───┼──▶       wired to the TokenManager)
                        │
                        ├──▶ authStateProvider (StreamProvider<AuthState>)
                        │         │
                        │         └──▶ isAuthenticatedProvider (bool)
                        │
                        └──▶ (disposed with the ProviderScope/container)
```

- `tokenManagerProvider` defaults to the platform secure store
  (`SecureTokenStorage` via flutter_secure_storage: encryptedSharedPreferences
  on Android, keychain after-first-unlock on iOS); tests override it with
  `TokenManager(storage: InMemoryTokenStorage())`.
- `apiClientProvider` wires `QuantApiConfig(baseUrl, refreshEndpoint,
  timeout, onAuthFailure)` to the shared `TokenManager`.
- `isAuthenticatedProvider` is `false` while the auth-state stream is still
  loading (`unknown`) — treat as "not yet known", not signed-out.

### Overriding in tests / flavors

```dart
final container = ProviderContainer(
  overrides: [
    appConfigProvider.overrideWithValue(
      const AppConfig(apiBaseUrl: 'https://staging.quantmail.local'),
    ),
    tokenManagerProvider.overrideWithValue(
      TokenManager(storage: InMemoryTokenStorage()),
    ),
  ],
);
```

## How quant_app consumes it

`packages/quant_app` (the app entrypoint, workstream W2) wraps the widget tree
in `ProviderScope` and calls `AppBootstrap.initialize()` before `runApp`:

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppBootstrap.initialize();
  runApp(const ProviderScope(child: QuantMailApp()));
}
```

Screens and routers then `ref.watch(apiClientProvider)`,
`ref.watch(authStateProvider)` / `ref.watch(isAuthenticatedProvider)` — never
construct their own client or token manager.

## Build flags

| flag | default | notes |
|---|---|---|
| `QUANT_API_BASE_URL` | `https://api.quantrinity.example` | TODO(UNVERIFIED): confirm production URL with backend team |
| `QUANT_OAUTH_CLIENT_ID` | `""` (unprovisioned) | provision via `POST /oauth/register`, `is_confidential: false` |
| `QUANT_OAUTH_REDIRECT_SCHEME` | `quantmail` | verified, `AUTH_CONTRACT.md` §1.1 |
| `QUANT_OAUTH_REDIRECT_URI` | `quantmail://oauth/callback` | byte-identical at authorize + token exchange |
| `QUANT_OAUTH_TOKEN_PATH` | `/oauth/token` | JSON bodies only (F3) |
| `QUANT_OAUTH_AUTHORIZE_PATH` | `/oauth/authorize` | requires a Bearer token first (F1) |
| `QUANT_REQUEST_TIMEOUT_SECONDS` | `30` | per Dio phase |
| `QUANT_REFRESH_LEEWAY_SECONDS` | `120` | proactive refresh before the 15-min access TTL |

## Dependencies (for the melos/pubspec owner — W1)

`quant_core` needs in its `pubspec.yaml`:
`quant_foundation` (path), `flutter_riverpod`; dev: `flutter_test`.
It does not depend on `flutter_secure_storage` directly — the foundation
re-exports `SecureTokenStorage`/`InMemoryTokenStorage`.

## Known gaps (M2)

- Silent 401 refresh wiring: the foundation `RefreshInterceptor` posts the
  TS-style `{'refreshToken': …}` payload, while the verified OAuth2 contract is
  `POST /oauth/token` with `{"grant_type":"refresh_token",…}` returning
  snake_case fields. Flagged `TODO(UNVERIFIED)` in `core_providers.dart`;
  reconcile before relying on silent refresh.
- M1 bootstrap does not hydrate the token manager or open drift yet — see
  `AppBootstrap.initialize` docs.
