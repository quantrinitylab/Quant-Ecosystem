// ============================================================================
// quantcooks_core - silent (proactive) token refresh
// ============================================================================
//
// Two pieces:
//
//   - [SilentRefreshScheduler]: pure-Dart single-timer scheduler. Armed with
//     [SilentRefreshScheduler.noteTokensIssued]; fires [onFire] once at
//     `expiresIn - leeway` (floored to 30 s). No Riverpod, no W2 dependency —
//     fully unit-testable with a fake [TimerFactory].
//   - [silentRefreshSchedulerProvider]: Riverpod wiring. Listens to
//     [TokenManager.onAuthStateChanged]; on every authenticated event it arms
//     the scheduler, on unauthenticated it disarms. When the timer fires it
//     calls `CooksAuthRepository.refreshSession()` through the shared
//     [refreshMutexProvider] (S1 single-flight); a successful refresh
//     persists the rotated pair via `TokenManager.setTokens`, which re-emits
//     authenticated on the stream and re-arms the scheduler — the loop is
//     self-sustaining. Timer leaks are prevented via `ref.onDispose`.
//
// Expiry source:
//   TODO(UNVERIFIED): the foundation [TokenManager] exposes only token
//   VALUES and the auth-state broadcast ([AuthState] carries status +
//   accessToken, no `expiresAt`/`expiresIn`). Until the foundation publishes
//   expiry, the scheduler arms from the VERIFIED access TTL (900 s,
//   `phase0/AUTH_CONTRACT.md` §5, restated on `CooksConfig.refreshLeeway`)
//   minus `CooksConfig.refreshLeeway`. The 401-reactive refresh path (going
//   through the same [RefreshMutex]) remains the backstop for clock skew or
//   early expiry.
//
// W2 CONTRACT: this file uses W2's auth-session layer from this same
// directory — `cooksAuthSessionProvider`
// (AsyncNotifierProvider<CooksAuthSessionState>) and
// `cooksAuthRepositoryProvider` (Provider<CooksAuthRepository> with
// `refreshSession()`) from `cooks_auth_providers.dart`, plus
// [CooksSignedOutException] from `cooks_auth_exceptions.dart` (thrown by
// `refreshSession()` on `invalid_grant`, after the repository cleared tokens
// itself).

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'cooks_auth_exceptions.dart';
import 'cooks_auth_providers.dart';
import 'refresh_mutex.dart';

/// Factory creating a [Timer]; injectable so tests can use fake timers.
typedef TimerFactory = Timer Function(
    Duration duration, void Function() callback);

/// Override-friendly timer factory for the silent-refresh scheduler.
///
/// App-lifetime (not autoDispose): tests override this provider with a fake
/// [TimerFactory] to control when [SilentRefreshScheduler] fires without
/// touching the scheduler's internals. The default is the real [Timer].
final silentRefreshTimerFactoryProvider = Provider<TimerFactory>(
  (ref) => (Duration d, void Function() cb) => Timer(d, cb),
  name: 'silentRefreshTimerFactoryProvider',
);

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
  /// backend contract — see the file doc); [leeway] is how far before expiry
  /// the refresh should happen (`CooksConfig.refreshLeeway`).
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
/// stream and fires `CooksAuthRepository.refreshSession()` ahead of expiry.
///
/// Reads [cooksAuthSessionProvider] once so the session notifier is
/// instantiated for the app's lifetime (deliberately `read`, not `watch` —
/// see the invalidation note inside). Reading this provider has no value;
/// it exists for its side effect — read it once from the app bootstrap.
final silentRefreshSchedulerProvider = Provider<void>(
  (ref) {
    // Keep W2's session provider instantiated for the app's lifetime.
    //
    // NOTE: this MUST be ref.read, not ref.watch. Watching would register an
    // invalidation dependency: when the notifier's async build() completes
    // (hydrate -> AsyncData), Riverpod invalidates this provider and disposes
    // the scheduler subscription below — silently killing proactive refresh
    // with no further read to rebuild it. Neither provider is autoDispose, so
    // a single read keeps it alive for the container's lifetime.
    ref.read(cooksAuthSessionProvider);

    final tokenManager = ref.watch(cooksTokenManagerProvider);
    final config = ref.watch(appConfigProvider);

    final scheduler = SilentRefreshScheduler(
      timerFactory: ref.watch(silentRefreshTimerFactoryProvider),
    );
    ref.onDispose(scheduler.dispose);

    Future<void> fire() async {
      try {
        // S1: go through the shared single-flight mutex so a silent
        // refresh racing a 401-triggered refresh collapses into ONE HTTP
        // call per token family (backend rotates refresh tokens — a second
        // concurrent call would present the revoked token and kill the
        // whole family, forcing sign-out).
        //
        // NOTE: ref.read (NOT watch) inside this fire callback — a provider
        // invalidation must never silently disarm the scheduler.
        await ref.read(refreshMutexProvider).runSingleFlight(
              () => ref.read(cooksAuthRepositoryProvider).refreshSession(),
            );
        // Success path: the repository persisted the rotated pair via
        // TokenManager.setTokens, which re-emits authenticated on the
        // stream below and re-arms the scheduler. Nothing else to do.
      } on CooksSignedOutException {
        // invalid_grant: the repository already cleared tokens; the stream
        // emits unauthenticated and the scheduler is cancelled below. The
        // session ended — swallow and disarm.
        scheduler.cancel();
      } catch (_) {
        // Transient failure (network, 5xx): swallow. Stay disarmed until
        // the next token issuance re-arms; the 401-reactive refresh path
        // remains the backstop. Deliberately not retried here.
      }
    }

    final subscription = tokenManager.onAuthStateChanged.listen((state) {
      if (state.isAuthenticated) {
        scheduler.noteTokensIssued(
          // TODO(UNVERIFIED): foundation TokenManager does not expose
          // token expiry; arming from the VERIFIED access TTL (900 s,
          // phase0/AUTH_CONTRACT.md §5) minus leeway until it does.
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
  name: 'silentRefreshSchedulerProvider',
);
