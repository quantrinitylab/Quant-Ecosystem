// ============================================================================
// quantmax_core - QuantMaxAuthRepository: QuantMail SSO orchestration
// ============================================================================
//
// QuantMax authenticates via QuantMail SSO (OAuth2 + PKCE, D1: the EXISTING
// backend contract — no new endpoints, no password login, no TOTP in this
// package). The SSO handshake happens in the system browser against the
// QuantMail web session; this repository owns the PKCE state, the code
// exchange, silent refresh (with rotation), and sign-out.
//
// Two entry paths into the OAuth2 pair:
//   1. [beginBrowserSignIn] (primary): builds the authorize URL (fresh
//      `code_verifier` + `state`) and stashes the pending [AuthorizeRequest].
//      The caller opens `request.url` in the system browser; the
//      `/oauth/callback` deep link finishes via [completeBrowserUpgrade].
//      TODO(UNVERIFIED): verify that `GET /oauth/authorize` in a browser
//      context (web-session cookie, no Bearer header) issues the code after
//      the QuantMail web SSO login — F1 only verifies the Bearer-header
//      variant. Spec: `app-foundations/quantmax` (not yet landed).
//   2. [upgradeWithSessionToken] (verified F1 path): given a pre-existing
//      Bearer access token (e.g. migrated from a web session), calls
//      `GET /oauth/authorize` with that token and `followRedirects: false`:
//      `302` → code exchange (PKCE); `200` (HTML consent screen) →
//      [ConsentRequiredException] for the browser round-trip.
// A 401 at step 2 means the session token expired — call [refreshSession]
// first when a refresh token exists.
//
// Token lifetimes (verified, `phase0/AUTH_CONTRACT.md` §1.8): access 900 s,
// refresh 30 days with rotation + family revocation on reuse.

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart'
    show AuthorizeRequest, OAuthException, TokenSet;

import 'auth_api.dart';
import 'auth_exceptions.dart';
import 'token_manager.dart';

/// Orchestrates QuantMail SSO for QuantMax: browser sign-in bootstrap, the
/// OAuth2 + PKCE code exchange, silent refresh with rotation, and sign-out.
///
/// Constructed from the auth transport plus deployment config; exposed to
/// the app through Riverpod providers (see `auth_providers.dart`). The
/// injected dependencies ([authApi], [tokenManager]) are owned by the
/// caller — this repository never disposes them.
class QuantMaxAuthRepository {
  /// Default custom-scheme redirect URI for the QuantMax Flutter client.
  ///
  /// TODO(UNVERIFIED): confirm the registered scheme/URI for the QuantMax
  /// client (`app-foundations/quantmax` spec not yet landed; W1's
  /// `AppConfig.oauthRedirectUri` is the source of truth once provisioned).
  /// Must be byte-identical between `GET /oauth/authorize` and
  /// `POST /oauth/token` — the backend enforces redirect_uri rebinding
  /// (`phase0/AUTH_CONTRACT.md` §1.4).
  static const String defaultRedirectUri = 'quantmax://oauth/callback';

  /// OAuth2 PKCE transport (`/oauth/authorize`, `/oauth/token`,
  /// `/oauth/revoke`) — paths from [AppConfig].
  final QuantMaxAuthApi authApi;

  /// Secure token store + in-memory cache + auth-state broadcast.
  final TokenManager tokenManager;

  /// Backend base URL, e.g. `https://api.quantmail.com`. Trailing slashes
  /// are stripped when the authorize Dio is built. `http://` is rejected
  /// (S4) — the same guard as the API client.
  final String apiBaseUrl;

  /// Public OAuth2 client id from `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioned.
  final String oauthClientId;

  /// Redirect URI used for the PKCE flow. Defaults to [defaultRedirectUri].
  final String redirectUri;

  /// Bare Dio for the direct `GET /oauth/authorize` call (no
  /// auth/refresh/retry interceptors): the authorize call must never enter
  /// the 401-refresh loop, and redirects are inspected manually
  /// (S3: `followRedirects: false`).
  final Dio _authorizeDio;

  /// In-flight PKCE request awaiting the browser callback. Set by
  /// [beginBrowserSignIn] (and by [upgradeWithSessionToken] when it throws
  /// [ConsentRequiredException]); cleared by [completeBrowserUpgrade] and
  /// [signOut].
  AuthorizeRequest? _pendingAuthorizeRequest;

