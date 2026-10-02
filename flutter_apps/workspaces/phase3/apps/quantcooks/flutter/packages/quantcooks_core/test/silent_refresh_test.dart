// quantcooks_core - silent-refresh scheduler + refresh-mutex tests.
//
// Uses a fake [TimerFactory] (F2 seam) and an in-memory [TokenManager] so no
// platform channels or network are touched.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';
import 'package:quantcooks_core/src/auth.dart';

/// Controllable [Timer] double: fires only when [fire] is called.
class FakeTimer implements Timer {
  bool _active = true;
  final void Function() _callback;

  FakeTimer(this._callback);

  /// Runs the scheduled callback (once, like a real one-shot timer).
  void fire() {
    if (!_active) return;
    _active = false;
    _callback();
  }

  @override
  void cancel() => _active = false;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;
}

/// Records every scheduled timer; fires them on demand.
class FakeTimerFactory {
  final List<Duration> scheduledDurations = <Duration>[];
  final List<FakeTimer> timers = <FakeTimer>[];

  TimerFactory get factory => (Duration d, void Function() cb) {
        scheduledDurations.add(d);
        final timer = FakeTimer(cb);
        timers.add(timer);
        return timer;
      };

  /// Timers that are still armed (not fired or cancelled).
  List<FakeTimer> get armed => timers.where((t) => t.isActive).toList();
}

/// [CooksAuthRepository] double: `refreshSession` is gated and scriptable.
class FakeCooksAuthRepository extends CooksAuthRepository {
  FakeCooksAuthRepository({required super.tokenManager})
      : super(
          authApi: AuthApi(baseUrl: 'https://example.invalid'),
          apiBaseUrl: 'https://example.invalid',
          webOrigin: 'https://example.invalid',
          oauthClientId: 'test-client',
        );

  int refreshCalls = 0;

  /// If non-null, the in-flight refresh awaits this before completing.
  Completer<void>? gate;

  /// If non-null, the next `refreshSession` throws it (then resets to null).
  Object? nextError;

  @override
  Future<void> refreshSession() async {
    refreshCalls++;
    final g = gate;
    if (g != null) await g.future;
    final error = nextError;
    nextError = null;
    if (error != null) throw error;
  }
}

/// Test fixture: container with fake timers, fake repository, and an
/// in-memory token manager (no platform channels).
class Fixture {
  Fixture()
      : tokenManager = TokenManager(storage: InMemoryTokenStorage()),
        timerFactory = FakeTimerFactory() {
    repository = FakeCooksAuthRepository(tokenManager: tokenManager);
    container = ProviderContainer(
      overrides: [
        silentRefreshTimerFactoryProvider
            .overrideWithValue(timerFactory.factory),
        cooksTokenManagerProvider.overrideWithValue(tokenManager),
        cooksAuthRepositoryProvider.overrideWithValue(repository),
      ],
    );
    // Instantiate the scheduler (side-effect provider); hydrate() runs
    // against InMemoryTokenStorage — no platform channels involved.
    container.read(silentRefreshSchedulerProvider);
  }

  final TokenManager tokenManager;
  final FakeTimerFactory timerFactory;
  late final FakeCooksAuthRepository repository;
  late final ProviderContainer container;

  /// Emits a fresh token pair, arming the scheduler, and flushes the
  /// auth-state broadcast through microtasks.
  Future<void> issueTokens() async {
    await tokenManager.setTokens('access', 'refresh');
    await pumpEventQueue();
  }

  void dispose() => container.dispose();
}

/// Verified access TTL (900 s, phase0/AUTH_CONTRACT.md §5) minus the default
/// refresh leeway (120 s, CooksConfig.refreshLeeway).
const expectedDelay = Duration(seconds: 900 - 120);

