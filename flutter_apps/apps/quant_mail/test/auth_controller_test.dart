// Sign-in must fail closed: only a successful answer from the QuantMail
// backend can sign the user in. These tests script the HTTP layer, so they
// never touch the network, and use an in-memory secure storage.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/services/quant_auth_controller.dart';
import 'package:quant_mail/services/quant_auth_service.dart';

const String _baseUrl = 'https://quantmail.in/api';
const String _origin = 'https://quantmail.in';
const String _accessToken = 'access-token-from-server';

/// Records every request and answers from a handler.
class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this._handler);

  final Future<ResponseBody> Function(RequestOptions options) _handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

/// Keystore whose writes always fail.
class _FailingWriteStorage extends FlutterSecureStorage {
  const _FailingWriteStorage();

  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    throw PlatformException(code: 'keystore', message: 'simulated keystore failure');
  }
}

class _Harness {
  _Harness(Future<ResponseBody> Function(RequestOptions options) handler, {QuantAuthService? service})
      : store = <String, String>{} {
    FlutterSecureStorage.setMockInitialValues(store);
    adapter = _ScriptedAdapter(handler);
    controller = QuantAuthController.forTesting(
      authService: service ?? QuantAuthService(),
      baseUrl: _baseUrl,
      origin: _origin,
      httpClientAdapter: adapter,
    );
  }

  /// What the secure storage holds. Empty means nothing was persisted.
  final Map<String, String> store;
  late final _ScriptedAdapter adapter;
  late final QuantAuthController controller;

  void expectSignedOut() {
    expect(controller.isAuthenticated, isFalse);
    expect(controller.currentUser, isNull);
    expect(store, isEmpty);
  }
}

ResponseBody _json(int status, Map<String, dynamic> body) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>[Headers.jsonContentType],
    },
  );
}

Map<String, dynamic> _sessionBody() => <String, dynamic>{
      'success': true,
      'data': <String, dynamic>{
        'userId': 'usr_1',
        'accessToken': _accessToken,
        'expiresIn': 900,
        'tokenType': 'Bearer',
        'user': <String, dynamic>{
          'id': 'usr_1',
          'email': 'user@quantmail.in',
          'username': 'user',
          'displayName': 'Test User',
          'role': 'USER',
        },
      },
    };

Map<String, dynamic> _challengeBody() => <String, dynamic>{
      'success': true,
      'data': <String, dynamic>{
        'twoFactorRequired': true,
        'challenge': 'challenge-1',
        'expiresIn': 300,
      },
    };

Map<String, dynamic> _errorBody(int status, String code, String message) => <String, dynamic>{
      'success': false,
      'error': <String, dynamic>{'code': code, 'message': message, 'statusCode': status},
    };

