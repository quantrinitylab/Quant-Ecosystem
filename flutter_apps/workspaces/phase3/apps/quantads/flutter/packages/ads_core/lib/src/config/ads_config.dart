// ============================================================================
// ads_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANTADS_API_BASE_URL=https://api.quantrinity.example \
//     --dart-define=QUANTADS_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANTADS_OAUTH_REDIRECT_URI=quantads://oauth/callback
//
// OAuth2 endpoint shapes were verified against the backend in
// `phase0/AUTH_CONTRACT.md` (workstream C, QuantMail Phase 1).
//
// Auth strategy (MISSION.md D1): auth is the EXISTING OAuth2+PKCE flow — no
// new endpoints are invented for QuantAds. QuantAds signs in via QuantMail
// SSO: the same `/auth/login` → `/oauth/authorize` → `/oauth/token`
// sequence, only with a `quantads://` redirect scheme and (once provisioned)
// a dedicated client id.

/// Compile-time application configuration for the QuantAds Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from `adsConfigProvider` (override it per flavor / in
/// tests).
class AdsConfig {
  /// Base URL of the Quant Fastify backend. Trailing slashes are stripped
  /// by the API client when it builds its Dio instance.
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens — the
  /// `quantads-flutter` client is not yet registered (U1, AUTH_CONTRACT.md).
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantads` for `quantads://oauth/callback`. Follows the verbatim
  /// registration contract in `phase0/AUTH_CONTRACT.md` §1.1 (QuantMail
  /// used `quantmail`; QuantAds gets its own scheme).
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token`
  /// (`phase0/AUTH_CONTRACT.md` §1.4, "redirect_uri rebinding").
  final String oauthRedirectUri;

  /// OAuth2 token endpoint path (resolved against [apiBaseUrl]).
  /// Verified in `phase0/AUTH_CONTRACT.md` §1.4; JSON bodies only (F3).
  final String oauthTokenPath;

  /// OAuth2 authorization endpoint path (resolved against [apiBaseUrl]).
  /// Verified in `phase0/AUTH_CONTRACT.md` §1.2.
  final String oauthAuthorizePath;

  /// Origin header sent with web-session auth calls (notably `POST /auth/login`).
  ///
  /// Verified `backend/lib/auth-session.ts`: the login endpoint requires an
  /// allowlisted `Origin` header, otherwise the request is rejected with
  /// `403 UNTRUSTED_ORIGIN`. The auth repository sends this value as the
  /// `Origin` header on web-session calls.
  // TODO(UNVERIFIED): confirm the QuantAds web origin is allowlisted
  // server-side alongside the QuantMail origin.
  final String webOrigin;

  /// Whole-request timeout applied to connect/send/receive phases (mirrors the
  /// TS HttpClient's single timeout, split per Dio phase in the foundation).
  final Duration requestTimeout;

  /// How far before the access-token expiry (900 s per
  /// `phase0/AUTH_CONTRACT.md` §1.8) the client should refresh proactively.
  final Duration refreshLeeway;

  /// Creates the config. Prefer `const AdsConfig()` so the `--dart-define`
  /// fallbacks are resolved at compile time.
  const AdsConfig({
    // TODO(UNVERIFIED): confirm production base URL from backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'QUANTADS_API_BASE_URL',
      defaultValue: 'https://api.quantrinity.example',
    ),
    // TODO(UNVERIFIED): U1 — the `quantads-flutter` client is not yet
    // provisioned. Leave empty until the backend registers it.
    this.oauthClientId = const String.fromEnvironment(
      'QUANTADS_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANTADS_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantads',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANTADS_OAUTH_REDIRECT_URI',
      defaultValue: 'quantads://oauth/callback',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'QUANTADS_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'QUANTADS_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    // TODO(UNVERIFIED): confirm the QuantAds web origin is allowlisted
    // server-side alongside the QuantMail origin.
    this.webOrigin = const String.fromEnvironment(
      'QUANTADS_WEB_ORIGIN',
      defaultValue: 'https://quantads.quantrinity.in',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANTADS_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANTADS_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  });

  @override
  String toString() =>
      'AdsConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      '${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
