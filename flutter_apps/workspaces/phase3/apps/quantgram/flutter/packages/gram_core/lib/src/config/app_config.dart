// ============================================================================
// gram_core - QuantGram application configuration
// ============================================================================
//
// All runtime configuration arrives via `--dart-define` flags (read with the
// const [String.fromEnvironment] / [int.fromEnvironment] constructors), so no
// secrets or environment-specific values are baked into the source. Every
// flag has a documented default below; CI / prod builds pass the real values:
//
//   flutter run \
//     --dart-define=GRAM_API_BASE_URL=https://api.quantgram.example \
//     --dart-define=GRAM_OAUTH_CLIENT_ID=client_... \
//     --dart-define=GRAM_OAUTH_REDIRECT_URI=quantgram://oauth/callback \
//     --dart-define=GRAM_APP_ENV=prod
//
// QuantGram authenticates via the QuantMail SSO OAuth2 server (shared auth
// backend for the ecosystem); endpoint paths mirror the verified contract in
// `phase0/AUTH_CONTRACT.md` — but the QuantGram client registration itself is
// unverified (TODO(UNVERIFIED) below), since the app-foundations spec for
// QuantGram has not been produced yet.
//
// Security S4 (SECURITY_REVIEW.md, 2026-10-03): a plain-`http://` base URL
// must never be silently accepted. [AppBootstrap.validateConfig] asserts and
// throws when the scheme is not https; only local dev hosts (localhost /
// 127.0.0.1 / 10.0.2.2) are tolerated, and only in non-release builds.

import 'package:flutter/foundation.dart';

/// Build flavor the binary was compiled for. Supplied via
/// `--dart-define=GRAM_APP_ENV=<dev|staging|prod>` (defaults to `dev`).
enum AppEnv {
  /// Local development (debug defaults, verbose logging, lenient security).
  dev,

  /// Pre-production staging (release-ish build, staging backends).
  staging,

  /// Production (release build, hardened: https-only, no debug flags).
  prod;

  /// Parses the `GRAM_APP_ENV` dart-define value; falls back to [dev].
  static AppEnv fromName(String name) =>
      AppEnv.values.asNameMap()[name] ?? AppEnv.dev;
}

/// Compile-time application configuration for the QuantGram Flutter clients.
///
/// All values are `--dart-define` backed with documented fallbacks. Prefer the
/// shared instance from the W3 `appConfigProvider` (override it per flavor /
/// in tests) once providers land.
class AppConfig {
  /// Base URL of the Quant ecosystem Fastify backend serving QuantGram
  /// endpoints. Trailing slashes are stripped by the API client (W3) when it
  /// builds its Dio instance.
  // TODO(UNVERIFIED): production host pending — board decision needed
  // (pending API contract in app-foundations/quantgram/). Current value is a
  // placeholder; CI must pass the real host via GRAM_API_BASE_URL.
  final String apiBaseUrl;

  /// Which flavor this binary was built for.
  final AppEnv appEnv;

  /// Public OAuth2 client id registered against the QuantMail SSO server.
  /// Empty until the `quantgram-flutter` public client is provisioned via
  /// `POST /oauth/register` (`is_confidential: false`).
  // TODO(UNVERIFIED): no QuantGram client registration exists yet — the
  // AUTH_CONTRACT.md flow is verified for QuantMail only. Provisioning blocks
  // the login vertical slice.
  final String oauthClientId;

  /// Custom URL scheme the app claims for the OAuth2 redirect, e.g.
  /// `quantgram` for `quantgram://oauth/callback`. Must match the verbatim
  /// registration against the SSO server.
  final String oauthRedirectScheme;

  /// Full redirect URI registered for the client. Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token` (redirect_uri
  /// rebinding protection, `phase0/AUTH_CONTRACT.md` §1.4).
  final String oauthRedirectUri;

  /// OAuth2 token endpoint path (resolved against [apiBaseUrl]).
  /// Mirrors the verified QuantMail contract (`/oauth/token`, JSON bodies
  /// only); unverified for the QuantGram client until spec lands.
  // TODO(UNVERIFIED): endpoint shape assumed from AUTH_CONTRACT.md §1.4.
  final String oauthTokenPath;

  /// OAuth2 authorization endpoint path (resolved against [apiBaseUrl]).
  // TODO(UNVERIFIED): endpoint shape assumed from AUTH_CONTRACT.md §1.2.
  final String oauthAuthorizePath;

  /// Whole-request timeout applied to connect/send/receive phases (mirrors the
  /// TS HttpClient's single timeout, split per Dio phase in W3's client).
  final Duration requestTimeout;

