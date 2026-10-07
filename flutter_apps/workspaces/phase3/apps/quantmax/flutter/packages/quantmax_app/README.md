# quantmax_app — QuantMax Flutter app (Phase 3b)

QuantMax = short-video/discovery app (TikTok-class competitor), the
feed-forward face of the Quant ecosystem. This package is the app shell.
Login is **QuantMail SSO (OAuth2 + PKCE)** — the D1 sign-in entry point.

> **Status (Shift 1):** scaffold + login slice only. The quantmax OpenAPI spec
> is not built yet, so feed/discover/create screens come after the spec.
> Auth runs on the real `quantmax_core` contract
> ([QuantMaxAuthSessionNotifier] / [AuthSessionState]) — no shim.

## Structure

```
packages/quantmax_app/
  lib/main.dart                    # entry point (ProviderScope root)
  lib/src/app.dart                 # QuantMaxApp root widget
  lib/src/router/app_router.dart   # go_router + auth gate + /oauth2redirect
  lib/src/auth/browser_launcher.dart  # system-browser OAuth consent handoff
  lib/src/screens/login_screen.dart   # D1 SSO login screen
  lib/src/widgets/auth_fields.dart    # reusable auth widgets
  test/widget_test.dart               # app boot smoke
  test/login_screen_test.dart         # login screen widget tests
  test/helpers/fake_auth_state.dart   # fake QuantMaxAuthSessionNotifier for tests
```

## Run

Flutter SDK machine required (none in the build env).

```bash
cd packages/quantmax_app
flutter pub get
flutter test
flutter run
```

### dart-define flags

All runtime config arrives via `--dart-define` (compile-time; no secrets in
source), mirroring the phase1 convention:

```bash
flutter run \
  --dart-define=QUANT_API_BASE_URL=https://api.quantrinity.example \
  --dart-define=QUANT_OAUTH_CLIENT_ID=client_... \
  --dart-define=QUANT_OAUTH_REDIRECT_URI=com.quantrinity.quantmax:/oauth2redirect \
  --dart-define=QUANT_OAUTH_REDIRECT_SCHEME=com.quantrinity.quantmax
```

| Flag | Meaning | Default |
|------|---------|---------|
| `QUANT_API_BASE_URL` | Fastify backend base URL (shared QuantMail SSO backend) | `https://api.quantrinity.example` |
| `QUANT_OAUTH_CLIENT_ID` | Public OAuth2 client id (`POST /oauth/register`, non-confidential) | `''` (unprovisioned) |
| `QUANT_OAUTH_REDIRECT_URI` | Deep link the OS hands back to the app | `com.quantrinity.quantmax:/oauth2redirect` |
| `QUANT_OAUTH_REDIRECT_SCHEME` | URL scheme claimed in AndroidManifest / Info.plist | `com.quantrinity.quantmax` |

> TODO(UNVERIFIED): production base URL and OAuth client provisioning
> still pending (same unknowns as phase1's `AUTH_CONTRACT.md` U1).

## OAuth2 + PKCE flow (D1)

1. User taps **Continue with QuantMail** →
   `QuantMaxAuthSessionNotifier.startBrowserSignIn()` (quantmax_core).
2. State → `AuthLoading`, then `AuthConsentRequired(authorizeUrl)` (PKCE
   `code_challenge` baked into the URL by the repository).
3. `BrowserAuthLauncher.openAuthorizeUrl` opens the URL in the system
   browser; the user approves once.
4. The OS delivers `com.quantrinity.quantmax:/oauth2redirect?code=…&state=…`
   back to the app (go_router route) → core's `pendingOAuthRedirectProvider`
   → `QuantMaxAuthSessionNotifier.completeOAuthCallback(uri)`.
5. State → `AuthAuthenticated`; the router owns the hop to the feed.

`TODO(UNVERIFIED)`: custom-scheme round-trip not yet proven on real hardware;
consider App Links / Universal Links migration per security audit P2.
