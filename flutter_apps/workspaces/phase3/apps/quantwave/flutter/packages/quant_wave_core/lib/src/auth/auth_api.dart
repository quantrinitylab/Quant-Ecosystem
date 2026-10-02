// ============================================================================
// quant_wave_core - OAuth2 PKCE auth API
// ============================================================================
//
// Client-side helpers for the OAuth2 Authorization Code + PKCE flow against
// the Quant backend (QuantMail SSO — mission D1: the existing OAuth2+PKCE
// flow is reused, no new auth endpoints).
//
// Endpoint paths and wire shapes verified against the deployed backend
// (`apps/quantmail/backend/routes/oauth.ts`; see also `phase0/AUTH_CONTRACT.md`):
//   - `GET  /oauth/authorize` (requires a Bearer access token — F1),
//   - `POST /oauth/token`     (JSON bodies ONLY — F3),
//   - `POST /oauth/revoke`    (JSON body `{token}`),
//   with the snake_case token response (`access_token`, `token_type`,
//   `expires_in`, `refresh_token`, `scope`, optional OIDC `id_token`) and
//   OAuth2 error bodies (`{error, error_description}`).
// Token lifetimes (verified): access 900 s, refresh 30 days with rotation +
// family revocation on reuse.
//
// CRITICAL (board-verified contract): native refresh is
// `POST /oauth/token` JSON `{"grant_type":"refresh_token",
// "refresh_token":"…"}` → snake_case response. The camelCase
// `{'refreshToken': …}` payload was the rejected cookie flow — never use it.
//
// TODO(UNVERIFIED): the native bootstrap UX (system browser → web login →
// authorize → custom-scheme redirect), the registered Flutter `client_id` /
// redirect URIs, and production issuer/env values (U1–U4).

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

import 'package:quant_wave_core/src/config/app_config.dart';

/// Paths served by the backend OAuth routes (`apps/quantmail/backend/routes/oauth.ts`).
///
/// TODO(UNVERIFIED): confirm the native client uses these API-host paths and
/// not the SDK's `https://auth.quant.app/oauth2/*` variants.
class OAuthPaths {
  /// Authorization endpoint (`GET`, query params per OAuth2 + PKCE).
  static const String authorize = '/oauth/authorize';

  /// Token endpoint (`POST`, JSON bodies only — verified F3, NOT form-encoded).
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

/// Prepared authorization request: open [url] in the system browser and keep
/// [codeVerifier] to exchange the returned `code`.
class AuthorizeRequest {
  /// The authorization URL to open (PKCE `code_challenge` included).
  final Uri url;

  /// The PKCE verifier to present at the code exchange. Keep secret.
  final String codeVerifier;

  /// The `state` echoed back on the redirect; verify it to prevent CSRF.
  final String state;

  /// Creates a prepared authorization request.
  const AuthorizeRequest({
    required this.url,
    required this.codeVerifier,
    required this.state,
  });
}

/// OAuth2 PKCE flow against the Quant backend (QuantMail SSO).
///
/// Uses its own bare [Dio] (no auth/refresh/retry interceptors): token calls
/// carry no Bearer header and must fail fast rather than enter the refresh
/// loop. Timeouts mirror [QuantApiClient]'s default (30s).
class AuthApi {
  final Dio _dio;