  /// How far before access-token expiry the client refreshes proactively.
  /// QuantMail SSO issues 900 s access tokens (AUTH_CONTRACT.md §1.8).
  // TODO(UNVERIFIED): leeway assumes the SSO token lifetime applies to
  // QuantGram; revisit when the spec lands.
  final Duration refreshLeeway;

  /// Creates the config. Prefer `const AppConfig()` so the `--dart-define`
  /// fallbacks are resolved at compile time.
  const AppConfig({
    // TODO(UNVERIFIED): production host pending board decision.
    this.apiBaseUrl = const String.fromEnvironment(
      'GRAM_API_BASE_URL',
      defaultValue: 'https://api.quantgram.example',
    ),
    this.appEnv = AppEnv.dev,
    this.oauthClientId = const String.fromEnvironment(
      'GRAM_OAUTH_CLIENT_ID',
      defaultValue: '',
    ),
    this.oauthRedirectScheme = const String.fromEnvironment(
      'GRAM_OAUTH_REDIRECT_SCHEME',
      defaultValue: 'quantgram',
    ),
    this.oauthRedirectUri = const String.fromEnvironment(
      'GRAM_OAUTH_REDIRECT_URI',
      defaultValue: 'quantgram://oauth/callback',
    ),
    this.oauthTokenPath = const String.fromEnvironment(
      'GRAM_OAUTH_TOKEN_PATH',
      defaultValue: '/oauth/token',
    ),
    this.oauthAuthorizePath = const String.fromEnvironment(
      'GRAM_OAUTH_AUTHORIZE_PATH',
      defaultValue: '/oauth/authorize',
    ),
    this.requestTimeout = const Duration(
      seconds: int.fromEnvironment(
        'GRAM_REQUEST_TIMEOUT_SECONDS',
        defaultValue: 30,
      ),
    ),
    this.refreshLeeway = const Duration(
      seconds: int.fromEnvironment(
        'GRAM_REFRESH_LEEWAY_SECONDS',
        defaultValue: 120,
      ),
    ),
  });

  /// Named constructor resolving [AppEnv] from `--dart-define=GRAM_APP_ENV`.
  ///
  /// `const` can't call [AppEnv.fromName], so this factory is the non-const
  /// entry point when the flavor must be read from the environment.
  factory AppConfig.fromEnvironment() {
    const defaultConfig = AppConfig();
    return AppConfig(
      apiBaseUrl: defaultConfig.apiBaseUrl,
      appEnv: AppEnv.fromName(
        const String.fromEnvironment('GRAM_APP_ENV', defaultValue: 'dev'),
      ),
      oauthClientId: defaultConfig.oauthClientId,
      oauthRedirectScheme: defaultConfig.oauthRedirectScheme,
      oauthRedirectUri: defaultConfig.oauthRedirectUri,
      oauthTokenPath: defaultConfig.oauthTokenPath,
      oauthAuthorizePath: defaultConfig.oauthAuthorizePath,
      requestTimeout: defaultConfig.requestTimeout,
      refreshLeeway: defaultConfig.refreshLeeway,
    );
  }

  /// Enforces Security S4: the base URL must use https.
  ///
  /// Local dev hosts (`localhost`, `127.0.0.1`, `10.0.2.2`) over plain http
  /// are tolerated **only in non-release builds** ([kReleaseMode] guard).
  /// Called once from [AppBootstrap.initialize] — in debug it asserts, in
  /// release a non-https (or non-local) URL throws and stops startup, because
  /// silently accepting http:// would leak OAuth tokens onto the wire.
  void validateBaseUrlScheme() {
    final Uri uri;
    try {
      uri = Uri.parse(apiBaseUrl);
    } on FormatException {
      throw StateError('Invalid GRAM_API_BASE_URL: "$apiBaseUrl"');
    }
    final isLocalHost = uri.host == 'localhost' ||
        uri.host == '127.0.0.1' ||
        uri.host == '10.0.2.2';
    final allowed = uri.scheme == 'https' || (!kReleaseMode && isLocalHost);

    // Debug-time assert: catches misconfiguration during development.
    assert(
      allowed,
      'S4: GRAM_API_BASE_URL must use https '
      '(got "$apiBaseUrl"); http:// is only tolerated for local dev hosts '
      'in non-release builds.',
    );
    if (!allowed) {
      throw StateError(
        'S4: refusing non-https API base URL in release mode: "$apiBaseUrl"',
      );
    }
  }

  @override
  String toString() =>
      'AppConfig(appEnv: $appEnv, apiBaseUrl: $apiBaseUrl, '
      'oauthClientId: ${oauthClientId.isEmpty ? "<unprovisioned>" : "<set>"}, '
      'oauthRedirectUri: $oauthRedirectUri, requestTimeout: $requestTimeout)';
}
