// ============================================================================
// quant_core - AuthRepository: login / 2FA / OAuth2+PKCE orchestration
// ============================================================================
//
// Phase 1 M2 (see `phase0/PHASED_PLAN.md`): authentication orchestration on
// top of the phase-0 foundation primitives (`AuthApi`, `TokenManager`).
//
// Two-phase bootstrap (verified: `phase0/AUTH_CONTRACT.md`):
//   1. `POST /auth/login` (+ `/auth/2fa/verify`) yields a short-lived access
//      token (900 s). Public endpoint, JSON body, allowlisted `Origin` header.
//   2. [upgradeToOAuthTokens] calls `GET /oauth/authorize` with that Bearer
//      token (F1: the endpoint requires one), follows the 302 to the
//      authorization code, and exchanges it (PKCE) for the long-lived pair
//      (refresh 30 days, rotated on every refresh grant).
// A 200 HTML answer at step 2 means "no consent on file": the caller opens
// the URL in a browser and finishes with [completeBrowserUpgrade].
//
// TODO(UNVERIFIED): the exact `/auth/login` error envelope (success + 2FA
// shapes verified; errors are parsed defensively), the registered Flutter
// `client_id` (U1), and the native browser-bootstrap UX (F1/U3).

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'auth_exceptions.dart';

/// Orchestrates QuantMail authentication: password login (+ TOTP 2FA), the
/// OAuth2 + PKCE upgrade to long-lived tokens, silent refresh with rotation,
/// and sign-out.
///
/// Constructed from foundation primitives plus deployment config; exposed to
/// the app through Riverpod providers (see `src/providers/`). The injected
/// dependencies ([authApi], [tokenManager]) are owned by the caller — this
/// repository never disposes them.
class AuthRepository {
  /// Default custom-scheme redirect URI registered for the Flutter client
  /// (verified: `phase0/AUTH_CONTRACT.md` §1.1). Must be byte-identical
  /// between `GET /oauth/authorize` and `POST /oauth/token` — the backend
  /// enforces redirect_uri rebinding (§1.4).
  static const String defaultRedirectUri = 'quantmail://oauth/callback';

  /// OAuth2 PKCE transport (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`).
  final AuthApi authApi;

  /// Secure token store + in-memory cache + auth-state broadcast.
  final TokenManager tokenManager;

  /// Backend base URL, e.g. `https://api.quantmail.com`. Trailing slashes
  /// are stripped when the login Dio is built.
  final String apiBaseUrl;

  /// Value sent as the `Origin` header on the public `/auth/*` calls. Must
  /// be allowlisted server-side, otherwise the backend answers 403
  /// UNTRUSTED_ORIGIN (`phase0/AUTH_CONTRACT.md` §2).
  final String webOrigin;

  /// Public OAuth2 client id from `POST /oauth/register`
  /// (`is_confidential: false`). Empty until provisioned — see U1.
  final String oauthClientId;

  /// Redirect URI used for the PKCE flow. Defaults to [defaultRedirectUri].
  final String redirectUri;

  /// Bare Dio for the public `/auth/*` bootstrap calls (no auth/refresh
  /// interceptors): those endpoints carry no Bearer token and must never
  /// enter the 401-refresh loop.
  final Dio _loginDio;

  /// In-flight PKCE request awaiting the browser callback. Set when
  /// [upgradeToOAuthTokens] throws [ConsentRequiredException]; cleared by
  /// [completeBrowserUpgrade] and [signOut].
  AuthorizeRequest? _pendingAuthorizeRequest;

  /// Creates the repository.
  ///
  /// [loginDio] is a test seam: callers can inject a Dio with a stubbed
  /// interceptor instead of the default bare client.
  AuthRepository({
    required this.authApi,
    required this.tokenManager,
    required this.apiBaseUrl,
    required this.webOrigin,
    required this.oauthClientId,
    this.redirectUri = defaultRedirectUri,
    Duration timeout = const Duration(seconds: 30),
    Dio? loginDio,
  }) : _loginDio = loginDio ?? _buildLoginDio(apiBaseUrl, webOrigin, timeout);

