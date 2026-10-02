// ============================================================================
// quantmax_core - QuantMax OAuth2 PKCE auth API (QuantMail SSO)
// ============================================================================
//
// Client-side helpers for the OAuth2 Authorization Code + PKCE flow against
// the QuantMail backend — QuantMax authenticates via QuantMail SSO (D1:
// the EXISTING contract, no new endpoints).
//
// Endpoint paths and wire shapes verified (`phase0/AUTH_CONTRACT.md`,
// workstream C):
//   - `GET  /oauth/authorize` (requires a pre-existing Bearer access token
//     on the direct-call path — F1; the browser-SSO variant is
//     TODO(UNVERIFIED), see [QuantMaxAuthRepository.beginBrowserSignIn]),
//   - `POST /oauth/token`     (JSON bodies ONLY — F3, not form-encoded),
//   - `POST /oauth/revoke`    (JSON body `{token}`, RFC 7009: always 200),
// with the snake_case token response (`access_token`, `token_type`,
// `expires_in`, `refresh_token`, `scope`, optional OIDC `id_token`) and
// OAuth2 error bodies (`{error, error_description}`).
// Token lifetimes (verified): access 900 s, refresh 30 days with rotation +
// family revocation on reuse.
//
// Difference vs the foundation `AuthApi`: endpoint PATHS are configurable
// here and come from [AppConfig] (W1: `oauthAuthorizePath`, `oauthTokenPath`,
// `oauthRevokePath`) instead of being constants. The PKCE math, [TokenSet]
// parsing and [OAuthException] shape are reused from the foundation — this
// transport adds no new wire behavior.
//
// Security:
//   - S3: the token transport NEVER follows redirects (`followRedirects:
//     false` in [BaseOptions]) — a 302 to another host must not replay the
//     refresh-token body elsewhere.
//   - S4: non-`https` base URLs are rejected (mirrors the AppConfig assert;
//     the API client enforces the same guard on its own Dio).

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart'
    show AuthApi, AuthorizeRequest, OAuthException, TokenSet;

/// OAuth2 PKCE transport for QuantMax (QuantMail SSO).
///
/// Uses its own bare [Dio] (no auth/refresh/retry interceptors): token calls
/// carry no Bearer header and must fail fast rather than enter the refresh
/// loop. Endpoint paths are taken from the app config so the contract stays
/// in one place ([AppConfig]) instead of being hard-coded here.
class QuantMaxAuthApi {
  final Dio _dio;

  /// Authorization endpoint path, resolved against the base URL.
  /// Verified `phase0/AUTH_CONTRACT.md` §1.2; from [AppConfig.oauthAuthorizePath].
  final String authorizePath;

  /// Token endpoint path, resolved against the base URL.
  /// Verified `phase0/AUTH_CONTRACT.md` §1.4 (JSON bodies only); from
  /// [AppConfig.oauthTokenPath].
  final String tokenPath;

  /// Revocation endpoint path, resolved against the base URL.
  /// Verified (RFC 7009, always 200); from [AppConfig.oauthRevokePath].
  ///
  /// TODO(UNVERIFIED): [AppConfig] (W1) currently exposes
  /// `oauthAuthorizePath`/`oauthTokenPath` per the phase1 pattern; confirm
  /// `oauthRevokePath` exists there too, otherwise pass `/oauth/revoke`
  /// explicitly.
  final String revokePath;

