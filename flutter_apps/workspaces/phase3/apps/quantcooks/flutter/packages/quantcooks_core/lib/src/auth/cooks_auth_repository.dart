// ============================================================================
// quantcooks_core - CooksAuthRepository: login / 2FA / OAuth2+PKCE
// ============================================================================
//
// QuantCooks authentication orchestration on top of the phase-0 foundation
// primitives (`AuthApi`, `TokenManager`) — adapted from the QuantMail
// phase-1 `AuthRepository` pattern (`phase1/apps/quantmail/flutter/...`).
//
// Two-phase bootstrap (verified: `phase0/AUTH_CONTRACT.md` §5):
//   1. `POST /auth/login` (+ `/auth/2fa/verify`) yields a short-lived access
//      token (900 s). Public endpoint, JSON body, allowlisted `Origin` header.
//   2. [upgradeToOAuthTokens] calls `GET /oauth/authorize` with that Bearer
//      token (the endpoint requires one), follows the 302 to the
//      authorization code, and exchanges it (PKCE) for the long-lived pair
//      (refresh 30 days, rotated on every refresh grant).
// A 200 HTML answer at step 2 means "no consent on file": the caller opens
// the URL in a browser and finishes with [completeBrowserUpgrade].
//
// D1: authentication reuses the existing OAuth2+PKCE contract. No new
// endpoints are invented here; every path comes from the foundation's
// [OAuthPaths] (verified `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`)
// or from the verified `/auth/*` shapes in AUTH_CONTRACT.md §2.
//
// TODO(UNVERIFIED): the registered QuantCooks Flutter `client_id` (the
// default [oauthClientId] is a placeholder — calls fail loudly until the
// real id is provisioned), the exact `/auth/login` error envelope (success +
// 2FA shapes verified; errors are parsed defensively), and the native
// browser-bootstrap UX.

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/cooks_config.dart';
import 'cooks_auth_exceptions.dart';

/// Orchestrates QuantCooks authentication: password login (+ TOTP 2FA), the
/// OAuth2 + PKCE upgrade to long-lived tokens, silent refresh with rotation,
/// and sign-out.
///
/// Constructed from foundation primitives plus deployment config; exposed to
/// the app through Riverpod providers (see `cooks_auth_providers.dart`). The
/// injected dependencies ([authApi], [tokenManager]) are owned by the
/// caller — this repository never disposes them.
class CooksAuthRepository {
  /// OAuth2 PKCE transport (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`).
  final AuthApi authApi;

  /// Secure token store + in-memory cache + auth-state broadcast.
  final TokenManager tokenManager;

  /// Backend base URL, e.g. `https://api.quantcooks.example`. Trailing slashes
  /// are stripped when the login Dio is built.
  final String apiBaseUrl;

  /// Value sent as the `Origin` header on the public `/auth/*` calls. Must
  /// be allowlisted server-side, otherwise the backend answers 403
  /// UNTRUSTED_ORIGIN (`phase0/AUTH_CONTRACT.md` §2).
  final String webOrigin;

  /// Public OAuth2 client id from `POST /oauth/register`
  /// (`is_confidential: false`). Unprovisioned by default — see
  /// [CooksConfig.unregisteredClientId]; [_assertClientProvisioned] fails
  /// loudly until the real id arrives.
  final String oauthClientId;

  /// Redirect URI used for the PKCE flow. Defaults to the registered
  /// `quantcooks://oauth/callback`.
  final String redirectUri;

  /// OAuth2 scopes requested at authorization time (`openid profile email`
  /// per the verified contract).
  final List<String> scopes;

  /// Bare Dio for the public `/auth/*` bootstrap calls (no auth/refresh
  /// interceptors): those endpoints carry no Bearer token and must never
  /// enter the 401-refresh loop.
  final Dio _loginDio;

  /// In-flight PKCE request awaiting the browser callback. Set when
  /// [upgradeToOAuthTokens] throws [CooksConsentRequiredException]; cleared
  /// by [completeBrowserUpgrade] and [signOut].
  AuthorizeRequest? _pendingAuthorizeRequest;

