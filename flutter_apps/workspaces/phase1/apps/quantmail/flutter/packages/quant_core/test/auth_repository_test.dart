// ============================================================================
// quant_core - unit tests for AuthRepository (Phase 1 M2)
// ============================================================================
//
// Tests run against canned Dio interceptors — no network, no platform
// channels. Token storage is [InMemoryTokenStorage].
//
// NOTE: `AuthRepository` / `AuthException` / `AuthSignedOutException` /
// `ConsentRequiredException` / `LoginResult` / … are exported from
// `package:quant_core/quant_core.dart` (barrel owned by W2); this test
// imports the barrel so it stays correct once the exports land.

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

const _baseUrl = 'https://test.quantmail.local';
const _origin = 'https://test.quantmail.local';
const _clientId = 'client_test_123';

TokenManager _tokenManager() => TokenManager(storage: InMemoryTokenStorage());

Dio _dio() => Dio(BaseOptions(baseUrl: _baseUrl));

AuthRepository _repository({
  required Dio loginDio,
  required Dio tokenDio,
  TokenManager? tokenManager,
  String oauthClientId = _clientId,
}) =>
    AuthRepository(
      authApi: AuthApi(baseUrl: _baseUrl, dio: tokenDio),
      tokenManager: tokenManager ?? _tokenManager(),
      apiBaseUrl: _baseUrl,
      webOrigin: _origin,
      oauthClientId: oauthClientId,
      loginDio: loginDio,
    );

