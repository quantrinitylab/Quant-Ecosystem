// ============================================================================
// gram_core - OAuth2 PKCE auth API (QuantMail SSO)
// ============================================================================
//
// Copy-adapt of `quant_foundation`'s auth API, retargeted at the QuantGram
// SSO flow: the system browser opens the authorize URL, the custom-scheme
// redirect comes back to the app, and the code is exchanged here.
//
// Endpoint paths and wire shapes follow the verified QuantMail backend
// contract (`apps/quantmail/backend/routes/oauth.ts`; `phase0/AUTH_CONTRACT.md`):
//   - `GET  /oauth/authorize` (query params per OAuth2 + PKCE),
//   - `POST /oauth/token`     (JSON bodies ONLY — NOT form-encoded),
//   - `POST /oauth/revoke`    (JSON body `{token}`),
// with the snake_case token response (`access_token`, `token_type`,
// `expires_in`, `refresh_token`, `scope`, optional OIDC `id_token`) and
// OAuth2 error bodies (`{error, error_description}`).
// Token lifetimes (verified): access 900 s, refresh 30 days with rotation +
// family revocation on reuse.
//
// TODO(UNVERIFIED): whether the QuantGram Flutter `client_id` is required on
// the authorize endpoint (the shift-1 spec leaves this open), the registered
// QuantGram `client_id` / redirect URIs themselves, and the exact native
// bootstrap UX (system browser → web login incl. 2FA → authorize →
// custom-scheme redirect). The code below carries `clientId` through and
// always sends it on authorize (harmless if the backend ignores it).

import 'package:dio/dio.dart';

import 'pkce.dart';

/// Paths served by the backend OAuth routes (`apps/quantmail/backend/routes/oauth.ts`).
class OAuthPaths {
  /// Authorization endpoint (`GET`, query params per OAuth2 + PKCE).
  static const String authorize = '/oauth/authorize';

  /// Token endpoint (`POST`, JSON bodies only — verified, NOT form-encoded).
  static const String token = '/oauth/token';

  /// Revocation endpoint (`POST`, JSON body `{"token": …}` — verified).
  static const String revoke = '/oauth/revoke';

  const OAuthPaths._();
}

/// Token set returned by the token endpoint (snake_case wire format).
class TokenSet {
  /// The Bearer access token.
  final String accessToken;

  /// The refresh token (rotated by the backend on each refresh grant).
  final String refreshToken;

  /// Lifetime of the access token in seconds, as issued.
  final int expiresInSeconds;

  /// Token type as issued (normally `Bearer`).
  final String tokenType;

  /// Granted scopes, split from the space-joined `scope` field.
  final List<String> scope;

  /// OIDC identity token, present only when the `openid` scope was granted.
  final String? idToken;

  /// Creates a token set from discrete values.
  const TokenSet({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresInSeconds,
    required this.tokenType,
    required this.scope,
    this.idToken,
  });

  /// Parses the snake_case OAuth2 token response body.
  factory TokenSet.fromJson(Map<String, dynamic> json) {
    final scopeRaw = json['scope'];
    return TokenSet(
      accessToken: json['access_token'] as String,
      // The backend always issues a refresh token for these grants; the field
      // is required here so rotation-less surprises surface loudly.
      refreshToken: json['refresh_token'] as String,
      expiresInSeconds: (json['expires_in'] as num).toInt(),
      tokenType: (json['token_type'] as String?) ?? 'Bearer',
      scope: scopeRaw is String
          ? scopeRaw.split(' ').where((s) => s.isNotEmpty).toList()
          : const [],
      idToken: json['id_token'] as String?,
    );
  }

  /// Access-token lifetime as a [Duration].
  Duration get expiresIn => Duration(seconds: expiresInSeconds);
}

/// Typed OAuth2 error (the token endpoint returns `{error, error_description}`
/// with 4xx — NOT the `APIResponse` envelope).
class OAuthException implements Exception {
  /// OAuth2 error code, e.g. `invalid_grant`, `invalid_client`.
  final String error;

  /// Human-readable description from `error_description`, when present.
  final String? description;

  /// HTTP status of the token response, when a response was received.
  final int? statusCode;

  /// Creates an OAuth2 error.
  const OAuthException(this.error, {this.description, this.statusCode});

