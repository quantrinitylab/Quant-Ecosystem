// ============================================================================
// quant_core - tests: OAuth2 refresh reconciliation (W5, Phase 1 M2)
// ============================================================================
//
// Covers the refresh-reconciliation decision:
//   1. 401 → the [RefreshTokensFn] delegate (native OAuth2 contract,
//      `POST /oauth/token` + rotation) runs, BOTH rotated tokens are stored,
//      and the original request is retried once with the fresh Bearer token.
//   2. Delegate failure (`invalid_grant` → null) clears tokens and lets the
//      original 401 propagate (signed-out path).
//   3. [SilentRefreshScheduler] unit tests with a fake [Timer] factory:
//      `expiresIn - leeway` scheduling, the 30 s floor, re-arm cancelling the
//      previous timer, cancel/dispose.
//
// The delegate is canned (no HTTP): it returns exactly what
// `AuthApi.refreshToken` would parse from the OAuth2 JSON response. A test
// [InterceptorsWrapper] registered AFTER the client stack simulates the
// backend: 401 for the stale Bearer, 200 for the refreshed one.

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Fake [Timer] driven manually by the test.
class FakeTimer implements Timer {
  FakeTimer(this.duration, this._callback);

  /// The delay the scheduler requested.
  final Duration duration;
  final void Function() _callback;

  bool _active = true;

  @override
  bool get isActive => _active;

  /// Elapsed-fire count; the fake fires at most once, so this is 0 or 1.
  int _tick = 0;

  @override
  int get tick => _tick;

  /// Fires the callback if the timer is still active.
  void fire() {
    if (!_active) return;
    _active = false;
    _tick++;
    _callback();
  }

  @override
  void cancel() {
    _active = false;
  }
}

/// Captures every scheduled timer; the test fires them manually.
class FakeTimerFactory {
  final List<FakeTimer> scheduled = [];

  Timer call(Duration duration, void Function() callback) {
    final timer = FakeTimer(duration, callback);
    scheduled.add(timer);
    return timer;
  }
}

QuantApiClient makeClient({
  required TokenManager tokenManager,
  required RefreshTokensFn tokenRefresher,
}) {
  return QuantApiClient(
    config: QuantApiConfig(
      baseUrl: 'https://test.quantmail.local',
      // Legacy path; unused while the delegate is set.
      refreshEndpoint: '/oauth/token',
      tokenRefresher: tokenRefresher,
    ),
    tokenManager: tokenManager,
  );
}

/// Rejects with [statusCode] while the request carries [rejectAuth], else
/// resolves 200 and records the Authorization header it saw.
///
/// The rejection uses `callFollowingErrorInterceptor: true` so the fake 401
/// flows through onError interceptors exactly like a real transport 401
/// (plain `reject` would skip them in Dio 5).
void stubBackend(
  QuantApiClient client, {
  required String rejectAuth,
  required void Function(String? authorization) onResolved,
  int statusCode = 401,
}) {
  client.dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final auth = options.headers['Authorization'] as String?;
        if (auth == rejectAuth) {
          handler.reject(
            DioException(
              requestOptions: options,
              type: DioExceptionType.badResponse,
              response: Response<dynamic>(
                requestOptions: options,
                statusCode: statusCode,
                data: <String, dynamic>{'error': 'invalid_token'},
              ),
            ),
            true, // callFollowingErrorInterceptor
          );
          return;
        }
        onResolved(auth);
        handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: <String, dynamic>{'ok': true},
          ),
        );
      },
    ),
  );
}

