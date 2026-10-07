# ads_core

Shared core for the QuantAds Flutter clients: app configuration,
authentication (OAuth2+PKCE via QuantMail SSO), the Riverpod provider graph,
and cold-start bootstrap helpers. Built on `quant_foundation` (Phase 0):
`QuantApiClient`, `TokenManager`, OAuth2/PKCE helpers, and the
`@quant/brand` theme — plus the sibling `ads_theme` package for QuantAds
design tokens. Ported from QuantMail's `quant_core` (Phase 1) for Shift 1 of
the QuantAds build; the auth contract is identical (MISSION.md D1 — no new
endpoints).

## What it provides

- **`AdsConfig`** (`lib/src/config/ads_config.dart`) — compile-time
  configuration, all `--dart-define` backed with documented defaults
  (`QUANTADS_API_BASE_URL`, `QUANTADS_OAUTH_CLIENT_ID`,
  `QUANTADS_OAUTH_REDIRECT_SCHEME`, `QUANTADS_OAUTH_REDIRECT_URI`, …).
  OAuth2 endpoint paths and the `quantads://oauth/callback` redirect follow
  the verified contract in `phase0/AUTH_CONTRACT.md`.
- **Auth** (`lib/src/auth/`) — `AuthRepository` (password login + TOTP 2FA,
  OAuth2+PKCE upgrade, silent refresh with rotation, sign-out), the typed
  `AuthException` hierarchy, the `AuthSessionNotifier` session state machine,
  and `SilentRefreshScheduler` + `silentRefreshProvider` (proactive refresh
  ahead of the 900 s access TTL).
- **Provider graph** (`lib/src/providers/core_providers.dart`) — plain
  Riverpod (no codegen), override-friendly for tests and flavors.
- **`AppBootstrap`** (`lib/src/bootstrap/app_bootstrap.dart`) — one-shot
  `initialize()` for cold start (logging + secure-storage probe; drift DB
  open and FCM registration are documented placeholders).

## Provider graph

```
adsConfigProvider ──────┬──▶ apiClientProvider (QuantApiClient)
                        │         (Dio + Auth → Retry → Refresh interceptors,
tokenManagerProvider ───┼──▶       wired to the TokenManager)
                        │
                        ├──▶ authStateProvider (StreamProvider<AuthState>)
                        │         │
                        │         └──▶ isAuthenticatedProvider (bool)
                        │
                        └──▶ (disposed with the ProviderScope/container)

adsConfigProvider ──▶ authApiProvider (bare-Dio AuthApi)
                        │
tokenManagerProvider ───┼──▶ authRepositoryProvider (AuthRepository)
                        │
pendingOAuthRedirectProvider (Uri?, /oauth/callback route)
                        │
authRepositoryProvider ─┴──▶ authSessionProvider (AuthSessionState)
                                  │
                                  └──▶ isSessionAuthenticatedProvider (bool)
```

- `tokenManagerProvider` defaults to the platform secure store
  (`SecureTokenStorage` via flutter_secure_storage: encryptedSharedPreferences
  on Android, keychain after-first-unlock on iOS); tests override it with
  `TokenManager(storage: InMemoryTokenStorage())`.
- `apiClientProvider` wires `QuantApiConfig(baseUrl, refreshEndpoint,
  timeout, onAuthFailure, tokenRefresher)` to the shared `TokenManager`.
  No ads endpoints are wired here yet — the QuantAds OpenAPI spec does not
  exist (spec-first wiring in a later shift).
- `isAuthenticatedProvider` is `false` while the auth-state stream is still
  loading (`unknown`) — treat as "not yet known", not signed-out.

### Overriding in tests / flavors

```dart
final container = ProviderContainer(
  overrides: [
    adsConfigProvider.overrideWithValue(
      const AdsConfig(apiBaseUrl: 'https://staging.quantads.local'),
    ),
    tokenManagerProvider.overrideWithValue(
      TokenManager(storage: InMemoryTokenStorage()),
    ),
  ],
);
```

## How the app entrypoint consumes it

The app entrypoint wraps the widget tree in `ProviderScope` and calls
`AppBootstrap.initialize()` before `runApp`:

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppBootstrap.initialize();
  runApp(const ProviderScope(child: QuantAdsApp()));
}
```

Screens and routers then `ref.watch(apiClientProvider)`,
`ref.watch(authStateProvider)` / `ref.watch(authSessionProvider)` — never
construct their own client or token manager.

## Build flags

| flag | default | notes |
|---|---|---|
| `QUANTADS_API_BASE_URL` | `https://api.quantrinity.example` | TODO(UNVERIFIED): confirm production URL with backend team |
| `QUANTADS_OAUTH_CLIENT_ID` | `""` (unprovisioned) | TODO(UNVERIFIED, U1): provision via `POST /oauth/register`, `is_confidential: false` — `quantads-flutter` client not yet registered |
| `QUANTADS_OAUTH_REDIRECT_SCHEME` | `quantads` | own scheme per verified registration contract, `AUTH_CONTRACT.md` §1.1 |
| `QUANTADS_OAUTH_REDIRECT_URI` | `quantads://oauth/callback` | byte-identical at authorize + token exchange |
| `QUANTADS_OAUTH_TOKEN_PATH` | `/oauth/token` | JSON bodies only (F3), rotation on refresh |
| `QUANTADS_OAUTH_AUTHORIZE_PATH` | `/oauth/authorize` | requires a Bearer token first (F1) |
| `QUANTADS_WEB_ORIGIN` | `https://quantads.quantrinity.in` | TODO(UNVERIFIED): confirm allowlisted server-side |
| `QUANTADS_REQUEST_TIMEOUT_SECONDS` | `30` | per Dio phase |
| `QUANTADS_REFRESH_LEEWAY_SECONDS` | `120` | proactive refresh before the 15-min access TTL |

## Dependencies

`ads_core` needs in its `pubspec.yaml`: `quant_foundation` (path),
`ads_theme` (path, sibling), `dio` ^5.9.0, `flutter_riverpod` ^2.5.3,
`flutter_secure_storage` ^10.0.0; dev: `flutter_test`, `flutter_lints` ^5.0.0.

## Known gaps (Shift 1)

- Silent 401 refresh wiring: the foundation `RefreshInterceptor` posts the
  TS-style `{'refreshToken': …}` payload, while the verified OAuth2 contract is
  `POST /oauth/token` with `{"grant_type":"refresh_token",…}` returning
  snake_case fields. Reconcile before relying on silent refresh.
- Bootstrap does not hydrate the token manager or open drift yet — see
  `AppBootstrap.initialize` docs.
- No ads endpoints: the QuantAds OpenAPI spec does not exist yet. When it
  does, wire the typed client spec-first; do not invent endpoints.
- `QUANTADS_OAUTH_CLIENT_ID` is unprovisioned (U1); login is blocked on the
  backend registering the `quantads-flutter` client.
