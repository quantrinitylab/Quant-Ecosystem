// ============================================================================
// quantube_core - application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=API_BASE_URL=https://api.quantube.example \
//     --dart-define=QUANTUBE_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANTUBE_OAUTH_REDIRECT_URI=quantube://oauth/callback
//
// QuanTube has no API spec of its own yet (app-foundations/quantube absent).
// Auth runs on the EXISTING QuantMail OAuth2+PKCE surface (D1): the same
// issuer, paths `/oauth/authorize` + `/oauth/token` + `/oauth/revoke` and the
// same snake_case wire format (RFC 6749) as the phase-0 contract. No
// QuanTube-specific endpoints are invented here — everything marked
// TODO(UNVERIFIED) is a prod/deployment value to confirm later.

/// SECURITY (board S4): runtime https guard for a base URL — release-safe.
///
/// `https` always passes. `http` is only accepted for loopback/private dev
/// hosts (`localhost`, `127.0.0.1`, `::1`, `10.0.0.0/8`, `192.168.0.0/16`,
/// `172.16.0.0/12`); anything else throws [ArgumentError] (S4 lesson, QuantAI
/// template: never send OAuth tokens over plaintext to a public host).
void requireHttpsBaseUrl(String baseUrl) {
  final uri = Uri.tryParse(baseUrl);
  if (uri == null || !uri.hasScheme) {
    throw ArgumentError('apiBaseUrl must be an absolute URL: "$baseUrl"');
  }
  if (uri.scheme == 'https') return;
  if (uri.scheme != 'http') {
    throw ArgumentError(
      'apiBaseUrl must use https, not "${uri.scheme}": "$baseUrl"',
    );
  }
  final host = uri.host.toLowerCase();
  final isLocal =
      host == 'localhost' ||
      host == '127.0.0.1' ||
      host == '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      (host.startsWith('172.') && _is172Private(host));
  if (!isLocal) {
    throw ArgumentError(
      'SECURITY (board S4): apiBaseUrl must be https; http is only allowed '
      'for local/dev hosts (localhost, 127.0.0.1, ::1, 10.x, 192.168.x, '
      '172.16-31.x): "$baseUrl"',
    );
  }
}

/// `true` for the `172.16.0.0/12` private range (second octet 16–31).
bool _is172Private(String host) {
  final octets = host.split('.');
  if (octets.length != 4) return false;
  final second = int.tryParse(octets[1]);
  return second != null && second >= 16 && second <= 31;
}

/// Compile-time application configuration for the QuanTube Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer
/// the shared instance from `appConfigProvider` (override it per flavor / in
/// tests). The QuantMail SSO identity is shared: same OAuth issuer, with the
/// QuanTube `client_id` and redirect URI registered as a separate native
/// client (audience `quantube` — see TODO(UNVERIFIED) in [oauthClientId]).
class AppConfig {
  /// Base URL of the backend API host serving the OAuth2 routes. Trailing
  /// slashes are stripped by the API client when it builds its Dio instance.
  ///
  /// SECURITY (board S4): must be `https://` — enforced by [assertHttps],
  /// which auth wiring calls before building any transport. An `http://`
  /// value is never silently accepted.
  // TODO(UNVERIFIED): confirm production base URL from backend team.
  final String apiBaseUrl;

  /// Public OAuth2 client id provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioning happens.
  ///
  /// QuantMail SSO identity (D1): the same OAuth issuer as the QuantMail
  /// apps, with a QuanTube-registered native client.
  // TODO(UNVERIFIED): quantube spec pending (app-foundations) — the
  // registered `quantube-flutter` client_id and the `quantube` audience.
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantube` for `quantube://oauth/callback`.
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token` (redirect_uri
  /// rebinding is enforced server-side).
  final String oauthRedirectUri;

  /// OAuth2 token endpoint path (resolved against [apiBaseUrl]).
  ///
  /// Wired into [AuthApi] as the fixed `OAuthPaths.token` today.
  // TODO(UNVERIFIED): confirm prod path from backend team.
  final String oauthTokenPath;

  /// OAuth2 authorization endpoint path (resolved against [apiBaseUrl]).
  ///
  /// Wired into [AuthApi] as the fixed `OAuthPaths.authorize` today.
  // TODO(UNVERIFIED): confirm prod path from backend team.
  final String oauthAuthorizePath;

  /// Origin header sent with web-session auth calls (notably
  /// `POST /auth/login`).
  ///
  /// This is the existing QuantMail SSO surface (`phase0/AUTH_CONTRACT.md`
  /// §2): the login endpoint requires an allowlisted `Origin` header,
  /// otherwise it answers `403 UNTRUSTED_ORIGIN`. QuanTube reuses it for the
  /// password bootstrap of the PKCE upgrade.
  // TODO(UNVERIFIED): quantube spec pending (app-foundations) — confirm
  // whether the QuanTube login UX keeps the password bootstrap or goes
  // browser-only SSO.
  final String webOrigin;

  /// Whole-request timeout applied to connect/send/receive phases.
  final Duration requestTimeout;

  /// How far before the access-token expiry (900 s per
  /// `phase0/AUTH_CONTRACT.md` §1.8) the client should refresh proactively.
  /// Silent-refresh target: 60 s before expiry.
  final Duration refreshLeeway;

  /// Creates the config. Prefer `const AppConfig()` so the `--dart-define`
  /// fallbacks are resolved at compile time.
  const AppConfig({
    // TODO(UNVERIFIED): confirm production base URL from backend team.
    this.apiBaseUrl = const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://api.quantube.example',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'QUANTUBE_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANTUBE_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantube',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANTUBE_OAUTH_REDIRECT_URI',
      defaultValue: 'quantube://oauth/callback',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'QUANTUBE_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'QUANTUBE_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    this.webOrigin = const String.fromEnvironment(
      'QUANTUBE_WEB_ORIGIN',
      defaultValue: 'https://quantmail.quantrinity.in',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANTUBE_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANTUBE_REFRESH_LEEWAY_SECONDS',
        defaultValue: 60,
      ),
    ),
  });

  /// Whether [apiBaseUrl] uses `https://`.
  ///
  /// `const` constructors cannot call [String.startsWith], so this is a
  /// runtime getter; enforce it with [assertHttps] (or
  /// `assert(config.isHttps)`) in non-const wiring.
  bool get isHttps => apiBaseUrl.toLowerCase().startsWith('https://');

  /// SECURITY (board S4): throws in debug when [apiBaseUrl] is not https.
  ///
  /// Auth wiring calls this before building any Dio/AuthApi transport, so a
  /// misconfigured `http://` base URL fails loudly at startup instead of
  /// being silently accepted.
  void assertHttps() {
    assert(
      isHttps,
      'SECURITY (board S4): API base URL must be https — refusing '
      '"$apiBaseUrl". http:// is never silently accepted.',
    );
  }

  @override
  String toString() =>
      'AppConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      // Never print secrets; the client id is a public identifier, but keep
      // the habit: only non-sensitive fields are logged.
      '${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