  /// Creates the auth API against [baseUrl]. A bare Dio with no interceptors
  /// is built unless [dio] is provided; [timeout] applies to all phases.
  ///
  /// Throws [ArgumentError] when [baseUrl] is not HTTPS (S4) — tokens must
  /// never travel over plaintext HTTP.
  AuthApi({required String baseUrl, Dio? dio, Duration timeout = const Duration(seconds: 30)})
      : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: baseUrl.replaceAll(RegExp(r'/+$'), ''),
                connectTimeout: timeout,
                receiveTimeout: timeout,
                sendTimeout: timeout,
                // VERIFIED (F3): the token/revoke endpoints parse
                // JSON bodies ONLY — no form-urlencoded parser is registered
                // server-side. This deviates from RFC 6749 §4.1.3; do not
                // "fix" it to form-encoding.
                contentType: Headers.jsonContentType,
                // S3 (same posture as QuantApiClient): the refresh body
                // carries the refresh token — never let Dio auto-follow a
                // redirect with it. The verified contract answers 200 JSON,
                // so no legitimate redirect exists here.
                followRedirects: false,
              ),
            ) {
    checkHttpsBaseUrl(baseUrl);
  }

  /// Builds the authorization URL for the PKCE flow.
  ///
  /// Endpoint path verified against the backend routes
  /// (`apps/quantmail/backend/routes/oauth.ts` → `GET /oauth/authorize`):
  /// `response_type=code`, `code_challenge_method` fixed to `S256`,
  /// space-joined `scope`.
  ///
  /// ⚠️ VERIFIED (F1): this endpoint requires a pre-existing
  /// `Authorization: Bearer` access token — there is no self-contained login
  /// page inside the OAuth flow. The native bootstrap (system browser → web
  /// login incl. 2FA → authorize-with-Bearer → custom-scheme redirect) is a
  /// Phase-1 design item, not a backend gap.
  ///
  /// TODO(UNVERIFIED): the exact bootstrap UX and the registered Flutter
  /// `client_id` / redirect URIs (U1–U4).
  AuthorizeRequest buildAuthorizeUrl({
    required String clientId,
    required String redirectUri,
    List<String> scopes = const ['openid', 'profile', 'email'],
    String? state,
    String? nonce,
  }) {
    final codeVerifier = generateCodeVerifier();
    final codeChallenge = codeChallengeS256(codeVerifier);
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

    // API-host path verified (V1). The Sign-in-with-Quant SDK's
    // `https://auth.quant.app/oauth2/authorize` is a different surface for
    // external apps; first-party Flutter uses the API host's `/oauth/*`.
    final url = Uri.parse(
        '${_dio.options.baseUrl}${OAuthPaths.authorize}?${Uri(queryParameters: params).query}');
    return AuthorizeRequest(
        url: url, codeVerifier: codeVerifier, state: resolvedState);
  }

  /// Exchanges an authorization `code` for tokens (PKCE verifier required).
  ///
  /// Backend contract (`POST /oauth/token`, VERIFIED §1.4):
  /// JSON body with `grant_type=authorization_code`, `code`, `client_id`,
  /// `code_verifier`, and `redirect_uri` (must be BYTE-IDENTICAL to the
  /// authorize-time value — rebinding is enforced). Public clients
  /// (`is_confidential: false`) send no `client_secret`. Throws
  /// [OAuthException] on `invalid_grant` / `invalid_client` / etc.
  ///
  /// Server-side checks in order: code validity → client_id binding →
  /// confidential-client auth (skipped for public clients) → PKCE verifier →
  /// redirect_uri rebinding → single-use atomic consume.
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
  /// Backend contract (`POST /oauth/token`, VERIFIED §1.4, board-confirmed):
  /// JSON body `{"grant_type": "refresh_token", "refresh_token": "<stored>"}`
  /// → snake_case response. The backend ROTATES: the presented token is
  /// revoked (compare-and-set) and a new pair is minted — store BOTH returned
  /// tokens and discard the old refresh token. Reuse of a superseded token
  /// revokes the whole family (theft detection) → `400 invalid_grant`, which
  /// callers must treat as "signed out".
  ///
  /// Do NOT use the camelCase `{'refreshToken': …}` payload — that was the
  /// rejected cookie flow.
  ///
  /// Note (F4): the refresh-grant response carries `"scope": ""` — retain the
  /// originally granted scopes client-side instead of overwriting.
  ///
  /// This is the transport [RefreshInterceptor] uses for its 401 refresh
  /// flow (via its own [AuthApi] instance, or a custom delegate when one is
  /// supplied).
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

  // -- PKCE helpers (mirror packages/auth/src/crypto/pkce.ts) ----------------

  /// Generates a cryptographically random code verifier (43–128 chars,
  /// base64url, no padding). Mirrors the TS `generateCodeVerifier`.
  static String generateCodeVerifier([int length = 64]) {
    // num.clamp returns num: toInt() is required for List.generate/substring.
    final clamped = length.clamp(43, 128).toInt();
    final bytes = List<int>.generate(
        clamped, (_) => _secureRandom.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '').substring(0, clamped);
  }

  /// `BASE64URL-ENCODE(SHA256(verifier))` — the S256 code challenge.
  /// Mirrors the TS `generateCodeChallenge`.
  static String codeChallengeS256(String verifier) {
    final digest = sha256.convert(utf8.encode(verifier));
    return base64Url.encode(digest.bytes).replaceAll('=', '');
  }

  static final Random _secureRandom = Random.secure();

  static String _randomState() {
    final bytes =
        List<int>.generate(16, (_) => _secureRandom.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  // -- Internals ---------------------------------------------------------------

  Future<Map<String, dynamic>> _postToken(Map<String, String> jsonBody) async {
    try {
      final response = await _dio.post<dynamic>(
        OAuthPaths.token,
        // JSON, not form-encoded — verified (F3). The `contentType` default
        // from BaseOptions already applies; stated explicitly for clarity.
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
