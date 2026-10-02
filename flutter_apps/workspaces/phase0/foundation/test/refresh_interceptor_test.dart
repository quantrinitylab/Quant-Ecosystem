// RefreshInterceptor unit tests: 401 -> refresh -> retry flow.
//
// The built-in AuthApi transport is NOT exercised here (covered by
// `oauth_refresh_test.dart` in quant_core); every test injects a
// `tokenRefresher` delegate instead.
//
// Run: `flutter test` from the package root.

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:quant_foundation/quant_foundation.dart';

class MockDio extends Mock implements Dio {}

/// Records how the error interceptor settles each error.
class _RecordingErrorHandler extends ErrorInterceptorHandler {
  DioException? nextError;
  Response<dynamic>? resolvedResponse;

  @override
  void next(DioException err) {
    nextError = err;
  }

  @override
  void resolve(Response<dynamic> response) {
    resolvedResponse = response;
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

/// A TokenManager with no tokens stored.
TokenManager _emptyManager() {
  final manager = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(manager.dispose);
  return manager;
}

DioException _httpError(RequestOptions options, int statusCode) {
  return DioException(
    requestOptions: options,
    response: Response<dynamic>(
      requestOptions: options,
      statusCode: statusCode,
    ),
    type: DioExceptionType.badResponse,
  );
}

/// Builds the interceptor under test with a recording delegate transport.
///
/// [refresher] is the `tokenRefresher` delegate; [refreshCalls] records how
/// often it was invoked. The built-in AuthApi is replaced by a stub instance
/// so no real HTTP is ever attempted.
RefreshInterceptor _interceptor({
  required MockDio dio,
  required TokenManager manager,
  required RefreshTokensFn refresher,
  required void Function() onRefreshCall,
  FutureOr<void> Function()? onAuthFailure,
}) {
  return RefreshInterceptor(
    dio: dio,
    tokenManager: manager,
    tokenRefresher: (refreshToken) async {
      onRefreshCall();
      return refresher(refreshToken);
    },
    onAuthFailure: onAuthFailure,
    authApi: AuthApi(baseUrl: 'https://unused.test'),
  );
}

/// Stubs `dio.fetch` to answer the retried request with a 200.
void _stubFetchOk(MockDio dio) {
  when(() => dio.fetch<dynamic>(any())).thenAnswer((invocation) async {
    final options = invocation.positionalArguments[0] as RequestOptions;
    return Response<dynamic>(
      requestOptions: options,
      statusCode: 200,
      data: const {'ok': true},
    );
  });
}

void main() {
  setUpAll(() {
    registerFallbackValue(RequestOptions(path: '/fallback'));
  });

  group('RefreshInterceptor 401 refresh-and-retry', () {
    test('on401RefreshesTokenAndRetriesOriginalRequestWithFreshBearer',
        () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var refreshCalls = 0;
      var authFailureCalls = 0;
      _stubFetchOk(dio);
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => const {
          'accessToken': 'new-access',
          'refreshToken': 'new-refresh',
        },
        onRefreshCall: () => refreshCalls++,
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages', method: 'GET');
      final handler = _RecordingErrorHandler();
      await interceptor.onError(_httpError(options, 401), handler);

      // The retry resolved: the 401 is invisible to the caller.
      expect(handler.resolvedResponse, isNotNull);
      expect(handler.resolvedResponse!.statusCode, 200);
      expect(handler.nextError, isNull);

      // Both rotated tokens are stored; the presented refresh token is gone.
      expect(manager.getAccessToken(), 'new-access');
      expect(manager.getRefreshToken(), 'new-refresh');
      expect(manager.isAuthenticated(), isTrue);

      // The retried request carries the FRESH Bearer token (never the stale
      // one), is marked as refresh-retried exactly once, and resets the
      // backoff-retry counter for its own attempt series.
      final captured =
          verify(() => dio.fetch<dynamic>(captureAny())).captured;
      expect(captured, hasLength(1));
      final retried = captured.single as RequestOptions;
      expect(retried.headers['Authorization'], 'Bearer new-access');
      expect(retried.extra[kRefreshAttemptedExtraKey], isTrue);
      expect(retried.extra[kRetryCountExtraKey], 0);

      expect(refreshCalls, 1);
      expect(authFailureCalls, 0);
    });

    test('onRefreshFailureClearsTokensNotifiesAndPropagatesOriginal401',
        () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var authFailureCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => null,
        onRefreshCall: () {},
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final original = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(original, handler);

      // Original 401 propagates untouched; the retry transport never runs.
      expect(identical(handler.nextError, original), isTrue);
      expect(handler.resolvedResponse, isNull);
      verifyNever(() => dio.fetch<dynamic>(any()));

      // Tokens are wiped and the app is told to route to login.
      expect(manager.getAccessToken(), isNull);
      expect(manager.getRefreshToken(), isNull);
      expect(manager.isAuthenticated(), isFalse);
      expect(manager.currentState.status, AuthStatus.unauthenticated);
      expect(authFailureCalls, 1);
    });

    test('incompleteTokenPairFromDelegateIsTreatedAsFailure', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var authFailureCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        // Rotation requires BOTH tokens; a partial pair must not be stored.
        refresher: (_) async => const {'accessToken': 'new-access'},
        onRefreshCall: () {},
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final original = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(original, handler);

      expect(identical(handler.nextError, original), isTrue);
      expect(manager.getAccessToken(), isNull);
      expect(manager.isAuthenticated(), isFalse);
      expect(authFailureCalls, 1);
      verifyNever(() => dio.fetch<dynamic>(any()));
    });

    test('delegateThrowIsTreatedAsRefreshFailure', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var authFailureCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) => throw StateError('transport down'),
        onRefreshCall: () {},
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final original = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(original, handler);

      expect(identical(handler.nextError, original), isTrue);
      expect(manager.getAccessToken(), isNull);
      expect(authFailureCalls, 1);
    });

    test('failsFastWhenNoRefreshTokenIsStored', () async {
      final dio = MockDio();
      final manager = _emptyManager();
      var refreshCalls = 0;
      var authFailureCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async {
          refreshCalls++;
          return null;
        },
        onRefreshCall: () {},
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final original = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(original, handler);

      expect(identical(handler.nextError, original), isTrue);
      expect(refreshCalls, 0);
      expect(authFailureCalls, 1);
      verifyNever(() => dio.fetch<dynamic>(any()));
    });

    test('concurrent401sShareASingleInflightRefresh', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var refreshCalls = 0;
      final refreshGate = Completer<Map<String, String>?>();
      _stubFetchOk(dio);
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) {
          refreshCalls++;
          return refreshGate.future;
        },
        onRefreshCall: () {},
      );

      final handler1 = _RecordingErrorHandler();
      final handler2 = _RecordingErrorHandler();
      // Both fire before the refresh completes: the second must join the
      // in-flight attempt instead of starting its own.
      final pending1 = interceptor.onError(
          _httpError(RequestOptions(path: '/a'), 401), handler1);
      final pending2 = interceptor.onError(
          _httpError(RequestOptions(path: '/b'), 401), handler2);
      await Future<void>.delayed(Duration.zero);
      expect(refreshCalls, 1);

      refreshGate.complete(const {
        'accessToken': 'new-access',
        'refreshToken': 'new-refresh',
      });
      await Future.wait([pending1, pending2]);

      expect(refreshCalls, 1);
      expect(handler1.resolvedResponse!.statusCode, 200);
      expect(handler2.resolvedResponse!.statusCode, 200);
      // One refresh, but each original request is retried on its own.
      final captured =
          verify(() => dio.fetch<dynamic>(captureAny())).captured;
      expect(captured, hasLength(2));
    });

    test('retryRequestFailurePropagatesTheRetryError', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      final retryOptions = RequestOptions(path: '/messages');
      final retryError = _httpError(retryOptions, 500);
      when(() => dio.fetch<dynamic>(any())).thenThrow(retryError);
      var authFailureCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => const {
          'accessToken': 'new-access',
          'refreshToken': 'new-refresh',
        },
        onRefreshCall: () {},
        onAuthFailure: () async => authFailureCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final original = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(original, handler);

      // The RETRY's error (500) reaches the caller, not the original 401;
      // the refreshed tokens stay stored (refresh itself succeeded).
      expect(identical(handler.nextError, retryError), isTrue);
      expect(handler.resolvedResponse, isNull);
      expect(manager.getAccessToken(), 'new-access');
      expect(authFailureCalls, 0);
    });
  });

  group('RefreshInterceptor eligibility', () {
    test('passesThroughNon401ErrorsWithoutRefreshing', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var refreshCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => null,
        onRefreshCall: () => refreshCalls++,
      );

      final options = RequestOptions(path: '/messages');
      final error = _httpError(options, 500);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(error, handler);

      expect(identical(handler.nextError, error), isTrue);
      expect(handler.resolvedResponse, isNull);
      expect(refreshCalls, 0);
      // Untouched: no clear, no retry.
      expect(manager.getAccessToken(), 'old-access');
      verifyNever(() => dio.fetch<dynamic>(any()));
    });

    test('neverRefreshesTheRefreshEndpointItself', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var refreshCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => null,
        onRefreshCall: () => refreshCalls++,
      );

      // A 401 on POST /oauth/token must not re-enter the refresh flow
      // (infinite recursion guard).
      final options = RequestOptions(path: OAuthPaths.token);
      final error = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(error, handler);

      expect(identical(handler.nextError, error), isTrue);
      expect(refreshCalls, 0);
    });

    test('doesNotRefreshTwiceForAlreadyRetriedRequest', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('new-access', 'new-refresh');
      var refreshCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => null,
        onRefreshCall: () => refreshCalls++,
      );

      final options = RequestOptions(path: '/messages')
        ..extra[kRefreshAttemptedExtraKey] = true;
      final error = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(error, handler);

      // Exactly-one-retry guarantee: the second 401 propagates as-is.
      expect(identical(handler.nextError, error), isTrue);
      expect(refreshCalls, 0);
      verifyNever(() => dio.fetch<dynamic>(any()));
    });

    test('skipsRefreshFlowForAuthBypassedRequests', () async {
      final dio = MockDio();
      final manager = await _managerWithTokens('old-access', 'old-refresh');
      var refreshCalls = 0;
      final interceptor = _interceptor(
        dio: dio,
        manager: manager,
        refresher: (_) async => null,
        onRefreshCall: () => refreshCalls++,
      );

      final options = skipAuth(RequestOptions(path: '/oauth/token'));
      final error = _httpError(options, 401);
      final handler = _RecordingErrorHandler();
      await interceptor.onError(error, handler);

      expect(identical(handler.nextError, error), isTrue);
      expect(refreshCalls, 0);
    });
  });
}
