// ============================================================================
// quantcooks_core - QuantCooks application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=QUANT_COOKS_API_BASE_URL=https://api.quantcooks.example \
//     --dart-define=QUANT_COOKS_OAUTH_CLIENT_ID=client_... \
//     --dart-define=QUANT_COOKS_OAUTH_REDIRECT_URI=quantcooks://oauth/callback
//
// OAuth2 endpoint shapes follow the verified AUTH_CONTRACT
// (`phase0/AUTH_CONTRACT.md` §5): `GET /oauth/authorize`, `POST /oauth/token`,
// `POST /oauth/revoke` on the backend origin, JSON bodies ONLY (no
// `application/x-www-form-urlencoded` parser server-side — this deviates from
// RFC 6749 §4.1.3; do not "fix" the Dart client to form-encoding).
// Token lifetimes: access 900 s, refresh 30 days with rotation + family
// revocation on reuse (invalid_grant → signed out).
//
// TODO(UNVERIFIED): the QuantCooks Flutter client is NOT yet registered
// backend-side (the registered `QuantMail Flutter` client is a SEPARATE
// client). The [oauthClientId] default below is a placeholder; replace it
// with the real `client_id` from a `POST /oauth/register` response with
// `redirect_uris: ["quantcooks://oauth/callback"]`,
// `scopes: ["openid","profile","email"]`, `is_confidential: false`.

/// Compile-time application configuration for the QuantCooks Flutter clients.
///
/// Prefer the shared instance from `appConfigProvider` (override it per
/// flavor / in tests).
class CooksConfig {
  /// Default custom-scheme redirect URI registered for the QuantCooks
  /// Flutter client. Must be byte-identical between `GET /oauth/authorize`
  /// and `POST /oauth/token` — the backend enforces redirect_uri rebinding
  /// (`phase0/AUTH_CONTRACT.md` §5, Step 4).
  static const String defaultRedirectUri = 'quantcooks://oauth/callback';

  /// Placeholder client id used until the QuantCooks Flutter client is
  /// registered via `POST /oauth/register`.
  ///
  /// TODO(UNVERIFIED): replace with real client_id from OAuthClient
  /// registration. QuantMail's registered client is a SEPARATE client — do
  /// NOT reuse `QuantMail Flutter`'s client_id here.
  static const String unregisteredClientId =
      'client_quantcooks_flutter_UNREGISTERED';

  /// OAuth2 scopes for the QuantCooks client (verified contract §5, Step 2:
  /// space-joined `openid profile email`).
  static const List<String> oauthScopes = <String>[
    'openid',
    'profile',
    'email',
  ];

  /// Base URL of the Quant backend API. Trailing slashes are stripped by the
  /// auth layer when it builds its Dio instance.
  // TODO(UNVERIFIED): confirm the production QuantCooks base URL; no
  // QuantCooks OpenAPI spec exists yet (checked 2026-10-03 — the app-spec
  // shift has not produced `app-foundations/quantcooks/openapi.yaml`).
  final String apiBaseUrl;

  /// Public OAuth2 client id, provisioned via `POST /oauth/register`
  /// (`is_confidential: false`). Defaults to [unregisteredClientId] until
  /// provisioning happens — repository calls fail loudly instead of sending
  /// an invalid id.
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantcooks` for `quantcooks://oauth/callback`.
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client.
  final String oauthRedirectUri;

  /// OAuth2 scopes requested during authorization.
  final List<String> scopes;

  /// Origin header sent with web-session auth calls (notably
  /// `POST /auth/login`). Must be allowlisted server-side, otherwise the
  /// backend answers 403 UNTRUSTED_ORIGIN (`phase0/AUTH_CONTRACT.md` §2).
  final String webOrigin;

  /// Whole-request timeout applied to connect/send/receive phases.
  final Duration requestTimeout;

  /// How far before the access-token expiry (900 s per
  /// `phase0/AUTH_CONTRACT.md` §5) the client should refresh proactively.
  final Duration refreshLeeway;

  /// Creates the config. Prefer `const CooksConfig()` so the
  /// `--dart-define` fallbacks are resolved at compile time.
  const CooksConfig({
    this.apiBaseUrl = const String.fromEnvironment(
      'QUANT_COOKS_API_BASE_URL',
      defaultValue: 'https://api.quantcooks.example',
    ),
    this.oauthClientId = const String.fromEnvironment(
      'QUANT_COOKS_OAUTH_CLIENT_ID',
      defaultValue: unregisteredClientId,
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'QUANT_COOKS_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantcooks',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'QUANT_COOKS_OAUTH_REDIRECT_URI',
      defaultValue: defaultRedirectUri,
    ),
    this.scopes = oauthScopes,
    this.webOrigin = const String.fromEnvironment(
      'QUANT_COOKS_WEB_ORIGIN',
      defaultValue: 'https://quantcooks.quantrinity.in',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'QUANT_COOKS_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'QUANT_COOKS_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  });

  /// Whether a real client id has been provisioned (i.e. the placeholder
  /// [unregisteredClientId] was replaced via `--dart-define`).
  bool get isClientProvisioned =>
      oauthClientId.isNotEmpty && oauthClientId != unregisteredClientId;

  @override
  String toString() =>
      'CooksConfig(apiBaseUrl: $apiBaseUrl, oauthClientId: '
      '${isClientProvisioned ? "<set>" : "<unprovisioned>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
