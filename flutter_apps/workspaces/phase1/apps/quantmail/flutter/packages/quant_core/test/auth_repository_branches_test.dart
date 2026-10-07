// ============================================================================
// quant_core - unit tests: AuthRepository uncovered branches
// ============================================================================
//
// Companion to `auth_repository_test.dart` (which owns the happy paths and
// the main error shapes). This file covers the remaining branches:
//   - `signInWithPassword`: missing 2FA challenge, non-JSON body, error map
//     without a code, transport failure (`network_error`)
//   - `verifyTwoFactor`: server still gating (`2fa_incomplete`), no access
//     token issued
//   - `upgradeToOAuthTokens`: 302 without `Location`, unexpected status,
//     wrapped exchange failure (session left intact)
//   - `completeBrowserUpgrade`: no pending request, callback without a code
//     (pending request still cleared)
//   - `refreshSession`: non-`invalid_grant` OAuth error wrapped (tokens kept)
//   - `signOut`: no stored refresh token → revocation skipped
//
// Tests run against canned Dio interceptors — no network, no platform
// channels. Token storage is [InMemoryTokenStorage].

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

const _baseUrl = 'https://test.quantmail.local';
const _origin = 'https://test.quantmail.local';
const _clientId = 'client_test_123';

TokenManager _branchTokenManager() =>
    TokenManager(storage: InMemoryTokenStorage());

Dio _branchDio() => Dio(BaseOptions(baseUrl: _baseUrl));

AuthRepository _branchRepository({
  required Dio loginDio,
  required Dio tokenDio,
  TokenManager? tokenManager,
  String oauthClientId = _clientId,
}) =>
    AuthRepository(
      authApi: AuthApi(baseUrl: _baseUrl, dio: tokenDio),
      tokenManager: tokenManager ?? _branchTokenManager(),
      apiBaseUrl: _baseUrl,
      webOrigin: _origin,
      oauthClientId: oauthClientId,
      loginDio: loginDio,
    );

Map<String, dynamic> _branchTokenJson({
  String access = 'oauth-access',
  String refresh = 'oauth-refresh',
}) =>
    <String, dynamic>{
      'access_token': access,
      'token_type': 'Bearer',
      'expires_in': 900,
      'refresh_token': refresh,
      'scope': 'openid profile email',
    };

void _branchReject(
  RequestInterceptorHandler handler,
  RequestOptions options, {
  required int status,
  required Object data,
}) {
  handler.reject(
    DioException(
      requestOptions: options,
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: options,
        statusCode: status,
        data: data,
      ),
    ),
  );
}

/// Rejects with a transport-level failure (no HTTP response at all).
void _branchRejectTransport(
  RequestInterceptorHandler handler,
  RequestOptions options,
) {
  handler.reject(
    DioException(
      requestOptions: options,
      type: DioExceptionType.connectionTimeout,
    ),
  );
}

/// Builds a repository whose authorize call answers 200 (HTML consent
/// screen) and returns it together with the pending [AuthorizeRequest].
Future<
    ({
      AuthRepository repo,
      TokenManager tokenManager,
      AuthorizeRequest pending
    })> _branchConsentSetup() async {
  final tokenManager = _branchTokenManager();
  addTearDown(tokenManager.dispose);
  await tokenManager.setTokens('login-access');

  final loginDio = _branchDio();
  loginDio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: '<html>consent screen</html>',
        ));
      },
    ),
  );

  final tokenDio = _branchDio();
  tokenDio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: _branchTokenJson(),
        ));
      },
    ),
  );

  final repo = _branchRepository(
    loginDio: loginDio,
    tokenDio: tokenDio,
    tokenManager: tokenManager,
  );

  await expectLater(
    repo.upgradeToOAuthTokens(),
    throwsA(isA<ConsentRequiredException>()),
  );
  final pending = repo.pendingAuthorizeRequest;
  expect(pending, isNotNull);
  return (repo: repo, tokenManager: tokenManager, pending: pending!);
}

Dio _loginDioResolving(Object data, {int status = 200}) {
  final dio = _branchDio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: status,
          data: data,
        ));
      },
    ),
  );
  return dio;
}