Future<ResponseBody> _unreachable(RequestOptions options) async {
  throw DioException(
    requestOptions: options,
    type: DioExceptionType.connectionError,
    error: 'Connection refused',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('login fails closed', () {
    test('backend unreachable: signed out with a clear message', () async {
      final h = _Harness(_unreachable);

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, contains('Cannot reach quantmail.in'));
      h.expectSignedOut();
    });

    test('backend timeout: signed out with a clear message', () async {
      final h = _Harness((options) async {
        throw DioException(requestOptions: options, type: DioExceptionType.connectionTimeout);
      });

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, contains('took too long'));
      h.expectSignedOut();
    });

    test('wrong password: the server rejection is shown and the user stays signed out', () async {
      final h = _Harness(
        (options) async => _json(401, _errorBody(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')),
      );

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'not-the-password');

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, 'Invalid email or password.');
      h.expectSignedOut();
    });

    test('a non-JSON server error is reported, not treated as a sign-in', () async {
      final h = _Harness((options) async => ResponseBody.fromString('<html>Bad gateway</html>', 502));

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, contains('HTTP 502'));
      h.expectSignedOut();
    });

    test('a success response without an access token does not sign in', () async {
      final h = _Harness((options) async => _json(200, <String, dynamic>{
            'success': true,
            'data': <String, dynamic>{
              'user': <String, dynamic>{'id': 'usr_1', 'email': 'user@quantmail.in'},
            },
          }));

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.failed);
      h.expectSignedOut();
    });

    test('an exception while storing the session leaves the user signed out', () async {
      final h = _Harness(
        (options) async => _json(200, _sessionBody()),
        service: QuantAuthService(secureStorage: const _FailingWriteStorage()),
      );

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, contains('could not be stored securely'));
      h.expectSignedOut();
    });

    test('the old offline and demo sign-in triggers no longer work', () async {
      const attempts = <List<String>>[
        <String>['user@quantmail.in', 'abcd'], // 4+ characters used to be enough
        <String>['demo-2fa@quantmail.in', 'a-long-enough-password'], // "2fa" in the address
        <String>['user@quantmail.in', '2fa123'], // magic 2FA password
      ];

      for (final attempt in attempts) {
        final h = _Harness(_unreachable);

        final outcome = await h.controller.login(email: attempt[0], password: attempt[1]);

        expect(outcome.status, LoginStatus.failed, reason: 'attempt ${attempt[0]} / ${attempt[1]}');
        h.expectSignedOut();
      }
    });
  });

  group('login with a healthy backend', () {
    test('sends the production URL, origin and payload the web client uses', () async {
      final h = _Harness((options) async => _json(200, _sessionBody()));

      final outcome = await h.controller.login(email: '  User  ', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.signedIn);
      final request = h.adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.uri.toString(), 'https://quantmail.in/api/auth/login');
      expect(request.headers['Origin'], _origin);
      expect(request.contentType, Headers.jsonContentType);
      expect(request.data, <String, dynamic>{
        'email': 'user@quantmail.in',
        'password': 'a-long-enough-password',
      });
    });

    test('valid credentials sign in and persist the session', () async {
      final h = _Harness((options) async => _json(200, _sessionBody()));

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.signedIn);
      expect(outcome.user?.email, 'user@quantmail.in');
      expect(h.controller.isAuthenticated, isTrue);
      expect(h.controller.currentUser?.name, 'Test User');
      expect(h.store.values, contains(_accessToken));
    });

    test('logout clears the session even when the backend is unreachable', () async {
      var reachable = true;
      final h = _Harness((options) async {
        if (!reachable) return _unreachable(options);
        return _json(200, _sessionBody());
      });
      await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');
      expect(h.controller.isAuthenticated, isTrue);

      reachable = false;
      await h.controller.logout();

      h.expectSignedOut();
    });
  });

  group('two-factor fails closed', () {
    test('a password-only success is not a session when a challenge is returned', () async {
      final h = _Harness((options) async => _json(200, _challengeBody()));

      final outcome = await h.controller.login(email: 'user@quantmail.in', password: 'a-long-enough-password');

      expect(outcome.status, LoginStatus.twoFactorRequired);
      expect(outcome.challenge, 'challenge-1');
      expect(outcome.expiresIn, 300);
      h.expectSignedOut();
    });

    test('an invalid code is not accepted', () async {
      final h = _Harness(
        (options) async => _json(401, _errorBody(401, 'INVALID_CODE', 'That code is not right.')),
      );

      final outcome = await h.controller.completeTwoFactor(
        challenge: 'challenge-1',
        code: '123456',
        email: 'user@quantmail.in',
      );

      expect(outcome.status, LoginStatus.failed);
      expect(outcome.errorMessage, 'That code is not right.');
      h.expectSignedOut();
    });

    test('well-formed codes are not accepted while the backend is unreachable', () async {
      // Any 6-digit code and any code of 8+ characters used to sign in offline.
      for (final code in <String>['123456', 'ABCDE-FGHJK', 'abcdefgh1234']) {
        final h = _Harness(_unreachable);

        final outcome = await h.controller.completeTwoFactor(
          challenge: 'challenge-1',
          code: code,
          email: 'user@quantmail.in',
        );

        expect(outcome.status, LoginStatus.failed, reason: 'code $code');
        h.expectSignedOut();
      }
    });

    test('an empty code or a missing challenge never reaches the network', () async {
      final h = _Harness((options) async => _json(200, _sessionBody()));

      final emptyCode = await h.controller.completeTwoFactor(challenge: 'challenge-1', code: '  ');
      final noChallenge = await h.controller.completeTwoFactor(challenge: '', code: '123456');

      expect(emptyCode.status, LoginStatus.failed);
      expect(noChallenge.status, LoginStatus.failed);
      expect(h.adapter.requests, isEmpty);
      h.expectSignedOut();
    });

    test('a code the backend accepts signs in', () async {
      final h = _Harness((options) async => _json(200, _sessionBody()));

      final outcome = await h.controller.completeTwoFactor(
        challenge: 'challenge-1',
        code: '123456',
        email: 'user@quantmail.in',
      );

      expect(outcome.status, LoginStatus.signedIn);
      expect(h.controller.isAuthenticated, isTrue);
      final request = h.adapter.requests.single;
      expect(request.uri.toString(), 'https://quantmail.in/api/auth/2fa/verify');
      expect(request.headers['Origin'], _origin);
      expect(request.data, <String, dynamic>{'challenge': 'challenge-1', 'code': '123456'});
    });
  });
}