void main() {
  test('token issuance arms a timer at expiry-minus-leeway', () async {
    final f = Fixture();
    addTearDown(f.dispose);

    await f.issueTokens();

    expect(f.timerFactory.armed, hasLength(1));
    expect(f.timerFactory.scheduledDurations.single, expectedDelay);
  });

  test('concurrent fires collapse into exactly ONE refreshSession call',
      () async {
    final f = Fixture();
    addTearDown(f.dispose);

    f.repository.gate = Completer<void>();

    // First issuance arms timer 1; firing it starts an in-flight refresh.
    await f.issueTokens();
    f.timerFactory.armed.single.fire();
    expect(f.repository.refreshCalls, 1);
    expect(f.container.read(refreshMutexProvider).isRefreshInFlight, isTrue);

    // Second issuance while the first refresh is in flight arms timer 2;
    // firing it must NOT issue another HTTP call (S1 dedupe — backend
    // rotates refresh tokens, a second call would kill the family).
    await f.issueTokens();
    f.timerFactory.armed.single.fire();
    expect(f.repository.refreshCalls, 1);

    // Completing the gate finishes the shared future for both callers and
    // clears the mutex slot for the next refresh.
    f.repository.gate!.complete();
    await pumpEventQueue();
    expect(f.container.read(refreshMutexProvider).isRefreshInFlight, isFalse);
    expect(f.repository.refreshCalls, 1);
  });

  test('CooksSignedOutException is swallowed and the scheduler cancels',
      () async {
    final f = Fixture();
    addTearDown(f.dispose);

    f.repository.nextError = const CooksSignedOutException();

    await f.issueTokens();
    f.timerFactory.armed.single.fire();
    await pumpEventQueue();

    // No exception propagated (the test would fail otherwise); the fired
    // timer is consumed, nothing is re-armed, and the mutex slot is clear.
    expect(f.repository.refreshCalls, 1);
    expect(f.timerFactory.armed, isEmpty);
    expect(f.container.read(refreshMutexProvider).isRefreshInFlight, isFalse);
  });

  test('transient error is swallowed; next issuance re-arms the scheduler',
      () async {
    final f = Fixture();
    addTearDown(f.dispose);

    f.repository.nextError = Exception('network down');

    await f.issueTokens();
    f.timerFactory.armed.single.fire();
    await pumpEventQueue();

    // Swallowed: no exception reaches the test zone, nothing re-armed yet.
    expect(f.repository.refreshCalls, 1);
    expect(f.timerFactory.armed, isEmpty);

    // The next token issuance re-arms at the normal delay.
    await f.issueTokens();
    expect(f.timerFactory.armed, hasLength(1));
    expect(f.timerFactory.scheduledDurations.last, expectedDelay);
  });

  test('signed-out auth state cancels an armed timer', () async {
    final f = Fixture();
    addTearDown(f.dispose);

    await f.issueTokens();
    expect(f.timerFactory.armed, hasLength(1));

    await f.tokenManager.clearTokens();
    await pumpEventQueue();

    expect(f.timerFactory.armed, isEmpty);
  });

  group('RefreshMutex', () {
    test('dedupes concurrent calls and clears the slot after completion',
        () async {
      final mutex = RefreshMutex();
      final gate = Completer<void>();
      var calls = 0;

      Future<void> task() async {
        calls++;
        await gate.future;
      }

      final first = mutex.runSingleFlight(task);
      final second = mutex.runSingleFlight(task);
      expect(calls, 1);
      expect(mutex.isRefreshInFlight, isTrue);

      gate.complete();
      await first;
      await second;
      expect(mutex.isRefreshInFlight, isFalse);

      // A later refresh starts a fresh attempt.
      final third = mutex.runSingleFlight(task);
      await third;
      expect(calls, 2);
      expect(mutex.isRefreshInFlight, isFalse);
    });

    test('failed refresh clears the slot without unhandled async errors',
        () async {
      final mutex = RefreshMutex();
      final gate = Completer<void>();

      Future<void> task() async {
        await gate.future;
        throw Exception('refresh failed');
      }

      final shared = mutex.runSingleFlight(task);
      final waiter = mutex.runSingleFlight(task);

      gate.complete();
      await expectLater(shared, throwsA(isA<Exception>()));
      await expectLater(waiter, throwsA(isA<Exception>()));
      expect(mutex.isRefreshInFlight, isFalse);
      // If the derived `whenComplete` future's error were unhandled, the
      // test zone would report it here — reaching this line proves the
      // `.then((_) {}, onError: (_) {})` swallow works.
    });
  });
}
