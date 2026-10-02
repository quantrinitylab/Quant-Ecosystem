// ============================================================================
// quantmax_core - silent (proactive) token refresh
// ============================================================================
//
// Two pieces:
//
//   - [SilentRefreshScheduler]: pure-Dart single-timer scheduler. Armed with
//     [SilentRefreshScheduler.noteTokensIssued]; fires [onFire] once at
//     `expiresIn - leeway` (floored to 30 s). No Riverpod dependency — fully
//     unit-testable with a fake [Timer] factory.
//   - [silentRefreshProvider]: Riverpod wiring. Listens to
//     [TokenManager.onAuthStateChanged]; on every authenticated event it arms
//     the scheduler, on unauthenticated it disarms. When the timer fires it
//     refreshes through the SHARED [RefreshMutex] single flight (S1) — so a
//     timer fire coinciding with a 401 joins the in-flight refresh instead
//     of firing a second grant (rotation makes a second concurrent grant
//     fatal to the session). A successful refresh persists the rotated pair
//     via `TokenManager.setTokens`, which re-emits authenticated on the
//     stream and re-arms the scheduler — the loop is self-sustaining. Timer
//     leaks are prevented via `ref.onDispose`.
//
// Expiry source: the session notifier does not expose token expiry, so the
// provider arms from the `TokenManager.onAuthStateChanged` stream and the
// VERIFIED access TTL (900 s, `phase0/AUTH_CONTRACT.md` §1.8) minus
// `AppConfig.refreshLeeway`. The 401-reactive [RefreshInterceptor] path
// remains the backstop for clock skew or early expiry.
//
// This file uses this package's auth-session layer — [authStateProvider]
// (AsyncNotifierProvider<AuthSessionState>) and
// [quantMaxAuthRepositoryProvider] (Provider<QuantMaxAuthRepository> with
// `refreshSession()`) from `auth_providers.dart`, plus
// [AuthSignedOutException] from `auth_exceptions.dart` (thrown by
// `refreshSession()` on `invalid_grant`, after the repository cleared tokens
// itself).

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
// This package's auth-session layer (same directory): auth_providers.dart
// provides authStateProvider + quantMaxAuthRepositoryProvider +
// refreshMutexProvider; auth_exceptions.dart provides AuthSignedOutException
// (thrown by refreshSession() on invalid_grant, after the repository cleared
// tokens itself).
import 'auth_exceptions.dart';
import 'auth_providers.dart';

/// Factory creating a [Timer]; injectable so tests can use fake timers.
typedef TimerFactory = Timer Function(
    Duration duration, void Function() callback);

/// Schedules one proactive refresh per token issuance.
///
/// Call [noteTokensIssued] whenever a fresh token pair is stored (the
/// provider does this on every authenticated auth-state event). Re-arming
/// cancels the previous timer, so concurrent issuances never stack timers.
/// [cancel] disarms without firing; [dispose] disarms permanently.
class SilentRefreshScheduler {
  /// Minimum delay before a proactive refresh may fire. Guards against
  /// tight loops when `expiresIn - leeway` is tiny or negative.
  static const Duration minDelay = Duration(seconds: 30);

  final TimerFactory _timerFactory;
  Timer? _timer;
  bool _disposed = false;

  /// Creates the scheduler. [timerFactory] defaults to the real [Timer].
  SilentRefreshScheduler({TimerFactory? timerFactory})
      : _timerFactory = timerFactory ?? _defaultTimerFactory;

  static Timer _defaultTimerFactory(
          Duration duration, void Function() callback) =>
      Timer(duration, callback);

  /// Arms the scheduler: [onFire] runs once after `expiresIn - leeway`,
  /// floored to [minDelay]. Any previously armed timer is cancelled first.
  ///
  /// [expiresIn] is the access-token TTL as issued (900 s per the verified
  /// backend contract, `phase0/AUTH_CONTRACT.md` §1.8); [leeway] is how far
  /// before expiry the refresh should happen (`AppConfig.refreshLeeway`).
  void noteTokensIssued({
    required Duration expiresIn,
    required Duration leeway,
    required void Function() onFire,
  }) {
    if (_disposed) return;
    cancel();
    var delay = expiresIn - leeway;
    if (delay < minDelay) delay = minDelay;
    _timer = _timerFactory(delay, () {
      _timer = null;
      onFire();
    });
  }

  /// Disarms the scheduler without firing. Safe to call when idle.
  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  /// Disarms permanently; later [noteTokensIssued] calls are ignored.
  void dispose() {
    _disposed = true;
    cancel();
  }

  /// Whether a refresh timer is currently armed (test/diagnostic use).
  bool get isArmed => _timer?.isActive ?? false;
}

/// Proactive refresh wiring: arms [SilentRefreshScheduler] from the auth
/// stream and fires `QuantMaxAuthRepository.refreshSession()` ahead of
/// expiry, through the shared [RefreshMutex] single flight (S1).
///
/// Watches [authStateProvider] so the session notifier's lifecycle is bound
/// to this wiring, but arms from [TokenManager.onAuthStateChanged] (the
/// notifier does not expose expiry — see the file doc). Reading this
/// provider has no value; it exists for its side effect — read it once from
/// the app bootstrap.
final silentRefreshProvider = Provider<void>(
  (ref) {
    // Keep the session provider instantiated for the app's lifetime.
    ref.watch(authStateProvider);

    final tokenManager = ref.watch(tokenManagerProvider);
    final config = ref.watch(appConfigProvider);
    final mutex = ref.watch(refreshMutexProvider);
    final repository = ref.watch(quantMaxAuthRepositoryProvider);

    final scheduler = SilentRefreshScheduler();
    ref.onDispose(scheduler.dispose);

    Future<void> fire() async {
      // S1: run through the SHARED single flight. If a 401-triggered
      // refresh is already in flight, this joins it instead of firing a
      // second grant (rotation makes concurrent grants fatal).
      await mutex.runSingleFlight(() async {
        try {
          await repository.refreshSession();
        } on AuthSignedOutException {
          // invalid_grant: the repository already cleared tokens; the
          // stream emits unauthenticated and the scheduler is cancelled
          // below. No-op.
        } catch (_) {
          // Transient failure (network, 5xx): stay disarmed — the next
          // authenticated event re-arms, and the 401-reactive refresh path
          // remains the backstop. Deliberately swallowed, not retried here.
        }
      });
      // Success path: the repository persisted the rotated pair via
      // TokenManager.setTokens, which re-emits authenticated on the stream
      // below and re-arms the scheduler. Nothing else to do.
    }

    final subscription = tokenManager.onAuthStateChanged.listen((state) {
      if (state.isAuthenticated) {
        scheduler.noteTokensIssued(
          // Verified access TTL (AUTH_CONTRACT.md §1.8).
          // TODO(UNVERIFIED): confirm QuantMax shares the 900 s access TTL
          // once the app spec (`app-foundations/quantmax`) lands.
          expiresIn: const Duration(seconds: 900),
          leeway: config.refreshLeeway,
          onFire: () => unawaited(fire()),
        );
      } else {
        scheduler.cancel();
      }
    });
    ref.onDispose(subscription.cancel);
  },
  name: 'silentRefreshProvider',
);