  /// Creates the repository.
  ///
  /// [authorizeDio] is a test seam: callers can inject a Dio with a stubbed
  /// interceptor instead of the default bare client.
  QuantMaxAuthRepository({
    required this.authApi,
    required this.tokenManager,
    required this.apiBaseUrl,
    required this.oauthClientId,
    this.redirectUri = defaultRedirectUri,
    Duration timeout = const Duration(seconds: 30),
    Dio? authorizeDio,
  }) : _authorizeDio = authorizeDio ??
            Dio(
              BaseOptions(
                baseUrl: _normalizeBaseUrl(apiBaseUrl),
                connectTimeout: timeout,
                receiveTimeout: timeout,
                sendTimeout: timeout,
                contentType: Headers.jsonContentType,
                // S3: inspect redirects ourselves; never replay the Bearer
                // header (or anything else) to another host.
                followRedirects: false,
              ),
            );

  /// The in-flight PKCE authorization request (non-null while a browser
  /// sign-in round-trip is outstanding).
  AuthorizeRequest? get pendingAuthorizeRequest => _pendingAuthorizeRequest;

  /// Starts the browser SSO sign-in.
  ///
  /// Builds the authorize URL (fresh `code_verifier` + `state`) and stashes
  /// the request as pending. The caller opens `request.url` in the system
  /// browser (`BrowserAuthLauncher`); when the `redirectUri` deep link
  /// arrives, finish with [completeBrowserUpgrade].
  ///
  /// Requires a provisioned [oauthClientId] ([AuthException] otherwise).
  ///
  /// TODO(UNVERIFIED): the browser-cookie variant of `/oauth/authorize`
  /// (web-session SSO without a Bearer header) — F1 only verifies the
  /// Bearer-header variant (see [upgradeWithSessionToken]). Wire/verify
  /// against the QuantMax app spec once `app-foundations/quantmax` lands.
  AuthorizeRequest beginBrowserSignIn({
    List<String> scopes = const ['openid', 'profile', 'email'],
  }) {
    _assertClientProvisioned();
    final request = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
      scopes: scopes,
    );
    _pendingAuthorizeRequest = request;
    return request;
  }

  /// Upgrades a pre-existing Bearer session token to the long-lived OAuth2
  /// pair (PKCE) — the VERIFIED (F1) direct-call path.
  ///
  /// Calls `GET /oauth/authorize` with the Bearer token and
  /// `followRedirects: false`:
  /// - `302` → extracts `code` from the `Location`, verifies `state`,
  ///   exchanges the code, and stores both tokens via
  ///   [TokenManager.setTokens].
  /// - `200` (HTML consent screen — no consent on file) → throws
  ///   [ConsentRequiredException] carrying the request (verifier + state).
  ///   Open `request.url` in the system browser and finish with
  ///   [completeBrowserUpgrade].
  /// - anything else → [AuthException].
  ///
  /// Requires a provisioned [oauthClientId] ([AuthException] otherwise).
  Future<void> upgradeWithSessionToken(String accessToken) async {
    _assertClientProvisioned();
    if (accessToken.isEmpty) {
      throw const AuthException(
        'No session token available for the OAuth upgrade',
        code: 'no_access_token',
      );
    }
    final request = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
    );

    final response = await _authorizeDio.getUri<dynamic>(
      request.url,
      options: Options(
        // Inspect the 302/200 ourselves instead of letting Dio throw on the
        // redirect or follow it into the custom scheme.
        validateStatus: (_) => true,
        followRedirects: false,
        headers: <String, dynamic>{'Authorization': 'Bearer $accessToken'},
      ),
    );

    final status = response.statusCode ?? 0;
    if (status == 301 || status == 302) {
      final location = response.headers.value('location');
      if (location == null || location.isEmpty) {
        throw const AuthException(
          'Authorize endpoint redirected without a Location header',
          code: 'missing_location',
        );
      }
      final Uri callback;
      try {
        callback = Uri.parse(location);
      } on FormatException {
        throw const AuthException(
          'Authorize endpoint returned an invalid redirect location',
          code: 'invalid_location',
        );
      }
      await _completeExchange(request, callback);
      return;
    }
    if (status == 200) {
      _pendingAuthorizeRequest = request;
      throw ConsentRequiredException(request);
    }
    throw AuthException(
      'Authorization request failed (HTTP $status)',
      code: 'authorize_failed',
    );
  }

  /// Completes a browser-driven sign-in after the redirect arrives.
  ///
  /// Verifies `state` against the pending request (mismatch → [AuthException]
  /// `state_mismatch`), surfaces an `error` query param (`access_denied`,
  /// …), then exchanges the `code` (PKCE) and stores both tokens. Clears the
  /// pending request in all cases.
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    final request = _pendingAuthorizeRequest;
    if (request == null) {
      throw const AuthException(
        'No pending authorization request — call beginBrowserSignIn first',
        code: 'no_pending_request',
      );
    }
    try {
      _assertClientProvisioned();
      await _completeExchange(request, callbackUri);
    } finally {
      _pendingAuthorizeRequest = null;
    }
  }

  /// Silently refreshes the session (`POST /oauth/token`,
  /// `grant_type=refresh_token`).
  ///
  /// Runs through the shared [RefreshMutex] single flight when called from
  /// the provider wiring (S1: dedupes against concurrent 401-triggered
  /// refreshes — rotation makes a second concurrent grant fatal to the
  /// session).
  ///
  /// The backend ROTATES the pair: both returned tokens are stored and the
  /// old refresh token is discarded. On `invalid_grant` (revoked / reused —
  /// family revocation) the local tokens are cleared and
  /// [AuthSignedOutException] is thrown so the UI routes back to login.
  Future<void> refreshSession() async {
    await tokenManager.hydrate();
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const AuthException(
        'No refresh token stored — a fresh sign-in is required',
        code: 'no_refresh_token',
      );
    }
    try {
      final tokens = await authApi.refreshToken(refreshToken);
      await tokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
    } on OAuthException catch (e) {
      if (e.error == 'invalid_grant') {
        await tokenManager.clearTokens();
        throw const AuthSignedOutException();
      }
      throw _wrapOAuth(e, 'Token refresh');
    }
  }

  /// Signs out: best-effort revocation of the stored refresh token
  /// (`POST /oauth/revoke` — always 200 per RFC 7009; failures are swallowed)
  /// followed by clearing local tokens and any pending authorize request.
  Future<void> signOut() async {
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken != null && refreshToken.isNotEmpty) {
      try {
        await authApi.revokeToken(refreshToken);
      } on Object {
        // Best-effort: revocation failure must not block local sign-out.
      }
    }
    _pendingAuthorizeRequest = null;
    await tokenManager.clearTokens();
  }

  // -- Internals --------------------------------------------------------------

  /// S4: rejects `http://` base URLs (mirrors the API client guard).
  static String _normalizeBaseUrl(String baseUrl) {
    final trimmed = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    if (uri == null || uri.scheme != 'https') {
      throw ArgumentError.value(
        baseUrl,
        'apiBaseUrl',
        'must be an https:// URL (S4: http:// is rejected)',
      );
    }
    return trimmed;
  }

  void _assertClientProvisioned() {
    if (oauthClientId.isEmpty) {
      throw const AuthException(
        'OAuth client not provisioned',
        code: 'client_not_provisioned',
      );
    }
  }

  /// Shared tail of both upgrade paths: state check → error check → PKCE
  /// exchange → store the rotated pair.
  Future<void> _completeExchange(
    AuthorizeRequest request,
    Uri callbackUri,
  ) async {
    final params = callbackUri.queryParameters;
    if (params['state'] != request.state) {
      throw const AuthException(
        'OAuth state mismatch — possible CSRF attack',
        code: 'state_mismatch',
      );
    }
    final error = params['error'];
    if (error != null) {
      final description = params['error_description'];
      throw AuthException(
        'Authorization failed ($error)'
        '${description != null ? ': $description' : ''}',
        code: error,
      );
    }
    final code = params['code'];
    if (code == null || code.isEmpty) {
      throw const AuthException(
        'Authorization response carried no code',
        code: 'missing_code',
      );
    }
    final tokens = await _exchangeCode(code: code, request: request);
    await tokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
  }

  Future<TokenSet> _exchangeCode({
    required String code,
    required AuthorizeRequest request,
  }) async {
    _assertClientProvisioned();
    try {
      // redirect_uri must be byte-identical to the authorize-time value
      // (AUTH_CONTRACT.md §1.4); [redirectUri] is used for both calls.
      return await authApi.exchangeCode(
        code: code,
        codeVerifier: request.codeVerifier,
        clientId: oauthClientId,
        redirectUri: redirectUri,
      );
    } on OAuthException catch (e) {
      throw _wrapOAuth(e, 'Authorization code exchange');
    }
  }

  /// Wraps a transport [OAuthException] as an [AuthException], keeping the
  /// OAuth2 error code in both [AuthException.code] and the message.
  AuthException _wrapOAuth(OAuthException e, String context) => AuthException(
        '$context failed (${e.error})'
        '${e.description != null ? ': ${e.description}' : ''}',
        code: e.error,
      );
}
