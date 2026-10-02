// ============================================================================
// quant_core - shared single-flight token refresh coordinator (S1)
// ============================================================================
//
// S1 RATIONALE — the refresh-race bug:
//
// Two independent refresh paths can fire concurrently:
//
//   1. the proactive [SilentRefreshScheduler] (silent_refresh.dart) calling
//      `AuthRepository.refreshSession()` ahead of expiry;
//   2. the reactive [RefreshInterceptor] (phase0 foundation) — production
//      transport here is the `tokenRefresher` delegate in
//      `core_providers.dart`'s `apiClientProvider` — calling the same
//      `refreshSession()` on a 401.
//
// Without coordination, both paths issue their own `POST /oauth/token`
// refresh call. The backend ROTATES refresh tokens (compare-and-set): the
// first call succeeds and revokes the presented token; the second call then
// presents the now-revoked token, which the backend treats as token reuse —
// the entire token FAMILY is revoked and the user is forced to sign in
// again. The fix: exactly ONE shared coordinator that both paths go
// through. Concurrent refresh attempts DEDUPE onto the same in-flight
// future, so there is exactly one refresh HTTP call per token family.
//
// Semantics are DEDUPE, not serialization: a caller that arrives while a
// refresh is in flight does NOT queue behind it — it receives the SAME
// future and observes the same outcome (success, transient failure, or
// `AuthSignedOutException`). Serialized retries would just burn the rotated
// pair and re-trigger the race; dedupe is the only correct shape here.

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Single-flight gate for token refresh HTTP calls.
///
/// One instance is shared app-wide (see [refreshCoordinatorProvider]); every
/// refresh entry point — the silent scheduler and the 401-reactive
/// interceptor delegate — runs its refresh task through [runSingleFlight].
class RefreshCoordinator {
  /// The in-flight refresh shared by concurrent callers.
  Future<void>? _inflight;

  /// Creates the coordinator.
  RefreshCoordinator();

  /// Runs [task], deduping concurrent calls onto the same in-flight future.
  ///
  /// If a refresh is already running, returns the SAME future — the caller
  /// observes the in-flight attempt's outcome (success, transient failure,
  /// or `AuthSignedOutException`) without issuing another HTTP call.
  /// Otherwise starts [task], publishes its future as the in-flight one,
  /// and returns it. The slot is cleared on completion (success or error),
  /// so a later refresh starts a fresh attempt.
  ///
  /// Errors propagate to every caller awaiting the shared future; the
  /// coordinator itself never swallows or retries.
  Future<void> runSingleFlight(Future<void> Function() task) {
    final inflight = _inflight;
    if (inflight != null) return inflight;
    final future = task();
    _inflight = future;
    // Clear the slot only if it is still this attempt — a later refresh may
    // already have published its own future (e.g. an error handler that
    // refreshes synchronously in `whenComplete` ordering edge cases).
    //
    // NOTE: `whenComplete` returns a DERIVED future. If the refresh fails,
    // that derived future completes with the same error and nobody listens
    // to it — an unhandled async error in the zone (caught by W2's wire
    // tests). The trailing `.then(..., onError: ...)` swallows the derived
    // future's error; waiters still observe the outcome on the ORIGINAL
    // future returned above, which is untouched.
    future.whenComplete(() {
      if (identical(_inflight, future)) _inflight = null;
    }).then<void>((_) {}, onError: (_) {});
    return future;
  }

  /// Whether a refresh is currently in flight (test/diagnostic use).
  bool get isRefreshInFlight => _inflight != null;
}

/// Shared single-flight refresh coordinator, app-lifetime (NOT autoDispose).
///
/// Both refresh entry points — the proactive silent-refresh scheduler and
/// the 401-reactive interceptor `tokenRefresher` delegate — read this single
/// provider, so concurrent silent-timer + 401 refreshes collapse into ONE
/// refresh HTTP call per token family (S1).
final refreshCoordinatorProvider = Provider<RefreshCoordinator>(
  (ref) => RefreshCoordinator(),
  name: 'refreshCoordinatorProvider',
);
