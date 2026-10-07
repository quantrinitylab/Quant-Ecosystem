// ============================================================================
// quant_wave_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANT_API_BASE_URL=https://api.quantrinity.example \
//     --dart-define=QUANT_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANT_OAUTH_REDIRECT_URI=quantwave://oauth/callback
//
// OAuth2 endpoint shapes are shared with the QuantMail SSO backend contract
// (`phase0/AUTH_CONTRACT.md`, workstream C): QuantWave reuses the existing
// OAuth2+PKCE flow — no new auth endpoints (mission D1).

/// Compile-time application configuration for the QuantWave Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from `appConfigProvider` (override it per flavor / in tests).
class AppConfig {
  /// Base URL of the Quant backend (QuantMail SSO). Trailing slashes are
  /// stripped by the API client when it builds its Dio instance.
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens — see
  /// `phase0/AUTH_CONTRACT.md` U1 (unknown whether a `quantwave-flutter`
  /// client already exists).
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantwave` for `quantwave://oauth/callback`. Matches the verbatim
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
      defaultValue: 'quantwave',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANT_OAUTH_REDIRECT_URI',
      defaultValue: 'quantwave://oauth/callback',
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
      defaultValue: 'https://quantwave.quantrinity.in',
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

/// Enforces the HTTPS-only transport rule (army review finding S4).
///
/// Throws [ArgumentError] when [baseUrl] is not HTTPS: OAuth tokens must
/// never travel over plaintext HTTP. Loopback hosts (`localhost`,
/// `127.0.0.1`, `::1`) are exempt so local backend development keeps working.
///
/// Call sites: [QuantApiClient] (via its base-URL normalization),
/// [AuthApi], and [AuthRepository]'s login Dio.
void checkHttpsBaseUrl(String baseUrl) {
  final uri = Uri.tryParse(baseUrl);
  if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
    throw ArgumentError.value(
        baseUrl, 'baseUrl', 'Not a valid absolute URL with a host');
  }
  if (uri.scheme == 'https') return;
  if (uri.scheme == 'http') {
    final host = uri.host.toLowerCase();
    final isLoopback =
        host == 'localhost' || host == '127.0.0.1' || host == '::1';
    if (isLoopback) return;
    throw ArgumentError.value(
      baseUrl,
      'baseUrl',
      'http:// is rejected (S4): OAuth tokens must never travel over '
      'plaintext HTTP. Use https://, or http://localhost for local dev.',
    );
  }
  throw ArgumentError.value(
    baseUrl,
    'baseUrl',
    'Only https:// (or http:// loopback for local dev) is supported',
  );
}