  /// Creates the auth API against [baseUrl].
  ///
  /// A bare Dio with no interceptors is built unless [dio] is provided;
  /// [timeout] applies to all phases.
  QuantMaxAuthApi({
    required String baseUrl,
    this.authorizePath = '/oauth/authorize',
    this.tokenPath = '/oauth/token',
    this.revokePath = '/oauth/revoke',
    Dio? dio,
    Duration timeout = const Duration(seconds: 30),
  }) : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _normalizeBaseUrl(baseUrl),
                connectTimeout: timeout,
                receiveTimeout: timeout,
                sendTimeout: timeout,
                // VERIFIED (workstream C, F3): the token/revoke endpoints
                // parse JSON bodies ONLY — no form-urlencoded parser is
                // registered server-side. Do not "fix" to form-encoding.
                contentType: Headers.jsonContentType,
                // S3: never follow redirects on the token transport. A 302
                // to another host must not replay the refresh-token body
                // (and must not attach a Bearer header) elsewhere.
                followRedirects: false,
              ),
            );

  /// Builds the authorization URL for the PKCE flow.
  ///
  /// `response_type=code`, `code_challenge_method` fixed to `S256`,
  /// space-joined `scope`. The returned [AuthorizeRequest.url] is opened in
  /// the system browser (see `BrowserAuthLauncher`); keep
  /// [AuthorizeRequest.codeVerifier] for the exchange and verify
  /// [AuthorizeRequest.state] on the callback.
  ///
  /// ⚠️ VERIFIED (workstream C, F1): the direct-call authorize endpoint
  /// requires a pre-existing `Authorization: Bearer` access token. The
  /// browser-SSO variant (web session cookie instead of Bearer) is
  /// TODO(UNVERIFIED) — see [QuantMaxAuthRepository.beginBrowserSignIn].
  AuthorizeRequest buildAuthorizeUrl({
    required String clientId,
    required String redirectUri,
    List<String> scopes = const ['openid', 'profile', 'email'],
    String? state,
    String? nonce,
  }) {
    // PKCE math reused from the foundation (mirrors
    // packages/auth/src/crypto/pkce.ts): cryptographically random verifier,
    // S256 challenge, random state.
    final codeVerifier = AuthApi.generateCodeVerifier();
    final codeChallenge = AuthApi.codeChallengeS256(codeVerifier);
    final resolvedState = state ?? _randomState();

    final params = <String, String>{
      'client_id': clientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': scopes.join(' '),
      'state': resolvedState,
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
      if (nonce != null) 'nonce': nonce,
    };

    final url = Uri.parse(
        '${_dio.options.baseUrl}$authorizePath?${Uri(queryParameters: params).query}');
    return AuthorizeRequest(
        url: url, codeVerifier: codeVerifier, state: resolvedState);
  }

  /// Exchanges an authorization `code` for tokens (PKCE verifier required).
  ///
  /// Backend contract (`POST /oauth/token`, VERIFIED workstream C §1.4):
  /// JSON body with `grant_type=authorization_code`, `code`, `client_id`,
  /// `code_verifier`, and `redirect_uri` (must be BYTE-IDENTICAL to the
  /// authorize-time value — rebinding is enforced). Public clients
  /// (`is_confidential: false`) send no `client_secret`. Throws
  /// [OAuthException] on `invalid_grant` / `invalid_client` / etc.
  Future<TokenSet> exchangeCode({
    required String code,
    required String codeVerifier,
    required String clientId,
    required String redirectUri,
  }) async {
    final body = await _postToken({
      'grant_type': 'authorization_code',
      'code': code,
      'client_id': clientId,
      'code_verifier': codeVerifier,
      'redirect_uri': redirectUri,
    });
    return TokenSet.fromJson(body);
  }

  /// Refreshes a token pair using a refresh token.
  ///
  /// Backend contract (`POST /oauth/token`, VERIFIED workstream C §1.4):
  /// JSON body `{"grant_type": "refresh_token", "refresh_token": "<stored>"}`
  /// → snake_case [TokenSet]. The backend ROTATES: the presented token is
  /// revoked (compare-and-set) and a new pair is minted — store BOTH returned
  /// tokens and discard the old refresh token. Reuse of a superseded token
  /// revokes the whole family (theft detection) → `400 invalid_grant`,
  /// which callers must treat as "signed out".
  ///
  /// Note (F4): the refresh-grant response carries `"scope": ""` — retain the
  /// originally granted scopes client-side instead of overwriting.
  Future<TokenSet> refreshToken(String refreshToken) async {
    final body = await _postToken({
      'grant_type': 'refresh_token',
      'refresh_token': refreshToken,
    });
    return TokenSet.fromJson(body);
  }

  /// Revokes a token (`POST /oauth/revoke`, JSON body `{token}` — verified).
  ///
  /// Per RFC 7009 the endpoint always answers `200 {"success": true}`, even
  /// for unknown tokens.
  Future<void> revokeToken(String token) async {
    try {
      await _dio.post<dynamic>(
        revokePath,
        data: {'token': token},
      );
    } on DioException catch (e) {
      throw _toOAuthException(e);
    }
  }

  // -- Internals ---------------------------------------------------------------

  static String _randomState() {
    // Reuse the foundation's verifier generator for state entropy (64
    // base64url chars — more than enough for a CSRF token).
    return AuthApi.generateCodeVerifier();
  }

  /// Strips trailing slashes and rejects non-`https` base URLs (S4).
  static String _normalizeBaseUrl(String baseUrl) {
    final trimmed = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    if (uri == null || uri.scheme != 'https') {
      throw ArgumentError.value(
        baseUrl,
        'baseUrl',
        'must be an https:// URL (S4: http:// is rejected to prevent '
        'token leakage over cleartext)',
      );
    }
    return trimmed;
  }

  Future<Map<String, dynamic>> _postToken(Map<String, String> jsonBody) async {
    try {
      final response = await _dio.post<dynamic>(
        tokenPath,
        // JSON, not form-encoded — verified (F3).
        data: jsonBody,
        options: Options(contentType: Headers.jsonContentType),
      );
      final data = response.data;
      if (data is Map<String, dynamic>) return data;
      throw const OAuthException('invalid_response',
          description: 'Unexpected token endpoint response shape');
    } on DioException catch (e) {
      throw _toOAuthException(e);
    }
  }

  OAuthException _toOAuthException(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic> && data['error'] is String) {
      return OAuthException(
        data['error'] as String,
        description: data['error_description'] as String?,
        statusCode: e.response?.statusCode,
      );
    }
    return OAuthException(
      'network_error',
      description: e.message ?? 'Token request failed',
      statusCode: e.response?.statusCode,
    );
  }
}
