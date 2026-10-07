// ============================================================================
// quantmax_core - shared refresh single-flight mutex (S1)
// ============================================================================
//
// SECURITY S1: the silent (proactive) refresh path and the 401-reactive
// [RefreshInterceptor] path BOTH perform `POST /oauth/token` with the stored
// refresh token. Without coordination, a timer firing at the same moment as
// a 401 produces TWO concurrent refresh grants — the backend ROTATES refresh
// tokens (compare-and-set), so the second grant presents an already-revoked
// token and triggers family revocation: the whole session dies and the user
// is signed out spuriously.
//
// [RefreshMutex] is the ONE shared single-flight primitive for this package:
// - `RefreshInterceptor` runs its 401 refresh through it, and
// - `silentRefreshProvider`'s timer callback runs its proactive refresh
//   through it.
// Concurrent callers share the in-flight attempt instead of each firing their
// own grant. The mutex is app-lifetime scoped via `refreshMutexProvider`
// (auth_providers.dart); the API client takes the same instance so the
// interceptor participates in the shared flight.

import 'dart:async';

/// Single-flight guard for token-refresh attempts.
///
/// The first caller runs [task]; any caller arriving while it is in flight
/// awaits the SAME future and receives the same result. The slot is cleared
/// when the attempt settles, so a later refresh starts a fresh attempt.
///
/// Errors from [task] propagate to all waiters (including the initiator) —
/// callers are expected to handle them (the interceptor maps failure to
/// clear-tokens + onAuthFailure; silent refresh swallows transients).
class RefreshMutex {
  /// The currently in-flight refresh attempt, if any.
  Future<dynamic>? _inflight;

  /// Runs [task] as a single flight: concurrent callers share one attempt.
  ///
  /// [task] must never throw synchronously (wrap async work in the future);
  /// asynchronous errors propagate to every waiter.
  Future<T> runSingleFlight<T>(Future<T> Function() task) {
    final inflight = _inflight;
    if (inflight != null) {
      // A refresh is already in flight — join it instead of firing another
      // grant (rotation makes a second concurrent grant fatal to the session).
      return inflight as Future<T>;
    }
    final future = task();
    _inflight = future;
    // Clear the slot when the attempt settles so the next refresh (after a
    // later 401 or timer fire) starts fresh. `identical` guards against a
    // newer flight having replaced this one.
    future.whenComplete(() {
      if (identical(_inflight, future)) _inflight = null;
    });
    return future;
  }

  /// Whether a refresh attempt is currently in flight (diagnostic use).
  bool get isRefreshing => _inflight != null;
}
