// ============================================================================
// chat_core - AuthRepository: login / 2FA / OAuth2+PKCE orchestration
// ============================================================================
//
// QuantChat authenticates through the QuantMail SSO server (OAuth2 + PKCE,
// decision D1 — no new endpoints): [ssoBaseUrl] serves the public
// `/auth/login` + `/auth/2fa/verify` bootstrap calls AND the OAuth2
// `/oauth/*` transport, so both the bare login Dio and [authApi] are built
// against it. [apiBaseUrl] (the QuantChat Fastify backend) is stored for the
// chat API client built in later shifts — it plays no role in this shift's
// auth flow.
//
// Two-phase bootstrap (mirrors QuantMail's `quant_core.AuthRepository`):
//   1. `POST /auth/login` (+ `/auth/2fa/verify`) yields a short-lived access
//      token (900 s). Public endpoint, JSON body, allowlisted `Origin` header.
//   2. [upgradeToOAuthTokens] calls `GET /oauth/authorize` with that Bearer
//      token, follows the 302 to the authorization code, and exchanges it
//      (PKCE) for the long-lived pair (refresh 30 days, rotated on every
//      refresh grant).
// A 200 HTML answer at step 2 means "no consent on file": the caller opens
// the URL in a browser and finishes with [completeBrowserUpgrade].
//
// TODO(UNVERIFIED): the exact `/auth/login` error envelope (success + 2FA
// shapes mirror QuantMail's verified contract; errors are parsed
// defensively), the registered `quantchat-flutter` client id, and the native
// browser-bootstrap UX.

import 'package:dio/dio.dart';
// Foundation's canonical `requireHttpsBaseUrl` is deliberately stricter
// (loopback-only http). Chat's local guard (../config/app_config.dart) keeps
// the RFC1918 LAN allowlist (QuantAI S4 template: LAN http in dev stays
// release-safe-but-local). All call sites in this file use local semantics,
// so the local definition wins — the `hide` below makes that explicit.
// Behavior unchanged: explicitness only, zero behavior delta.
import 'package:quant_foundation/quant_foundation.dart'
    hide requireHttpsBaseUrl;

import '../config/app_config.dart';
import 'auth_exceptions.dart';

/// Orchestrates QuantChat authentication via the QuantMail SSO: password
/// login (+ TOTP 2FA), the OAuth2 + PKCE upgrade to long-lived tokens, silent
/// refresh with rotation, and sign-out.
///
/// Constructed from foundation primitives plus deployment config; exposed to
/// the app through Riverpod providers (W4, `src/providers/`). The injected
/// dependencies ([authApi], [tokenManager]) are owned by the caller — this
/// repository never disposes them.
class AuthRepository {
  /// Default custom-scheme redirect URI registered for the QuantChat Flutter
  /// client. Must be byte-identical between `GET /oauth/authorize` and
  /// `POST /oauth/token` — the SSO backend enforces redirect_uri rebinding.
  static const String defaultRedirectUri = 'quantchat://oauth/callback';

  /// OAuth2 PKCE transport (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`),
  /// pointed at the QuantMail SSO server.
  final AuthApi authApi;

  /// Secure token store + in-memory cache + auth-state broadcast.
  final TokenManager tokenManager;

  /// QuantMail SSO base URL, e.g. `https://sso.quantrinity.in`. Both the
  /// bare login Dio and [authApi] resolve against this host.
  final String ssoBaseUrl;

  /// QuantChat Fastify backend base URL (chat API). Stored for the future
  /// chat API client; the auth flow itself never calls it.
  final String apiBaseUrl;

  /// Value sent as the `Origin` header on the public `/auth/*` calls. Must
  /// be allowlisted SSO-side, otherwise the server answers 403
  /// UNTRUSTED_ORIGIN.
  final String webOrigin;

  /// Public OAuth2 client id of the QuantChat Flutter client. Empty until
  /// provisioned.
  // TODO(UNVERIFIED): confirm the quantchat-flutter client registration
  // (mirrors QuantMail's U1).
  final String oauthClientId;

  /// Redirect URI used for the PKCE flow. Defaults to [defaultRedirectUri].
  final String redirectUri;

