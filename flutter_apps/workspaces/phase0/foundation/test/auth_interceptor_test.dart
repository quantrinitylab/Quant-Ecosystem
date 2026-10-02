// AuthInterceptor unit tests: Bearer injection behavior.
//
// Run: `flutter test` from the package root.

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Records the options delivered to `handler.next`.
class _RecordingRequestHandler extends RequestInterceptorHandler {
  RequestOptions? nextOptions;

  @override
  void next(RequestOptions options) {
    nextOptions = options;
  }
}

/// A TokenManager holding the given tokens in memory.
Future<TokenManager> _managerWithTokens(
  String accessToken,
  String refreshToken,
) async {
  final manager = TokenManager(storage: InMemoryTokenStorage());
  await manager.setTokens(accessToken, refreshToken);
  addTearDown(manager.dispose);
  return manager;
}

/// A TokenManager with no tokens (never hydrated with credentials).
TokenManager _emptyManager() {
  final manager = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(manager.dispose);
  return manager;
}

void main() {
  group('AuthInterceptor', () {
    test('injectsBearerAuthorizationHeaderWhenTokenPresent', () async {
      final manager = await _managerWithTokens('abc123', 'r1');
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();

      interceptor.onRequest(RequestOptions(path: '/messages'), handler);

      expect(handler.nextOptions, isNotNull);
      expect(handler.nextOptions!.headers['Authorization'], 'Bearer abc123');
    });

    test('doesNotInjectWhenNoTokenCached', () {
      final manager = _emptyManager();
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();

      interceptor.onRequest(RequestOptions(path: '/messages'), handler);

      expect(handler.nextOptions, isNotNull);
      expect(handler.nextOptions!.headers.containsKey('Authorization'), isFalse);
    });

    test('doesNotOverwriteExplicitlySetAuthorizationHeader', () async {
      final manager = await _managerWithTokens('abc123', 'r1');
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();
      final options = RequestOptions(path: '/messages')
        ..headers['Authorization'] = 'Bearer explicit-token';

      interceptor.onRequest(options, handler);

      expect(handler.nextOptions!.headers['Authorization'],
          'Bearer explicit-token');
    });

    test('skipsInjectionWhenSkipAuthExtraIsTrue', () async {
      final manager = await _managerWithTokens('abc123', 'r1');
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();
      final options = RequestOptions(path: '/oauth/token')
        ..extra[kSkipAuthExtraKey] = true;

      interceptor.onRequest(options, handler);

      expect(handler.nextOptions, isNotNull);
      expect(handler.nextOptions!.headers.containsKey('Authorization'), isFalse);
    });

    test('alwaysForwardsOptionsToNextHandler', () async {
      final manager = await _managerWithTokens('abc123', 'r1');
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();
      final options = RequestOptions(path: '/messages', method: 'POST');

      interceptor.onRequest(options, handler);

      expect(handler.nextOptions, isNotNull);
      expect(handler.nextOptions!.path, '/messages');
      expect(handler.nextOptions!.method, 'POST');
    });
  });

  group('skipAuth', () {
    test('marksOptionsToBypassAuthInjection', () {
      final options = skipAuth(RequestOptions(path: '/oauth/token'));

      expect(options.extra[kSkipAuthExtraKey], isTrue);
    });

    test('bypassedOptionsStayUntouchedByInterceptor', () async {
      final manager = await _managerWithTokens('abc123', 'r1');
      final interceptor = AuthInterceptor(manager);
      final handler = _RecordingRequestHandler();
      final options = skipAuth(RequestOptions(path: '/oauth/token'));

      interceptor.onRequest(options, handler);

      expect(handler.nextOptions!.headers.containsKey('Authorization'), isFalse);
    });
  });
}
