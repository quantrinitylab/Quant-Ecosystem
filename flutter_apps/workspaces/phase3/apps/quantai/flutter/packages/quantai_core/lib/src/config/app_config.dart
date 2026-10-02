// ============================================================================
// quantai_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANTAI_API_BASE_URL=https://api.quantrinity.in \
//     --dart-define=QUANTAI_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANTAI_OAUTH_REDIRECT_URI=quantai://oauth/callback
//
// AI-first latency budget (D5): [aiStreamTimeout] bounds SSE streaming reads
// so long AI generations never stall the client indefinitely.
//
// TODO(UNVERIFIED): production base URL, the registered Flutter `client_id`,
// and the exact QuantAI backend contract (spec in progress in
// `app-foundations/quantai/`).

/// Compile-time application configuration for the QuantAI Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from `appConfigProvider` (override it per flavor / in tests).
class AppConfig {
  /// Base URL of the QuantAI backend. Trailing slashes are stripped
  /// by the API client when it builds its Dio instance.
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens.
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantai` for `quantai://oauth/callback`.
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token` (redirect_uri
  /// rebinding protection).
  final String oauthRedirectUri;

  /// OAuth2 token endpoint path (resolved against [apiBaseUrl]).
  final String oauthTokenPath;

  /// OAuth2 authorization endpoint path (resolved against [apiBaseUrl]).
  final String oauthAuthorizePath;

  /// Origin header sent with web-session auth calls (notably `POST /auth/login`).
  ///
  /// The QuantMail backend required an allowlisted `Origin` header (verified
  /// in QuantMail's `phase0/AUTH_CONTRACT.md` §2); QuantAI inherits the same
  /// SSO backend, so the repository sends this value as the `Origin` header
  /// on web-session calls.
  final String webOrigin;

  /// Whole-request timeout applied to connect/send/receive phases.
  final Duration requestTimeout;

  /// How far before the access-token expiry the client should refresh
  /// proactively.
  final Duration refreshLeeway;

  /// Upper bound for a single AI streaming read (SSE).
  ///
  /// D5 (AI-first latency architecture): quantifiable client-side backstop —
  /// a stalled generation stream is cancelled after this long and surfaced
  /// as an error rather than hanging the UI.
  final Duration aiStreamTimeout;

  /// Creates the config. Prefer `const AppConfig()` so the `--dart-define`
  /// fallbacks are resolved at compile time.
  const AppConfig({
    // TODO(UNVERIFIED): confirm production base URL from backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'QUANTAI_API_BASE_URL',
      defaultValue: 'https://api.quantrinity.example',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'QUANTAI_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANTAI_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantai',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANTAI_OAUTH_REDIRECT_URI',
      defaultValue: 'quantai://oauth/callback',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'QUANTAI_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'QUANTAI_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    this.webOrigin = const String.fromEnvironment(
      'QUANTAI_WEB_ORIGIN',
      defaultValue: 'https://quantai.quantrinity.in',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANTAI_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANTAI_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
    this.aiStreamTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANTAI_AI_STREAM_TIMEOUT_SECONDS',
        defaultValue: 90,
      ),
    ),
  });

  @override
  String toString() =>
      'AppConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      '${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout, '
      'aiStreamTimeout: $aiStreamTimeout)';
}
