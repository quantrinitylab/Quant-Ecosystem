// ============================================================================
// quant_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANT_API_BASE_URL=https://api.quantmail.com \
//     --dart-define=QUANT_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANT_OAUTH_REDIRECT_URI=quantmail://oauth/callback
//
// OAuth2 endpoint shapes were verified against the backend in
// `phase0/AUTH_CONTRACT.md` (workstream C).

/// Compile-time application configuration for the QuantMail Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from `appConfigProvider` (override it per flavor / in tests).
class AppConfig {
  /// Base URL of the QuantMail Fastify backend. Trailing slashes are stripped
  /// by the API client when it builds its Dio instance.
  ///
  /// Scheme invariant (S4, security audit): must be `https://`, or `http://`
  /// on a loopback dev host (`localhost`, `127.0.0.1`, `[::1]`).
  /// `String.startsWith` is not const-evaluable, so this cannot be expressed
  /// as a `const` assert — it is enforced fail-fast by `QuantApiClient` at
  /// construction instead (throws `ArgumentError` naming the offending value).
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens — see
  /// `phase0/AUTH_CONTRACT.md` U1 (unknown whether a `quantmail-flutter`
  /// client already exists).
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantmail` for `quantmail://oauth/callback`. Matches the verbatim
  /// registration contract in `phase0/AUTH_CONTRACT.md` §1.1.
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
  final String webOrigin;

  /// Whole-request timeout applied to connect/send/receive phases (mirrors the
  /// TS HttpClient's single timeout, split per Dio phase in the foundation).
  final Duration requestTimeout;

  /// How far before the access-token expiry (900 s per
  /// `phase0/AUTH_CONTRACT.md` §1.8) the client should refresh proactively.
  final Duration refreshLeeway;

  /// Creates the config. Prefer `const AppConfig()` so the `--dart-define`
  /// fallbacks are resolved at compile time.
  const AppConfig({
    // TODO(UNVERIFIED): confirm production base URL from backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'QUANT_API_BASE_URL',
      defaultValue: 'https://api.quantrinity.example',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'QUANT_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANT_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantmail',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANT_OAUTH_REDIRECT_URI',
      defaultValue: 'quantmail://oauth/callback',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'QUANT_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'QUANT_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    this.webOrigin = const String.fromEnvironment(
      'QUANT_WEB_ORIGIN',
      defaultValue: 'https://quantmail.quantrinity.in',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANT_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANT_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  });

  @override
  String toString() =>
      'AppConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      '${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
