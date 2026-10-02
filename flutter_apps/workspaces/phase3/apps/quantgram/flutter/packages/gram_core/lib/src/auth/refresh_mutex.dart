// ============================================================================
// gram_core - refresh mutex (single-flight async guard)
// ============================================================================
//
// NEW in QuantGram shift 1 — fixes security finding **S1** (board,
// security-audit 2026-10-03 ~00:55 IST):
//
//   silent-refresh timer  <──┐
//                            ├──▶ concurrent refresh calls ──▶ backend ROTATES
//   401 interceptor       <──┘    (two network refreshes)        the pair per
//                                                          call ──▶ the slower
//   response's refresh token is already SUPERSEDED ──▶ backend sees reuse ──▶
//   ROTATION FAMILY REVOCATION ──▶ forced sign-out for a healthy session.
//
// [RefreshMutex] makes every refresh path in the app share ONE in-flight
// attempt: the first caller performs the network refresh, every concurrent
// caller awaits the SAME future and observes the same outcome. Both the
// proactive [SilentRefreshScheduler] path (via `AuthRepository.refreshSession`)
// and the reactive [RefreshInterceptor] 401 path (via the same repository
// method) funnel through the single app-wide instance from
// [refreshMutexProvider], so the race cannot happen.
//
// Contrast with the phase0 foundation's interceptor-local `_inflightRefresh`
// future: that deduped only 401-triggered refreshes *within one interceptor
// instance* and knew nothing about the silent-refresh timer. The mutex lives
// one layer up (in the repository) so ALL refresh triggers share it.

import 'dart:async';

/// Single-flight guard for token refresh.
///
/// [run] executes [action] at most once at a time: while an action is
/// in-flight, further [run] calls return the SAME future instead of starting
/// a new action. When the in-flight action completes (success or error), the
/// slot clears and the next [run] starts a fresh attempt.
///
/// Error semantics: the outcome — value or error — is shared with every
/// waiter. Each caller handles failures per its own path (the 401
/// interceptor clears tokens + notifies; the silent-refresh timer swallows
/// transient errors and stays armed).
///
/// Re-entrancy: [action] must NOT call [run] on the same mutex (it would
/// await its own in-flight future forever). The repository owns the single
/// mutex call site for refresh; the interceptor and the silent-refresh path
/// both go through the repository, never through the mutex directly.
class RefreshMutex {
  Future<dynamic>? _inflight;

  /// Runs [action] under the single-flight guard, returning the shared
  /// future while an action is already in-flight.
  Future<T> run<T>(Future<T> Function() action) {
    final inflight = _inflight;
    if (inflight != null) {
      // A refresh is already running — join it instead of firing another
      // network call (this is the S1 fix).
      return inflight as Future<T>;
    }
    // The try/finally lives INSIDE the future (not a discarded
    // `whenComplete` chain) so the cleanup cannot produce an unhandled
    // async error when the action throws — the error propagates to the
    // awaited future normally, observed by every waiter.
    late final Future<T> future;
    future = Future<T>(() async {
      try {
        return await action();
      } finally {
        if (identical(_inflight, future)) _inflight = null;
      }
    });
    _inflight = future;
    return future;
  }

  /// Whether a refresh is currently in-flight (diagnostic / test use).
  bool get isInFlight => _inflight != null;
}