  /// Builds the bare login-transport Dio.
  ///
  /// [requireHttpsBaseUrl] runs first (P1, zero-defect security shift
  /// 2026-10-04): without it, a misconfigured
  /// `QUANT_API_BASE_URL=http://…` would send the user's plaintext password
  /// over cleartext HTTP. Throws [ArgumentError] in ALL build modes; `http`
  /// is accepted only for loopback dev hosts.
  ///
  /// `followRedirects: false`: a 307/308 on `/auth/login` must never
  /// silently replay the password JSON body to another host. The OAuth
  /// authorize 302 is inspected manually per-request (see
  /// [upgradeToOAuthTokens]), so nothing depends on following redirects.
  static Dio _buildLoginDio(
    String apiBaseUrl,
    String webOrigin,
    Duration timeout,
  ) {
    requireHttpsBaseUrl(apiBaseUrl);
    return Dio(
      BaseOptions(
        baseUrl: apiBaseUrl.replaceAll(RegExp(r'/+$'), ''),
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
        contentType: Headers.jsonContentType,
        followRedirects: false,
        // Verified (AUTH_CONTRACT.md §1.9): an allowlisted Origin
        // header is mandatory on /auth/login and /auth/2fa/verify.
        headers: <String, dynamic>{'Origin': webOrigin},
      ),
    );
  }

  /// The in-flight PKCE authorization request (non-null while a browser
  /// consent round-trip is outstanding).
  AuthorizeRequest? get pendingAuthorizeRequest => _pendingAuthorizeRequest;