Map<String, dynamic> _tokenJson({
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

void _reject(
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

/// Sets up a repository whose authorize call answers 200 (HTML consent
/// screen) and returns it together with the pending [AuthorizeRequest].
Future<({AuthRepository repo, TokenManager tokenManager, AuthorizeRequest pending})>
    _consentSetup() async {
  final tokenManager = _tokenManager();
  await tokenManager.setTokens('login-access');

  final loginDio = _dio();
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

  final tokenDio = _dio();
  tokenDio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: _tokenJson(),
        ));
      },
    ),
  );

  final repo = _repository(
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

void main() {
  group('signInWithPassword', () {
    test('stores the access token and returns LoginSucceeded', () async {
      final loginDio = _dio();
      String? seenOrigin;
      Object? seenBody;
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.path, '/auth/login');
            seenOrigin = options.headers['Origin'] as String?;
            seenBody = options.data;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'success': true,
                'data': {
                  'userId': 'u1',
                  'accessToken': 'access-1',
                  'expiresIn': 900,
                  'tokenType': 'Bearer',
                  'user': {'id': 'u1', 'email': 'a@b.c'},
                },
              },
            ));
          },
        ),
      );

      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: loginDio,
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      final result =
          await repo.signInWithPassword(email: 'a@b.c', password: 'pw');

      expect(result, isA<LoginSucceeded>());
      expect(seenOrigin, _origin);
      expect((seenBody as Map)['email'], 'a@b.c');
      expect(tokenManager.getAccessToken(), 'access-1');
      // No refresh token in the /auth/login body (cookie-only on web).
      expect(tokenManager.getRefreshToken(), isNull);
    });

    test('returns LoginTwoFactorRequired when the server gates on 2FA',
        () async {
      final loginDio = _dio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'twoFactorRequired': true,
                'challenge': 'ch_123',
                'expiresIn': 300,
              },
            ));
          },
        ),
      );

      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: loginDio,
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      final result =
          await repo.signInWithPassword(email: 'a@b.c', password: 'pw');

      expect(result, isA<LoginTwoFactorRequired>());
      expect((result as LoginTwoFactorRequired).challenge, 'ch_123');
      expect(tokenManager.getAccessToken(), isNull);
    });

    test('maps 403 UNTRUSTED_ORIGIN to AuthException with code', () async {
      final loginDio = _dio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _reject(handler, options, status: 403, data: {
              'error': 'UNTRUSTED_ORIGIN',
              'message': 'Origin not allowlisted',
            });
          },
        ),
      );

      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: loginDio,
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'pw'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'UNTRUSTED_ORIGIN')),
      );
    });

    test('maps invalid credentials to AuthException', () async {
      final loginDio = _dio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _reject(handler, options, status: 401, data: {
              'success': false,
              'error': 'invalid_credentials',
              'message': 'Invalid email or password',
            });
          },
        ),
      );

      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: loginDio,
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.signInWithPassword(email: 'a@b.c', password: 'wrong'),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'invalid_credentials')),
      );
      expect(tokenManager.getAccessToken(), isNull);
    });
  });

  group('verifyTwoFactor', () {
    test('stores the session access token on success', () async {
      final loginDio = _dio();
      Object? seenBody;
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.path, '/auth/2fa/verify');
            seenBody = options.data;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'success': true,
                'data': {
                  'userId': 'u1',
                  'accessToken': 'access-2fa',
                  'expiresIn': 900,
                  'tokenType': 'Bearer',
                },
              },
            ));
          },
        ),
      );

      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: loginDio,
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      await repo.verifyTwoFactor(challenge: 'ch_123', code: '123456');

      expect((seenBody as Map)['challenge'], 'ch_123');
      expect((seenBody as Map)['code'], '123456');
      expect(tokenManager.getAccessToken(), 'access-2fa');
    });
  });

  group('upgradeToOAuthTokens', () {
    test('302 auto-approve: exchanges the code and stores the pair', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('login-access');

      String? seenAuthorization;
      final loginDio = _dio();
      loginDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            seenAuthorization = options.headers['Authorization'] as String?;
            // Echo the request state back, as the backend does.
            final state = options.uri.queryParameters['state'];
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 302,
              headers: Headers.fromMap({
                'location': [
                  'quantmail://oauth/callback?code=ac_test123&state=$state',
                ],
              }),
              data: '',
            ));
          },
        ),
      );

      final tokenDio = _dio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.path, '/oauth/token');
            final body = options.data as Map;
            expect(body['grant_type'], 'authorization_code');
            expect(body['code'], 'ac_test123');
            expect(body['client_id'], _clientId);
            expect(body['redirect_uri'], 'quantmail://oauth/callback');
            expect((body['code_verifier'] as String).isNotEmpty, isTrue);
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: _tokenJson(),
            ));
          },
        ),
      );

      final repo = _repository(
        loginDio: loginDio,
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await repo.upgradeToOAuthTokens();

      expect(seenAuthorization, 'Bearer login-access');
      expect(tokenManager.getAccessToken(), 'oauth-access');
      expect(tokenManager.getRefreshToken(), 'oauth-refresh');
      expect(repo.pendingAuthorizeRequest, isNull);
    });

    test(
        '200 consent screen: ConsentRequiredException; browser callback '
        'completes the upgrade', () async {
      final (:repo, :tokenManager, :pending) = await _consentSetup();
      addTearDown(tokenManager.dispose);

      expect(pending.codeVerifier.isNotEmpty, isTrue);
      expect(pending.state.isNotEmpty, isTrue);

      // The user approves in the browser; the app receives the callback.
      await repo.completeBrowserUpgrade(
        Uri.parse(
            'quantmail://oauth/callback?code=ac_consent&state=${pending.state}'),
      );

      expect(tokenManager.getAccessToken(), 'oauth-access');
      expect(tokenManager.getRefreshToken(), 'oauth-refresh');
      expect(repo.pendingAuthorizeRequest, isNull);
    });

    test('completeBrowserUpgrade rejects a tampered state', () async {
      final (:repo, :tokenManager, :pending) = await _consentSetup();
      addTearDown(tokenManager.dispose);
      expect(pending.state.isNotEmpty, isTrue);

      await expectLater(
        repo.completeBrowserUpgrade(Uri.parse(
            'quantmail://oauth/callback?code=ac_x&state=tampered')),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'state_mismatch')),
      );
      expect(repo.pendingAuthorizeRequest, isNull);
    });

    test('completeBrowserUpgrade surfaces access_denied', () async {
      final (:repo, :tokenManager, :pending) = await _consentSetup();
      addTearDown(tokenManager.dispose);

      await expectLater(
        repo.completeBrowserUpgrade(Uri.parse(
            'quantmail://oauth/callback?error=access_denied&state=${pending.state}')),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'access_denied')),
      );
    });

    test('empty oauthClientId fails fast', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: _dio(),
        tokenDio: _dio(),
        tokenManager: tokenManager,
        oauthClientId: '',
      );

      await expectLater(
        repo.upgradeToOAuthTokens(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'client_not_provisioned')),
      );
    });

    test('missing access token fails with no_access_token', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      final repo = _repository(
        loginDio: _dio(),
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.upgradeToOAuthTokens(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'no_access_token')),
      );
    });
  });

  group('refreshSession', () {
    test('rotates the pair: both new tokens are stored', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('old-access', 'old-refresh');

      final tokenDio = _dio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            final body = options.data as Map;
            expect(body['grant_type'], 'refresh_token');
            expect(body['refresh_token'], 'old-refresh');
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: _tokenJson(access: 'new-access', refresh: 'new-refresh'),
            ));
          },
        ),
      );

      final repo = _repository(
        loginDio: _dio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await repo.refreshSession();

      expect(tokenManager.getAccessToken(), 'new-access');
      expect(tokenManager.getRefreshToken(), 'new-refresh');
    });

    test('invalid_grant clears tokens and throws AuthSignedOutException',
        () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('old-access', 'old-refresh');

      final tokenDio = _dio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _reject(handler, options, status: 400, data: {
              'error': 'invalid_grant',
              'error_description': 'Refresh token revoked',
            });
          },
        ),
      );

      final repo = _repository(
        loginDio: _dio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.refreshSession(),
        throwsA(isA<AuthSignedOutException>()),
      );
      expect(tokenManager.getAccessToken(), isNull);
      expect(tokenManager.getRefreshToken(), isNull);
    });

    test('throws AuthException when no refresh token is stored', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('only-access');

      final repo = _repository(
        loginDio: _dio(),
        tokenDio: _dio(),
        tokenManager: tokenManager,
      );

      await expectLater(
        repo.refreshSession(),
        throwsA(isA<AuthException>()
            .having((e) => e.code, 'code', 'no_refresh_token')),
      );
    });
  });

  group('signOut', () {
    test('revokes the refresh token and clears local tokens', () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('a', 'r');

      String? revoked;
      final tokenDio = _dio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            expect(options.path, '/oauth/revoke');
            revoked = (options.data as Map)['token'] as String?;
            handler.resolve(Response(
              requestOptions: options,
              statusCode: 200,
              data: {'success': true},
            ));
          },
        ),
      );

      final repo = _repository(
        loginDio: _dio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await repo.signOut();

      expect(revoked, 'r');
      expect(tokenManager.getAccessToken(), isNull);
      expect(tokenManager.getRefreshToken(), isNull);
    });

    test('revocation failure is best-effort: tokens are still cleared',
        () async {
      final tokenManager = _tokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('a', 'r');

      final tokenDio = _dio();
      tokenDio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            _reject(handler, options, status: 500, data: 'boom');
          },
        ),
      );

      final repo = _repository(
        loginDio: _dio(),
        tokenDio: tokenDio,
        tokenManager: tokenManager,
      );

      await repo.signOut(); // must not throw

      expect(tokenManager.getAccessToken(), isNull);
      expect(tokenManager.getRefreshToken(), isNull);
    });
  });
}