void main() {
  TokenManager makeTokenManager() =>
      TokenManager(storage: InMemoryTokenStorage());

  group('native OAuth2 refresh delegate (rotation)', () {
    test(
        '401 runs the delegate, stores BOTH rotated tokens, '
        'retries with the fresh Bearer', () async {
      final tokenManager = makeTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('old-access', 'old-refresh');

      String? presentedRefresh;
      final client = makeClient(
        tokenManager: tokenManager,
        // Canned equivalent of POST /oauth/token
        // {"grant_type":"refresh_token","refresh_token":"old-refresh"} →
        // snake_case TokenSet, mapped to the delegate pair.
        tokenRefresher: (refreshToken) async {
          presentedRefresh = refreshToken;
          return {
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          };
        },
      );

      String? retriedAuthorization;
      stubBackend(
        client,
        rejectAuth: 'Bearer old-access',
        onResolved: (auth) => retriedAuthorization = auth,
      );

      final result = await client.get<Map<String, dynamic>>('/inbox');

      expect(result.success, isTrue);
      // The delegate received the stored (old) refresh token.
      expect(presentedRefresh, 'old-refresh');
      // The retried request carried the FRESH access token...
      expect(retriedAuthorization, 'Bearer new-access');
      // ...and rotation was honored: BOTH new tokens stored.
      expect(tokenManager.getAccessToken(), 'new-access');
      expect(tokenManager.getRefreshToken(), 'new-refresh');
    });

    test('invalid_grant (delegate → null) clears tokens and propagates 401',
        () async {
      final tokenManager = makeTokenManager();
      addTearDown(tokenManager.dispose);
      await tokenManager.setTokens('old-access', 'revoked-refresh');

      var delegateCalls = 0;
      final client = makeClient(
        tokenManager: tokenManager,
        // Mirrors apiClientProvider's delegate: 400 invalid_grant → clear +
        // null (signed out).
        tokenRefresher: (refreshToken) async {
          delegateCalls++;
          await tokenManager.clearTokens();
          return null;
        },
      );

      var resolutions = 0;
      stubBackend(
        client,
        rejectAuth: 'Bearer old-access',
        onResolved: (_) => resolutions++,
      );

      final result = await client.get<Map<String, dynamic>>('/inbox');

      expect(delegateCalls, 1);
      // Exactly one refresh attempt: the retried request is never re-tried.
      expect(resolutions, 0);
      expect(result.success, isFalse);
      expect(result.error?.statusCode, 401);
      // Signed out: both tokens gone.
      expect(tokenManager.getAccessToken(), isNull);
      expect(tokenManager.getRefreshToken(), isNull);
      expect(tokenManager.currentState.isAuthenticated, isFalse);
    });
  });

  group('SilentRefreshScheduler', () {
    test('schedules at expiresIn - leeway', () {
      final factory = FakeTimerFactory();
      final scheduler =
          SilentRefreshScheduler(timerFactory: factory.call);
      addTearDown(scheduler.dispose);

      var fired = 0;
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 120),
        onFire: () => fired++,
      );

      expect(factory.scheduled, hasLength(1));
      expect(factory.scheduled.single.duration,
          const Duration(seconds: 780));
      expect(scheduler.isArmed, isTrue);

      factory.scheduled.single.fire();
      expect(fired, 1);
      expect(scheduler.isArmed, isFalse);
    });

    test('floors the delay at 30 seconds', () {
      final factory = FakeTimerFactory();
      final scheduler =
          SilentRefreshScheduler(timerFactory: factory.call);
      addTearDown(scheduler.dispose);

      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 60),
        leeway: const Duration(seconds: 120),
        onFire: () {},
      );

      expect(factory.scheduled.single.duration,
          const Duration(seconds: 30));
    });

    test('re-arming cancels the previous timer', () {
      final factory = FakeTimerFactory();
      final scheduler =
          SilentRefreshScheduler(timerFactory: factory.call);
      addTearDown(scheduler.dispose);

      var firstFired = 0;
      var secondFired = 0;
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 120),
        onFire: () => firstFired++,
      );
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 60),
        onFire: () => secondFired++,
      );

      expect(factory.scheduled, hasLength(2));
      final first = factory.scheduled[0];
      final second = factory.scheduled[1];
      expect(first.isActive, isFalse);
      expect(second.duration, const Duration(seconds: 840));

      // The stale timer can no longer fire.
      first.fire();
      expect(firstFired, 0);
      second.fire();
      expect(secondFired, 1);
    });

    test('cancel disarms without firing', () {
      final factory = FakeTimerFactory();
      final scheduler =
          SilentRefreshScheduler(timerFactory: factory.call);
      addTearDown(scheduler.dispose);

      var fired = 0;
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 120),
        onFire: () => fired++,
      );
      scheduler.cancel();

      expect(scheduler.isArmed, isFalse);
      factory.scheduled.single.fire();
      expect(fired, 0);
    });

    test('dispose disarms permanently', () {
      final factory = FakeTimerFactory();
      final scheduler = SilentRefreshScheduler(timerFactory: factory.call);

      var fired = 0;
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 120),
        onFire: () => fired++,
      );
      scheduler.dispose();

      expect(scheduler.isArmed, isFalse);
      // Post-dispose arming is ignored: no new timer, no fire.
      scheduler.noteTokensIssued(
        expiresIn: const Duration(seconds: 900),
        leeway: const Duration(seconds: 120),
        onFire: () => fired++,
      );
      expect(factory.scheduled, hasLength(1));
      factory.scheduled.single.fire();
      expect(fired, 0);
    });
  });
}