  /// Creates the repository.
  ///
  /// [loginDio] is a test seam: callers can inject a Dio with a stubbed
  /// interceptor instead of the default bare client.
  CooksAuthRepository({
    required this.authApi,
    required this.tokenManager,
    required this.apiBaseUrl,
    required this.webOrigin,
    required this.oauthClientId,
    this.redirectUri = CooksConfig.defaultRedirectUri,
    this.scopes = CooksConfig.oauthScopes,
    Duration timeout = const Duration(seconds: 30),
    Dio? loginDio,
  }) : _loginDio = loginDio ??
            Dio(
              BaseOptions(
                baseUrl: apiBaseUrl.replaceAll(RegExp(r'/+$'), ''),
                connectTimeout: timeout,
                receiveTimeout: timeout,
                sendTimeout: timeout,
                contentType: Headers.jsonContentType,
                // Verified (AUTH_CONTRACT.md §2): an allowlisted Origin
                // header is mandatory on /auth/login and /auth/2fa/verify.
                headers: <String, dynamic>{'Origin': webOrigin},
              ),
            );

  /// The in-flight PKCE authorization request (non-null while a browser
  /// consent round-trip is outstanding).
  AuthorizeRequest? get pendingAuthorizeRequest => _pendingAuthorizeRequest;

