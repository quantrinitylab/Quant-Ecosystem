// ============================================================================
// gram_core - silent (proactive) token refresh
// ============================================================================
//
// Copy-adapt of phase1 `quant_core`'s silent_refresh, with two changes:
//
// 1. **F2 fix** (qa-hardening 2026-10-03): the scheduler is injectable at the
//    PROVIDER level, not just the constructor level. [silentRefreshSchedulerProvider]
//    is a plain `Provider<SilentRefreshScheduler>` that tests override with a
//    fake-timer instance; the wiring provider reads it instead of
//    constructing one. The constructor-level [TimerFactory] seam is kept too,
//    so both seams are available.
// 2. **S1 fix**: the refresh call goes through `AuthRepository.refreshSession`,
//    which funnels every refresh through the app-wide [RefreshMutex] — the
//    silent timer and the 401 interceptor can never fire concurrent refresh
//    grants (rotation family-revocation → forced sign-out).
//
// Design:
//
//   - [SilentRefreshScheduler]: pure-Dart single-timer scheduler. Armed with
//     [SilentRefreshScheduler.noteTokensIssued]; fires [onFire] once at
//     `expiresIn - leeway` (floored to 30 s). No Riverpod — fully
//     unit-testable with a fake [TimerFactory].
//   - [silentRefreshSchedulerProvider]: override-friendly provider for the
//     scheduler (F2).
//   - [silentRefreshProvider]: Riverpod wiring. Listens to
//     [TokenManager.onAuthStateChanged]; on every authenticated event it arms
//     the scheduler, on unauthenticated it disarms. When the timer fires it
//     calls `AuthRepository.refreshSession()`; a successful refresh persists
//     the rotated pair via `TokenManager.setTokens`, which re-emits
//     authenticated on the stream and re-arms the scheduler — the loop is
//     self-sustaining. Timer leaks are prevented via `ref.onDispose`.
//
// Expiry source: the auth-state stream carries no expiry, so the provider
// arms from the verified access TTL (900 s, `phase0/AUTH_CONTRACT.md` §1.8 —
// QuantGram uses the same QuantMail SSO backend) minus `AppConfig.refreshLeeway`.
// The 401-reactive [RefreshInterceptor] path remains the backstop for clock
// skew or early expiry.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  /// backend contract); [leeway] is how far before expiry the refresh should
  /// happen (`AppConfig.refreshLeeway`).
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

/// Injectable scheduler instance (F2 testability fix).
///
/// Tests override this provider with a [SilentRefreshScheduler] built on a
/// fake [TimerFactory] to deterministically drive [silentRefreshProvider]'s
/// fire path (success / [AuthSignedOutException] swallow / transient catch).
/// The wiring provider disposes the scheduler via `ref.onDispose`.
final silentRefreshSchedulerProvider = Provider<SilentRefreshScheduler>(
  (ref) {
    final scheduler = SilentRefreshScheduler();
    ref.onDispose(scheduler.dispose);
    return scheduler;
  },
  name: 'silentRefreshSchedulerProvider',
);

/// Proactive refresh wiring: arms [SilentRefreshScheduler] from the auth
/// stream and fires `AuthRepository.refreshSession()` ahead of expiry.
///
/// The refresh call is mutex-guarded inside the repository (S1): if a 401
/// interceptor refresh is already in-flight, this path joins it instead of
/// firing a second grant.
///
/// Watches [authSessionProvider] so the session notifier's lifecycle is bound
/// to this wiring, but arms from [TokenManager.onAuthStateChanged] (the
/// notifier does not expose expiry). Reading this provider has no value; it
/// exists for its side effect — read it once from the app bootstrap.
final silentRefreshProvider = Provider<void>(
  (ref) {
    // Keep the session provider instantiated for the app's lifetime.
    ref.watch(authSessionProvider);

    final tokenManager = ref.watch(tokenManagerProvider);
    final scheduler = ref.watch(silentRefreshSchedulerProvider);
    final config = ref.watch(appConfigProvider);

    Future<void> fire() async {
      try {
        // Mutex-guarded inside the repository (S1): concurrent 401-triggered
        // refreshes share this attempt instead of racing it.
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
          // Verified access TTL (AUTH_CONTRACT.md §1.8); QuantGram shares
          // the QuantMail SSO backend.
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
