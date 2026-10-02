// ============================================================================
// chat_core - silent (proactive) token refresh (QuantChat, shift 1)
//
// Port of quantmail's `quant_core/.../auth/silent_refresh.dart`, adapted for
// QuantChat's auth contract (W3: `AuthRepository.refreshSession()` and
// `AuthSignedOutException` on `invalid_grant`).
//
// Two pieces:
//
//   - [SilentRefreshScheduler]: pure-Dart single-timer scheduler. Armed with
//     [SilentRefreshScheduler.noteTokensIssued]; fires [onFire] once at
//     `expiresIn - leeway` (floored to 30 s). No Riverpod, no chat_core
//     dependency — fully unit-testable with a fake [Timer] factory.
//   - [silentRefreshProvider]: Riverpod wiring. Listens to
//     [TokenManager.onAuthStateChanged]; on every authenticated event it arms
//     the scheduler, on unauthenticated it disarms. When the timer fires it
//     calls `AuthRepository.refreshSession()`; a successful refresh persists
//     the rotated pair via `TokenManager.setTokens`, which re-emits
//     authenticated on the stream and re-arms the scheduler — the loop is
//     self-sustaining. Timer leaks are prevented via `ref.onDispose`.
//
// Expiry source: the notifier does not expose token expiry, so the provider
// arms from the `TokenManager.onAuthStateChanged` stream with the access TTL
// from the SSO contract minus `AppConfig.refreshLeeway` (W3). The
// 401-reactive refresh interceptor remains the backstop for clock skew or
// early expiry.

import 'dart:async';

import 'package:quant_foundation/quant_foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import '../config/app_config.dart';
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
/// Watches [authSessionProvider] so the session notifier's lifecycle is
/// bound to this wiring, but arms from [TokenManager.onAuthStateChanged]
/// (the notifier does not expose expiry — see the file doc). Reading this
/// provider has no value; it exists for its side effect — read it once from
/// the app bootstrap.
final silentRefreshProvider = Provider<void>(
  (ref) {
    // Keep the session provider instantiated for the app's lifetime.
    ref.watch(authSessionProvider);

    final TokenManager tokenManager = ref.watch(tokenManagerProvider);
    final AppConfig config = ref.watch(appConfigProvider);

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

    final StreamSubscription<AuthState> subscription =
        tokenManager.onAuthStateChanged.listen((AuthState state) {
      if (state.isAuthenticated) {
        scheduler.noteTokensIssued(
          // TODO(UNVERIFIED): access TTL not yet verified against the
          // quantchat SSO backend; mirrors quantmail's verified 900 s.
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