  /// Signs in with email + password (`POST /auth/login`).
  ///
  /// Returns [LoginSucceeded] after storing the short-lived access token, or
  /// [LoginTwoFactorRequired] carrying the `challenge` for [verifyTwoFactor].
  /// Throws [AuthException] on invalid credentials, untrusted origin, or
  /// transport failures.
  Future<LoginResult> signInWithPassword({
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
  /// Throws [AuthException] on a wrong/expired code or transport failures.
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
      throw const AuthException(
        'Verification poori nahi ho payi — dobara try karo.',
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
  /// Builds the authorize URL (fresh `code_verifier` + `state`), calls
  /// `GET /oauth/authorize` with the current Bearer token and
  /// `followRedirects: false`:
  /// - `302` → extracts `code` from the `Location`, verifies `state`,
  ///   exchanges the code, and stores both tokens via
  ///   [TokenManager.setTokens].
  /// - `200` (HTML consent screen — no consent on file) → throws
  ///   [ConsentRequiredException] carrying the request (verifier + state).
  ///   The caller opens `request.url` in a browser and finishes with
  ///   [completeBrowserUpgrade].
  /// - anything else → [AuthException].
  ///
  /// Requires a provisioned [oauthClientId] and a signed-in session
  /// ([AuthException] otherwise). A 401 here means the login access token
  /// expired — call [refreshSession] first when a refresh token exists.
  Future<void> upgradeToOAuthTokens() async {
    _assertClientProvisioned();
    final request = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
    );
    // F1 (AUTH_CONTRACT.md §1.2): /oauth/authorize demands a pre-existing
    // Bearer access token — the password login step must come first.
    final accessToken = await tokenManager.getValidToken();
    if (accessToken == null || accessToken.isEmpty) {
      throw const AuthException(
        'Session expire ho gayi — dobara sign in karo.',
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
        throw const AuthException(
          'Login redirect me dikkat aayi — dobara try karo.',
          code: 'missing_location',
        );
      }
      final Uri callback;
      try {
        callback = Uri.parse(location);
      } on FormatException {
        throw const AuthException(
          'Login redirect me dikkat aayi — dobara try karo.',
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
      'Login request fail ho gayi — dobara try karo.',
      code: 'authorize_failed',
    );
  }

  /// Completes a browser-driven upgrade after the user approved consent.
  ///
  /// Verifies `state` against the pending request (mismatch → [AuthException]
  /// `state_mismatch`), surfaces an `error` query param (`access_denied`,
  /// …), then exchanges the `code` (PKCE) and stores both tokens. Clears the
  /// pending request in all cases.
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    final request = _pendingAuthorizeRequest;
    if (request == null) {
      throw const AuthException(
        'Login session me dikkat aayi — dobara sign in karo.',
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
  /// [AuthSignedOutException] is thrown so the UI routes back to login.
  Future<void> refreshSession() async {
    await tokenManager.hydrate();
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const AuthException(
        'Session expire ho gayi — dobara sign in karo.',
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

  void _assertClientProvisioned() {
    if (oauthClientId.isEmpty) {
      // U1: unknown whether a quantmail-flutter client is registered yet —
      // fail loudly instead of sending an empty client_id.
      throw const AuthException(
        'App ka login setup adhura hai — baad me dobara try karo.',
        code: 'client_not_provisioned',
      );
    }
  }

  Future<Response<dynamic>> _postLogin(
    String path,
    Map<String, dynamic> body,
  ) async {
    try {
      // The allowlisted Origin header is mandatory on /auth/* (contract
      // §1.9). Set it per-request so a caller-injected loginDio carries it
      // too (per-request headers merge over the Dio's base headers).
      return await _loginDio.post<dynamic>(
        path,
        data: body,
        options: Options(headers: <String, dynamic>{'Origin': webOrigin}),
      );
    } on DioException catch (e) {
      throw _toAuthException(e);
    }
  }

  Map<String, dynamic> _jsonBody(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    throw AuthException(
      'Unexpected response shape (HTTP ${response.statusCode})',
      code: 'invalid_response',
    );
  }

  Future<LoginResult> _parseLoginResult(Map<String, dynamic> body) async {
    if (body['twoFactorRequired'] == true) {
      final challenge = body['challenge'];
      if (challenge is! String || challenge.isEmpty) {
        throw const AuthException(
          'Verification code nahi mil paya — dobara sign in karo.',
          code: 'missing_challenge',
        );
      }
      return LoginTwoFactorRequired(challenge);
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
    return const LoginSucceeded();
  }

  /// Extracts `data.accessToken` from a successful login-shaped body.
  String? _loginAccessToken(Map<String, dynamic> body) {
    if (body['success'] != true) return null;
    final data = body['data'];
    final token = data is Map<String, dynamic> ? data['accessToken'] : null;
    return token is String && token.isNotEmpty ? token : null;
  }

  /// Builds the [AuthException] for a non-session login-shaped body.
  ///
  /// TODO(UNVERIFIED): the exact `/auth/login` error envelope. The success
  /// and 2FA shapes are verified (AUTH_CONTRACT.md §2); error parsing here
  /// is defensive.
  AuthException _loginFailure(Map<String, dynamic> body) {
    final code = body['error'] ?? body['code'];
    final message = body['message'] ??
        body['error_description'] ??
        body['error'] ??
        'Login failed';
    return AuthException(message.toString(), code: code?.toString());
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

  /// Wraps a foundation [OAuthException] as an [AuthException], keeping the
  /// OAuth2 error code in both [AuthException.code] and the message.
  AuthException _wrapOAuth(OAuthException e, String context) => AuthException(
        '$context failed (${e.error})'
        '${e.description != null ? ': ${e.description}' : ''}',
        code: e.error,
      );

  AuthException _toAuthException(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    if (status == 403 && data.toString().contains('UNTRUSTED_ORIGIN')) {
      return AuthException(
        'Login setup me dikkat hai — dobara try karo.',
        code: 'UNTRUSTED_ORIGIN',
      );
    }
    if (data is Map<String, dynamic>) {
      final code = data['error'] ?? data['code'];
      if (code != null) {
        final message = data['message'] ?? data['error_description'] ?? code;
        return AuthException(message.toString(), code: code.toString());
      }
      return _loginFailure(data);
    }
    return AuthException(
      'Request fail ho gayi — internet check karke dobara try karo.',
      code: 'network_error',
    );
  }
}
