// ============================================================================
// quant_wave_core - silent (proactive) token refresh
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
//     calls `AuthRepository.refreshSession()`; a successful refresh persists
//     the rotated pair via `TokenManager.setTokens`, which re-emits
//     authenticated on the stream and re-arms the scheduler — the loop is
//     self-sustaining. Timer leaks are prevented via `ref.onDispose`.
//
// Expiry source: the session notifier does not expose token expiry, so the
// provider arms from the `TokenManager.onAuthStateChanged` stream and the
// VERIFIED access TTL (900 s, `phase0/AUTH_CONTRACT.md` §1.8) minus
// `AppConfig.refreshLeeway`. The 401-reactive [RefreshInterceptor] path
// remains the backstop for clock skew or early expiry.
//
// S1: `AuthRepository.refreshSession()` runs under the shared [RefreshMutex],
// so a proactive refresh can never run concurrently with the 401-reactive
// refresh — no race into rotation family-revocation.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:quant_wave_core/src/auth/auth_exceptions.dart';
import 'package:quant_wave_core/src/auth/auth_providers.dart';
import 'package:quant_wave_core/src/providers/core_providers.dart';

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
/// stream and fires `AuthRepository.refreshSession()` ahead of expiry.
///
/// Instantiates [authSessionProvider] (via `ref.read`) so the session
/// notifier's lifecycle spans the app, but arms from
/// [TokenManager.onAuthStateChanged] (the notifier does not expose expiry —
/// see the file doc). Reading this provider has no value; it exists for its
/// side effect — read it once from the app bootstrap.
final silentRefreshProvider = Provider<void>(
  (ref) {
    // Keep the session provider instantiated for the app's lifetime.
    // NOTE: ref.read (not ref.watch) on purpose — this wiring provider exists
    // purely for its side effect and must not rebuild/dispose when the
    // session notifier invalidates itself (e.g. during refresh/sign-out):
    // rebuilds would tear down the scheduler + stream subscription mid-flight.
    ref.read(authSessionProvider);

    final tokenManager = ref.watch(tokenManagerProvider);
    final config = ref.watch(appConfigProvider);

    final scheduler = SilentRefreshScheduler();
    ref.onDispose(scheduler.dispose);

    Future<void> fire() async {
      try {
        await ref.read(authRepositoryProvider).refreshSession();
        // Success path: the repository persisted the rotated pair via
        // TokenManager.setTokens, which re-emits authenticated on the
        // stream below and re-arms the scheduler. Nothing else to do.
      } on AuthSignedOutException {
        // invalid_grant: the repository already cleared tokens; the stream
        // emits unauthenticated and the scheduler is cancelled below. No-op.
      } catch (_) {
        // Transient failure (network, 5xx): stay armed — the next expiry
        // fires another attempt, and the 401-reactive refresh path remains
        // the backstop. Deliberately swallowed, not retried here.
      }
    }

    final subscription = tokenManager.onAuthStateChanged.listen((state) {
      if (state.isAuthenticated) {
        scheduler.noteTokensIssued(
          // Verified access TTL (AUTH_CONTRACT.md §1.8).
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