  /// Builds a browser-driven SSO authorization URL (PKCE, S256).
  ///
  /// Stores the request as the pending request so that a later
  /// [completeBrowserUpgrade] (driven by the `quantcooks://oauth/callback`
  /// deep link) can verify `state` and exchange the `code`. Returns the
  /// URL the caller should open in the system browser.
  ///
  /// NOTE (AUTH_CONTRACT.md F1): the backend `GET /oauth/authorize`
  /// currently requires a pre-existing Bearer <redacted> The browser SSO bootstrap
  /// is the Phase-1 design item — this wires the PKCE + callback plumbing
  /// so the flow completes once the client is provisioned and the backend
  /// accepts the browser session.
  ///
  /// Requires a provisioned [oauthClientId] ([CooksAuthException]
  /// `client_not_provisioned` otherwise).
  Uri buildSsoAuthorizeUrl() {
    _assertClientProvisioned();
    final request = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
      scopes: scopes,
    );
    _pendingAuthorizeRequest = request;
    return request.url;
  }

  /// Signs in with email + password (`POST /auth/login`).
  ///
  /// Returns [CooksLoginSucceeded] after storing the short-lived access
  /// token, or [CooksLoginTwoFactorRequired] carrying the `challenge` for
  /// [verifyTwoFactor]. Throws [CooksAuthException] on invalid credentials,
  /// untrusted origin, or transport failures.
  Future<CooksLoginResult> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await _postLogin(
      '/auth/login',
      <String, String>{'email': email, 'password': password},
    );
    return _parseLoginResult(_jsonBody(response));
  }

  /// Completes the TOTP second factor (`POST /auth/2fa/verify`).
  ///
  /// On success stores the session access token (same shape as login).
  /// Throws [CooksAuthException] on a wrong/expired code or transport
  /// failures.
  Future<void> verifyTwoFactor({
    required String challenge,
    required String code,
  }) async {
    final response = await _postLogin(
      '/auth/2fa/verify',
      <String, String>{'challenge': challenge, 'code': code},
    );
    final body = _jsonBody(response);
    if (body['twoFactorRequired'] == true) {
      throw const CooksAuthException(
        '2FA verification did not complete the login',
        code: '2fa_incomplete',
      );
    }
    final accessToken = _loginAccessToken(body);
    if (accessToken == null) {
      throw _loginFailure(body);
    }
    await tokenManager.setTokens(accessToken);
  }

  /// Upgrades the short-lived login access token to the long-lived OAuth2
  /// pair (PKCE).
  ///
  /// Builds the authorize URL (fresh `code_verifier` + `state` via the
  /// foundation's `AuthApi.buildAuthorizeUrl`, S256 challenge included),
  /// calls `GET /oauth/authorize` with the current Bearer token and
  /// `followRedirects: false`:
  /// - `302` → extracts `code` from the `Location`, verifies `state`,
  ///   exchanges the code, and stores both tokens via
  ///   [TokenManager.setTokens].
  /// - `200` (HTML consent screen — no consent on file) → throws
  ///   [CooksConsentRequiredException] carrying the request (verifier +
  ///   state). The caller opens `request.url` in a browser and finishes with
  ///   [completeBrowserUpgrade].
  /// - anything else → [CooksAuthException].
  ///
  /// Requires a provisioned [oauthClientId] and a signed-in session
  /// ([CooksAuthException] otherwise). A 401 here means the login access
  /// token expired — call [refreshSession] first when a refresh token exists.
  Future<void> upgradeToOAuthTokens() async {
    _assertClientProvisioned();
    final request = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
      scopes: scopes,
    );
    // Verified (AUTH_CONTRACT.md §5, Step 2): /oauth/authorize demands a
    // pre-existing Bearer access token — the password login step must come
    // first.
    final accessToken = await tokenManager.getValidToken();
    if (accessToken == null || accessToken.isEmpty) {
      throw const CooksAuthException(
        'No access token available — sign in with a password first',
        code: 'no_access_token',
      );
    }

    final response = await _loginDio.getUri<dynamic>(
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
        throw const CooksAuthException(
          'Authorize endpoint redirected without a Location header',
          code: 'missing_location',
        );
      }
      final Uri callback;
      try {
        callback = Uri.parse(location);
      } on FormatException {
        throw const CooksAuthException(
          'Authorize endpoint returned an invalid redirect location',
          code: 'invalid_location',
        );
      }
      await _completeExchange(request, callback);
      return;
    }
    if (status == 200) {
      _pendingAuthorizeRequest = request;
      throw CooksConsentRequiredException(request);
    }
    throw CooksAuthException(
      'Authorization request failed (HTTP $status)',
      code: 'authorize_failed',
    );
  }

  /// Completes a browser-driven upgrade after the user approved consent.
  ///
  /// Verifies `state` against the pending request (mismatch →
  /// [CooksAuthException] `state_mismatch`), surfaces an `error` query param
  /// (`access_denied`, …), then exchanges the `code` (PKCE) and stores both
  /// tokens. Clears the pending request in all cases.
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    final request = _pendingAuthorizeRequest;
    if (request == null) {
      throw const CooksAuthException(
        'No pending authorization request — call upgradeToOAuthTokens first',
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
  /// The backend ROTATES the pair: both returned tokens are stored and the
  /// old refresh token is discarded. On `invalid_grant` (revoked / reused —
  /// family revocation) the local tokens are cleared and
  /// [CooksSignedOutException] is thrown so the UI routes back to login.
  Future<void> refreshSession() async {
    await tokenManager.hydrate();
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const CooksAuthException(
        'No refresh token stored — a fresh login is required',
        code: 'no_refresh_token',
      );
    }
    try {
      final tokens = await authApi.refreshToken(refreshToken);
      await tokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
    } on OAuthException catch (e) {
      if (e.error == 'invalid_grant') {
        await tokenManager.clearTokens();
        throw const CooksSignedOutException();
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

  void _assertClientProvisioned() {
    if (oauthClientId.isEmpty ||
        oauthClientId == CooksConfig.unregisteredClientId) {
      // The QuantCooks Flutter client is not registered backend-side yet
      // (QuantMail's client is separate) — fail loudly instead of sending
      // a placeholder client_id.
      throw const CooksAuthException(
        'OAuth client not provisioned: register the QuantCooks Flutter '
        'client via POST /oauth/register first',
        code: 'client_not_provisioned',
      );
    }
  }

  Future<Response<dynamic>> _postLogin(
    String path,
    Map<String, dynamic> body,
  ) async {
    try {
      return await _loginDio.post<dynamic>(path, data: body);
    } on DioException catch (e) {
      throw _toAuthException(e);
    }
  }

  Map<String, dynamic> _jsonBody(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    throw CooksAuthException(
      'Unexpected response shape (HTTP ${response.statusCode})',
      code: 'invalid_response',
    );
  }

  Future<CooksLoginResult> _parseLoginResult(Map<String, dynamic> body) async {
    if (body['twoFactorRequired'] == true) {
      final challenge = body['challenge'];
      if (challenge is! String || challenge.isEmpty) {
        throw const CooksAuthException(
          'Login requires 2FA but the server issued no challenge',
          code: 'missing_challenge',
        );
      }
      return CooksLoginTwoFactorRequired(challenge);
    }
    final accessToken = _loginAccessToken(body);
    if (accessToken == null) {
      throw _loginFailure(body);
    }
    // Only the short-lived access token is issued here — the refresh token
    // stays cookie-only on the web flow (AUTH_CONTRACT.md §2) and arrives
    // via the OAuth upgrade on native. Passing no refresh token leaves any
    // previously stored one untouched (TokenManager semantics).
    await tokenManager.setTokens(accessToken);
    return const CooksLoginSucceeded();
  }

  /// Extracts `data.accessToken` from a successful login-shaped body.
  String? _loginAccessToken(Map<String, dynamic> body) {
    if (body['success'] != true) return null;
    final data = body['data'];
    final token = data is Map<String, dynamic> ? data['accessToken'] : null;
    return token is String && token.isNotEmpty ? token : null;
  }

  /// Builds the [CooksAuthException] for a non-session login-shaped body.
  ///
  /// TODO(UNVERIFIED): the exact `/auth/login` error envelope. The success
  /// and 2FA shapes are verified (AUTH_CONTRACT.md §2); error parsing here
  /// is defensive.
  CooksAuthException _loginFailure(Map<String, dynamic> body) {
    final code = body['error'] ?? body['code'];
    final message = body['message'] ??
        body['error_description'] ??
        body['error'] ??
        'Login failed';
    return CooksAuthException(message.toString(), code: code?.toString());
  }

  /// Shared tail of both upgrade paths: state check → error check → PKCE
  /// exchange → store the rotated pair.
  Future<void> _completeExchange(
    AuthorizeRequest request,
    Uri callbackUri,
  ) async {
    final params = callbackUri.queryParameters;
    if (params['state'] != request.state) {
      throw const CooksAuthException(
        'OAuth state mismatch — possible CSRF attack',
        code: 'state_mismatch',
      );
    }
    final error = params['error'];
    if (error != null) {
      final description = params['error_description'];
      throw CooksAuthException(
        'Authorization failed ($error)'
        '${description != null ? ': $description' : ''}',
        code: error,
      );
    }
    final code = params['code'];
    if (code == null || code.isEmpty) {
      throw const CooksAuthException(
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
      // (AUTH_CONTRACT.md §5, Step 4); [redirectUri] is used for both calls.
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

  /// Wraps a foundation [OAuthException] as a [CooksAuthException], keeping
  /// the OAuth2 error code in both [CooksAuthException.code] and the message.
  CooksAuthException _wrapOAuth(OAuthException e, String context) =>
      CooksAuthException(
        '$context failed (${e.error})'
        '${e.description != null ? ': ${e.description}' : ''}',
        code: e.error,
      );

  CooksAuthException _toAuthException(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    if (status == 403 && data.toString().contains('UNTRUSTED_ORIGIN')) {
      return CooksAuthException(
        'Untrusted origin: the backend rejected the configured Origin header '
        '($webOrigin). Allowlist it server-side to use password login.',
        code: 'UNTRUSTED_ORIGIN',
      );
    }
    if (data is Map<String, dynamic>) {
      final code = data['error'] ?? data['code'];
      if (code != null) {
        final message = data['message'] ?? data['error_description'] ?? code;
        return CooksAuthException(message.toString(), code: code.toString());
      }
      return _loginFailure(data);
    }
    return CooksAuthException(
      'Request failed${status != null ? ' (HTTP $status)' : ''}: '
      '${e.message ?? e.type.name}',
      code: 'network_error',
    );
  }
}
