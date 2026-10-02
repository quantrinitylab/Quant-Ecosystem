// ============================================================================
// chat_core - application configuration for QuantChat
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=SSO_BASE_URL=https://sso.quantrinity.in \
//     --dart-define=CHAT_API_BASE_URL=https://chatapi.quantrinity.in \
//     --dart-define=WEB_ORIGIN=https://quantchat.quantrinity.in \
//     --dart-define=OAUTH_CLIENT_ID=client_... \
//
// QuantChat authenticates through the QuantMail OAuth2+PKCE SSO (D1), so
// [ssoBaseUrl] points at the QuantMail SSO server while [apiBaseUrl] points
// at the QuantChat Fastify backend (chat API endpoints, used from the next
// shifts onwards).

/// Compile-time application configuration for the QuantChat Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer
/// the shared instance from W4's `appConfigProvider` (override it per flavor
/// / in tests).
class AppConfig {
  /// Base URL of the QuantMail SSO server — the OAuth2 endpoints
  /// (`/auth/login`, `/auth/2fa/verify`, `/oauth/authorize`, `/oauth/token`,
  /// `/oauth/revoke`) are served here. Trailing slashes are stripped when
  /// the auth Dio instances are built.
  // TODO(UNVERIFIED): production SSO host — confirm with the backend team.
  final String ssoBaseUrl;

  /// Base URL of the QuantChat Fastify backend (chat API). Used by the chat
  /// API client built in later shifts; stored (not wired) in this shift.
  // TODO(UNVERIFIED): production chat API host — confirm with the backend team.
  final String apiBaseUrl;

  /// Origin header sent with web-session auth calls (notably `POST /auth/login`).
  ///
  /// The QuantMail SSO backend requires an allowlisted `Origin` header on the
  /// public `/auth/*` calls, otherwise it rejects the request with
  /// `403 UNTRUSTED_ORIGIN` (same rule as QuantMail's web flow).
  final String webOrigin;

  /// Public OAuth2 client id registered for the QuantChat Flutter client.
  // TODO(UNVERIFIED): the quantchat-flutter client registration is not yet
  // confirmed (mirrors QuantMail's U1); empty until provisioned.
  final String oauthClientId;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token` (redirect_uri
  /// rebinding is enforced server-side).
  final String oauthRedirectUri;

  /// Whole-request timeout applied to connect/send/receive phases (mirrors
  /// the TS HttpClient's single timeout, split per Dio phase).
  final Duration requestTimeout;

  /// How far before the access-token expiry (900 s per SSO contract) the
  /// client should refresh proactively.
  final Duration refreshLeeway;

  /// Creates the config.
  ///
  /// The `--dart-define` fallbacks are compile-time constants (they resolve
  /// with the values passed at build time). This is intentionally NOT a
  /// `const` constructor: the S4 https asserts call `.startsWith`, which is
  /// not a constant expression, and the loud `http://` rejection (see
  /// below) is more important than constness.
  AppConfig({
    // TODO(UNVERIFIED): production SSO host — confirm with the backend team.
    this.ssoBaseUrl = const String.fromEnvironment(
      'SSO_BASE_URL',
      defaultValue: 'https://sso.quantrinity.example',
    ),
    // TODO(UNVERIFIED): production chat API host — confirm with the backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'CHAT_API_BASE_URL',
      defaultValue: 'https://chatapi.quantrinity.example',
    ),
    this.webOrigin = const String.fromEnvironment(
      'WEB_ORIGIN',
      defaultValue: 'https://quantchat.quantrinity.in',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'OAUTH_REDIRECT_URI',
      defaultValue: 'quantchat://oauth/callback',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  })  : assert(
          ssoBaseUrl.startsWith('https://'),
          'SSO_BASE_URL must use https:// (S4): got "$ssoBaseUrl"',
        ),
        assert(
          apiBaseUrl.startsWith('https://'),
          'CHAT_API_BASE_URL must use https:// (S4): got "$apiBaseUrl"',
        );

  /// Whether the SSO host looks like a real (non-placeholder) deployment.
  bool get hasSso => !ssoBaseUrl.contains('.example');

  /// Whether both URLs are configured (non-empty, https) and an OAuth
  /// client id has been provisioned.
  bool get isConfigured =>
      hasSso &&
      !apiBaseUrl.contains('.example') &&
      oauthClientId.isNotEmpty;

  @override
  String toString() =>
      'AppConfig(ssoBaseUrl: $ssoBaseUrl, apiBaseUrl: $apiBaseUrl, '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      'oauthClientId: ${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