  @override
  String toString() =>
      'OAuthException($error${description != null ? ': $description' : ''})';
}

/// OAuth2 PKCE transport for the QuantGram SSO flow.
///
/// Uses its own bare [Dio] (no auth/refresh/retry interceptors): token calls
/// carry no Bearer header and must fail fast rather than enter the refresh
/// loop.
class GramAuthApi {
  final Dio _dio;

  /// Creates the auth API against [baseUrl]. A bare Dio with no interceptors
  /// is built unless [dio] is provided; [timeout] applies to all phases.
  GramAuthApi({
    required String baseUrl,
    Dio? dio,
    Duration timeout = const Duration(seconds: 30),
  }) : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: baseUrl.replaceAll(RegExp(r'/+$'), ''),
                connectTimeout: timeout,
                receiveTimeout: timeout,
                sendTimeout: timeout,
                // VERIFIED (`phase0/AUTH_CONTRACT.md`): the token/revoke
                // endpoints parse JSON bodies ONLY — no form-urlencoded
                // parser is registered server-side. This deviates from
                // RFC 6749 §4.1.3; do not "fix" it to form-encoding.
                contentType: Headers.jsonContentType,
              ),
            );

  /// Builds the authorization URL for the PKCE flow.
  ///
  /// `response_type=code`, `code_challenge_method` fixed to `S256`,
  /// space-joined `scope`. The caller supplies the [PkcePair] (so the
  /// verifier can be kept alongside the `state` for the callback) and the
  /// `state` to verify on redirect (CSRF protection).
  ///
  /// TODO(UNVERIFIED): whether `client_id` is required on this endpoint for
  /// the QuantGram client (kept as a parameter and always sent; harmless if
  /// ignored), and the exact native bootstrap UX.
  Uri buildAuthorizeUrl({
    required String clientId,
    required String redirectUri,
    required PkcePair pkce,
    List<String> scopes = const ['openid', 'profile', 'email'],
    String? state,
    String? nonce,
  }) {
    final params = <String, String>{
      'client_id': clientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': scopes.join(' '),
      'state': state ?? generateOAuthState(),
      'code_challenge': pkce.challenge,
      'code_challenge_method': 'S256',
      if (nonce != null) 'nonce': nonce,
    };
    return Uri.parse(
      '${_dio.options.baseUrl}${OAuthPaths.authorize}'
      '?${Uri(queryParameters: params).query}',
    );
  }

  /// Exchanges an authorization `code` for tokens (PKCE verifier required).
  ///
  /// Backend contract (`POST /oauth/token`, verified `phase0/AUTH_CONTRACT.md`
  /// §1.4): JSON body with `grant_type=authorization_code`, `code`,
  /// `client_id`, `code_verifier`, and `redirect_uri` (must be BYTE-IDENTICAL
  /// to the authorize-time value — rebinding is enforced). Public clients
  /// send no `client_secret`. Throws [OAuthException] on `invalid_grant` /
  /// `invalid_client` / etc.
  ///
  /// NOTE: the shift-1 task shorthand listed the exchange body without
  /// `client_id`; it is retained here per the VERIFIED backend contract
  /// (the server checks client binding before PKCE — omitting it would be a
  /// real `invalid_client` bug, while sending it is harmless if ignored).
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
  /// Backend contract (`POST /oauth/token`, VERIFIED board note from
  /// backend-prep): JSON body with EXACTLY two snake_case fields —
  /// `{"grant_type": "refresh_token", "refresh_token": "<stored>"}` —
  /// and NO `client_id`.
  /// The backend ROTATES: the presented token is revoked (compare-and-set)
  /// and a new pair is minted — store BOTH returned tokens and discard the
  /// old refresh token. Reuse of a superseded token revokes the whole family
  /// (theft detection) → `400 invalid_grant`, which callers must treat as
  /// "signed out".
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
        OAuthPaths.revoke,
        data: {'token': token},
      );
    } on DioException catch (e) {
      throw _toOAuthException(e);
    }
  }

  // -- Internals ---------------------------------------------------------------

  Future<Map<String, dynamic>> _postToken(Map<String, String> jsonBody) async {
    try {
      final response = await _dio.post<dynamic>(
        OAuthPaths.token,
        // JSON, not form-encoded — verified. The `contentType` default from
        // BaseOptions already applies; stated explicitly for clarity.
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