void main() {
  group('signInWithPassword (branch coverage)', () {
    test('missing_challenge when the 2FA flag carries no challenge', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _loginDioResolving(<String, dynamic>{
          'twoFactorRequired': true,
        }),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'pw'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'missing_challenge')),
      );
    });

    test('missing_challenge when the challenge is an empty string', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _loginDioResolving(<String, dynamic>{
          'twoFactorRequired': true,
          'challenge': '',
        }),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'pw'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'missing_challenge')),
      );
    });

    test('invalid_response when the login body is not JSON', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _loginDioResolving('plain-text, not JSON'),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'pw'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'invalid_response')),
      );
    });

    test('falls back to the login-failure parser for a map without an error code',
        () async {
      final loginDio = _branchDio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _branchReject(handler, options, status: 401, data: {
              'success': false,
              'message': 'nope',
            });
          },
        ),
      );

      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: loginDio,
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      final error = await repo
          .signInWithPassword(email: 'a@b.c', password: 'pw')
          .then<Object>((_) => fail('expected AuthException'),
              onError: (Object e) => e);

      expect(error, isA<AuthException>());
      final authError = error as AuthException;
      expect(authError.message, 'nope');
      expect(authError.code, isNull);
    });

    test('maps a transport failure to network_error', () async {
      final loginDio = _branchDio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _branchRejectTransport(handler, options);
          },
        ),
      );

      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: loginDio,
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'pw'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'network_error')
            .having((e) => e.message, 'message', startsWith('Request failed'))),
      );
    });
  });

  group('verifyTwoFactor (branch coverage)', () {
    test('2fa_incomplete when the server still gates after verification',
        () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _loginDioResolving(<String, dynamic>{
          'twoFactorRequired': true,
          'challenge': 'ch_1',
        }),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.verifyTwoFactor(challenge: 'ch_1', code: '123456'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', '2fa_incomplete')),
      );
      expect(tokenManager.getAccessToken(), isNull);
    });

    test('maps a wrong-code body through the login-failure parser', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _loginDioResolving(<String, dynamic>{
          'success': false,
          'error': 'invalid_totp',
          'message': 'Wrong code',
        }),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.verifyTwoFactor(challenge: 'ch_1', code: '000000'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'invalid_totp')
            .having((e) => e.message, 'message', 'Wrong code')),
      );
    });
  });

  group('upgradeToOAuthTokens (branch coverage)', () {
    test('missing_location on a 302 without a Location header', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('login-access');

      final loginDio = _branchDio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 302,
              data: '',
            ));
          },
        ),
      );

      final repo = _branchRepository(
        loginDio: loginDio,
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.upgradeToOAuthTokens(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'missing_location')),
      );
      expect(repo.pendingAuthorizeRequest, isNull);
    });

    test('authorize_failed on an unexpected status', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('login-access');

      final repo = _branchRepository(
        loginDio: _loginDioResolving('boom', status: 500),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.upgradeToOAuthTokens(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'authorize_failed')
            .having((e) => e.message, 'message', contains('HTTP 500'))),
      );
    });

    test('a failed code exchange is wrapped and leaves the session intact',
        () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('login-access');

      final loginDio = _branchDio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final state = options.uri.queryParameters['state'];
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 302,
              headers: Headers.fromMap({
                'location': [
                  'quantmail://oauth/callback?code=ac_bad&state=$state',
                ],
              }),
              data: '',
            ));
          },
        ),
      );

      final tokenDio = _branchDio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _branchReject(handler, options, status: 400, data: {
              'error': 'invalid_grant',
              'error_description': 'bad code',
            });
          },
        ),
      );

      final repo = _branchRepository(
        loginDio: loginDio,
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.upgradeToOAuthTokens(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'invalid_grant')
            .having(
                (e) => e.message, 'message', contains('Authorization code exchange'))),
      );
      // Unlike refreshSession's invalid_grant, a failed exchange must not
      // clobber the still-valid login session.
      expect(tokenManager.getAccessToken(), 'login-access');
    });
  });

  group('completeBrowserUpgrade (branch coverage)', () {
    test('no_pending_request when upgradeToOAuthTokens was never called',
        () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _branchRepository(
        loginDio: _branchDio(),
        tokenDio: _branchDio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.completeBrowserUpgrade(
            Uri.parse('quantmail://oauth/callback?code=x&state=y')),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'no_pending_request')),
      );
    });

    test('missing_code clears the pending request', () async {
      final setup = await _branchConsentSetup();
      final AuthRepository repo = setup.repo;
      final AuthorizeRequest pending = setup.pending;

      await expectLater(
        repo.completeBrowserUpgrade(Uri.parse(
            'quantmail://oauth/callback?state=${pending.state}')),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'missing_code')),
      );
      // The pending request is cleared in all cases (finally).
      expect(repo.pendingAuthorizeRequest, isNull);
    });
  });

  group('refreshSession (branch coverage)', () {
    test('wraps a non-grant OAuth error and keeps the stored tokens', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('old-access', 'old-refresh');

      final tokenDio = _branchDio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _branchReject(handler, options, status: 400, data: {
              'error': 'invalid_request',
              'error_description': 'malformed grant',
            });
          },
        ),
      );

      final repo = _branchRepository(
        loginDio: _branchDio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.refreshSession(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'invalid_request')
            .having((e) => e.message, 'message',
                contains('Token refresh failed'))),
      );
      // Only invalid_grant signs out; any other grant error keeps the session.
      expect(tokenManager.getAccessToken(), 'old-access');
      expect(tokenManager.getRefreshToken(), 'old-refresh');
    });
  });

  group('signOut (branch coverage)', () {
    test('skips revocation when no refresh token is stored', () async {
      final tokenManager = _branchTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('only-access');

      var revokeCalls = 0;
      final tokenDio = _branchDio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            revokeCalls++;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'success': true},
            ));
          },
        ),
      );

      final repo = _branchRepository(
        loginDio: _branchDio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await repo.signOut();

      expect(revokeCalls, 0);
      expect(tokenManager.getAccessToken(), isNull);
    });
  });
}
