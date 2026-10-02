// ============================================================================
// quantmax_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANTMAX_API_BASE_URL=https://api.quantrinity.in \
//     --dart-define=QUANTMAX_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANTMAX_OAUTH_REDIRECT_SCHEME=com.quantrinity.quantmax \
//     --dart-define=QUANTMAX_OAUTH_REDIRECT_URI=com.quantrinity.quantmax:/oauth2redirect
//
// S4 lesson: `http://` base URLs are REJECTED — the constructor asserts
// https-only. Cleartext API traffic is never acceptable for an app that
// carries OAuth tokens.
//
// OAuth refresh contract (board-verified, ecosystem-wide): `POST /oauth/token`
// with JSON `{"grant_type":"refresh_token","refresh_token":"…"}` returns
// snake_case tokens. The authorize path below is TODO(UNVERIFIED) for
// QuantMax until the OpenAPI spec lands.

/// Compile-time application configuration for the QuantMax Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from `appConfigProvider` (override it per flavor / in tests).
class AppConfig {
  /// Base URL of the Quant backend. Trailing slashes are stripped by the API
  /// client when it builds its Dio instance.
  ///
  /// S4: must start with `https://` — asserted in the constructor.
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens.
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `com.quantrinity.quantmax` for
  /// `com.quantrinity.quantmax:/oauth2redirect`. Matches the Android
  /// intent-filter and the iOS `CFBundleURLSchemes` entry.
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between the authorize call and `POST /oauth/token`.
  final String oauthRedirectUri;

  /// OAuth2 token endpoint path (resolved against [apiBaseUrl]).
  /// Board-verified refresh contract (`POST /oauth/token`, JSON body,
  /// snake_case response).
  final String oauthTokenPath;

  /// OAuth2 authorization endpoint path (resolved against [apiBaseUrl]).
  // TODO(UNVERIFIED): confirm the authorize path for QuantMax once the
  // OpenAPI spec lands (app-foundations/quantmax).
  final String oauthAuthorizePath;

  /// Whole-request timeout applied to connect/send/receive phases.
  final Duration requestTimeout;

  /// How far before the access-token expiry the client should refresh
  /// proactively (drives W3's silent-refresh timer).
  final Duration refreshLeeway;

  /// Creates the config. The `--dart-define` fallbacks are resolved at compile
  /// time through [String.fromEnvironment] / [int.fromEnvironment] regardless
  /// of const-ness; the constructor is intentionally non-const so the S4
  /// https-only assert below is legal.
  AppConfig({
    // TODO(UNVERIFIED): confirm production base URL from backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'QUANTMAX_API_BASE_URL',
      defaultValue: 'https://api.quantrinity.example',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'QUANTMAX_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANTMAX_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'com.quantrinity.quantmax',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANTMAX_OAUTH_REDIRECT_URI',
      defaultValue: 'com.quantrinity.quantmax:/oauth2redirect',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'QUANTMAX_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'QUANTMAX_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANTMAX_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANTMAX_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  }) : assert(
          apiBaseUrl.startsWith('https://'),
          'S4: QUANTMAX_API_BASE_URL must be https — '
          'http:// base URLs are rejected.',
        );

  @override
  String toString() =>
      'AppConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      '${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