  /// Bare Dio for the public `/auth/*` bootstrap calls (no auth/refresh
  /// interceptors): those endpoints carry no Bearer token and must never
  /// enter the 401-refresh loop. Also drives `GET /oauth/authorize` (its
  /// 302/200 responses are inspected manually, not followed).
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
    required this.ssoBaseUrl,
    required this.apiBaseUrl,
    required this.webOrigin,
    required this.oauthClientId,
    this.redirectUri = defaultRedirectUri,
    Duration timeout = const Duration(seconds: 30),
    Dio? loginDio,
  }) : _loginDio = loginDio ??
            _buildLoginDio(
              ssoBaseUrl: ssoBaseUrl,
              webOrigin: webOrigin,
              timeout: timeout,
            );

  /// Builds the bare login Dio for the SSO bootstrap transport.
  ///
  /// SECURITY (Q4 remainder — zero-defect 2026-10-03): [requireHttpsBaseUrl]
  /// is release-safe — the `AppConfig` constructor asserts are stripped in
  /// release builds, so the guard lives here, on the transport-construction
  /// path. It throws [ArgumentError] in ALL build modes before any
  /// credential (password, refresh token) touches the wire. An injected
  /// [loginDio] test double bypasses the guard (it is not a real transport).
  static Dio _buildLoginDio({
    required String ssoBaseUrl,
    required String webOrigin,
    required Duration timeout,
  }) {
    requireHttpsBaseUrl(ssoBaseUrl);
    return Dio(
      BaseOptions(
        // Both the /auth/* bootstrap and /oauth/authorize run
        // against the QuantMail SSO server.
        baseUrl: ssoBaseUrl.replaceAll(RegExp(r'/+$'), ''),
        connectTimeout: timeout,
        receiveTimeout: timeout,
        sendTimeout: timeout,
        contentType: Headers.jsonContentType,
        // The SSO backend requires an allowlisted Origin header on
        // /auth/login and /auth/2fa/verify.
        headers: <String, dynamic>{'Origin': webOrigin},
      ),
    );
  }

  /// The in-flight PKCE authorization request (non-null while a browser
  /// consent round-trip is outstanding).
  AuthorizeRequest? get pendingAuthorizeRequest => _pendingAuthorizeRequest;

  /// Signs in with email + password against the QuantMail SSO
  /// (`POST /auth/login`).
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

  /// Completes the TOTP second factor on the QuantMail SSO
  /// (`POST /auth/2fa/verify`).
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
  /// pair (PKCE), against the QuantMail SSO.
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
    // The SSO's /oauth/authorize demands a pre-existing Bearer access token
    // — the password login step must come first.
    final accessToken = await tokenManager.getValidToken();
    if (accessToken == null || accessToken.isEmpty) {
      throw const AuthException(
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
  /// `grant_type=refresh_token`) against the QuantMail SSO.
  ///
  /// The backend ROTATES the pair: both returned tokens are stored and the
  /// old refresh token is discarded. On `invalid_grant` (revoked / reused —
  /// family revocation) the local tokens are cleared and
  /// [AuthSignedOutException] is thrown so the UI routes back to login.
  ///
  /// Refresh payload is snake_case JSON
  /// (`{"grant_type":"refresh_token","refresh_token":"…"}`), as verified by
  /// backend-prep — the SSO token endpoint parses JSON bodies only.
  Future<void> refreshSession() async {
    await tokenManager.hydrate();
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const AuthException(
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
      // Unknown whether a quantchat-flutter client is registered yet —
      // fail loudly instead of sending an empty client_id.
      throw const AuthException(
        'OAuth client not provisioned',
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
          'Login requires 2FA but the server issued no challenge',
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
    // stays cookie-only on the web flow and arrives via the OAuth upgrade
    // on native. Passing no refresh token leaves any previously stored one
    // untouched (TokenManager semantics).
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
  /// and 2FA shapes mirror QuantMail's verified contract; error parsing here
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
      // redirect_uri must be byte-identical to the authorize-time value;
      // [redirectUri] is used for both calls.
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
        'Untrusted origin: the SSO backend rejected the configured Origin '
        'header ($webOrigin). Allowlist it server-side to use password login.',
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
      'Request failed${status != null ? ' (HTTP $status)' : ''}: '
      '${e.message ?? e.type.name}',
      code: 'network_error',
    );
  }
}
