// ============================================================================
// quant_wave_core - AuthApi tests (W3, shift 1)
// ============================================================================
//
// Covers: PKCE helpers (verifier charset/length/clamp, S256 challenge against
// the RFC 7636 Appendix B vector), the S4 https guard on the constructor,
// the authorize-URL S256 wiring, and — the critical contract — that the
// refresh grant sends EXACTLY `{"grant_type":"refresh_token",
// "refresh_token":"…"}` as JSON (snake_case, no client_id; the camelCase
// `{'refreshToken': …}` payload was the rejected cookie flow).

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:quant_wave_core/src/auth/auth_api.dart';

/// Builds a Dio whose interceptors short-circuit every request through
/// [onRequest] instead of hitting the network.
Dio _fakeDio(
  void Function(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) onRequest,
) {
  final Dio dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));
  dio.interceptors.add(
    InterceptorsWrapper(onRequest: onRequest),
  );
  return dio;
}

Map<String, dynamic> _tokenResponse() => <String, dynamic>{
      'access_token': 'at-new',
      'token_type': 'Bearer',
      'expires_in': 900,
      'refresh_token': 'rt-new',
      'scope': 'openid profile email',
    };

void main() {
  group('PKCE helpers', () {
    test('verifier defaults to 64 chars of unpadded base64url', () {
      final String verifier = AuthApi.generateCodeVerifier();
      expect(verifier.length, 64);
      expect(verifier.length, inInclusiveRange(43, 128));
      expect(verifier, isNot(contains('=')));
      expect(verifier, matches(RegExp(r'^[A-Za-z0-9\-_]+$')));
    });

    test('verifier length is clamped to the 43..128 RFC range', () {
      expect(AuthApi.generateCodeVerifier(10).length, 43);
      expect(AuthApi.generateCodeVerifier(200).length, 128);
    });

    test('verifiers are cryptographically unique', () {
      expect(
        AuthApi.generateCodeVerifier(),
        isNot(AuthApi.generateCodeVerifier()),
      );
    });

    test(
        'S256 challenge matches an independently computed vector', () {
      // Verifier is the RFC 7636 Appendix B example; the expected challenge
      // below was computed independently (Python hashlib) — my first attempt
      // quoted the RFC challenge from memory with a dropped trailing char,
      // which this cross-check caught.
      const String verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      expect(
        AuthApi.codeChallengeS256(verifier),
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      );
    });

    test('challenge is unpadded base64url', () {
      final String challenge =
          AuthApi.codeChallengeS256(AuthApi.generateCodeVerifier());
      expect(challenge, isNot(contains('=')));
      expect(challenge, matches(RegExp(r'^[A-Za-z0-9\-_]+$')));
    });
  });

  group('AuthApi construction', () {
    test('rejects plaintext http base URLs (S4)', () {
      expect(
        () => AuthApi(baseUrl: 'http://api.example.com'),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('accepts https and http-loopback base URLs', () {
      expect(
        () => AuthApi(baseUrl: 'https://api.example.com'),
        returnsNormally,
      );
      expect(
        () => AuthApi(baseUrl: 'http://localhost:3000'),
        returnsNormally,
      );
    });
  });

  group('buildAuthorizeUrl', () {
    test('wires S256 PKCE consistently', () {
      final AuthApi api = AuthApi(baseUrl: 'https://api.example.com');
      final AuthorizeRequest request = api.buildAuthorizeUrl(
        clientId: 'client_123',
        redirectUri: 'quantwave://oauth/callback',
      );
      final Map<String, String> params = request.url.queryParameters;
      expect(params['code_challenge_method'], 'S256');
      expect(
        params['code_challenge'],
        AuthApi.codeChallengeS256(request.codeVerifier),
      );
      expect(params['response_type'], 'code');
      expect(params['client_id'], 'client_123');
      expect(params['redirect_uri'], 'quantwave://oauth/callback');
      expect(request.state, isNotEmpty);
    });
  });

  group('refreshToken contract (board-verified)', () {
    test('sends EXACTLY the snake_case JSON body, no client_id', () async {
      final List<Map<String, dynamic>> captured = <Map<String, dynamic>>[];
      final Dio dio = _fakeDio((options, handler) {
        captured.add(<String, dynamic>{
          'path': options.path,
          'data': options.data,
          'contentType': options.contentType,
        });
        handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: _tokenResponse(),
          ),
        );
      });

      final AuthApi api =
          AuthApi(baseUrl: 'https://api.example.com', dio: dio);
      final TokenSet tokens = await api.refreshToken('rt-old');

      expect(captured, hasLength(1));
      expect(captured.single['path'], '/oauth/token');
      // EXACT contract: {"grant_type":"refresh_token","refresh_token":"…"}
      expect(
        captured.single['data'],
        equals(
          <String, String>{
            'grant_type': 'refresh_token',
            'refresh_token': 'rt-old',
          },
        ),
      );
      final Map<dynamic, dynamic> body =
          captured.single['data'] as Map<dynamic, dynamic>;
      expect(body.containsKey('client_id'), isFalse);
      expect(body.containsKey('refreshToken'), isFalse);
      // JSON, not form-encoded (verified F3).
      expect(
        captured.single['contentType'] as String?,
        contains('application/json'),
      );

      expect(tokens.accessToken, 'at-new');
      expect(tokens.refreshToken, 'rt-new');
      expect(tokens.expiresIn, const Duration(seconds: 900));
      expect(tokens.tokenType, 'Bearer');
      expect(tokens.scope, <String>['openid', 'profile', 'email']);
    });

    test('maps 400 invalid_grant to OAuthException (sign-out signal)', () {
      final Dio dio = _fakeDio((options, handler) {
        handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.badResponse,
            response: Response<dynamic>(
              requestOptions: options,
              statusCode: 400,
              data: <String, dynamic>{
                'error': 'invalid_grant',
                'error_description': 'Refresh token revoked',
              },
            ),
          ),
        );
      });
      final AuthApi api =
          AuthApi(baseUrl: 'https://api.example.com', dio: dio);

      expect(
        api.refreshToken('rt-dead'),
        throwsA(
          isA<OAuthException>()
              .having((e) => e.error, 'error', 'invalid_grant')
              .having((e) => e.statusCode, 'statusCode', 400),
        ),
      );
    });
  });

  group('TokenSet.fromJson', () {
    test('parses the snake_case token response', () {
      final TokenSet tokens = TokenSet.fromJson(_tokenResponse());
      expect(tokens.accessToken, 'at-new');
      expect(tokens.refreshToken, 'rt-new');
      expect(tokens.expiresInSeconds, 900);
      expect(tokens.tokenType, 'Bearer');
      expect(tokens.scope, <String>['openid', 'profile', 'email']);
      expect(tokens.idToken, isNull);
    });
  });
}
