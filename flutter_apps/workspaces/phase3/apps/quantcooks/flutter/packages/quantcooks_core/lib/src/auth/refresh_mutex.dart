// ============================================================================
// quantcooks_core - shared single-flight token refresh mutex (S1)
// ============================================================================
//
// S1 RATIONALE — the refresh-race bug:
//
// Two independent refresh paths can fire concurrently:
//
//   1. the proactive [silentRefreshSchedulerProvider] (silent_refresh.dart)
//      calling `CooksAuthRepository.refreshSession()` ahead of expiry;
//   2. the reactive 401 path (to be added: a Dio refresh interceptor going
//      through this same mutex) calling `refreshSession()` on an expired
//      access token.
//
// Without coordination, both paths issue their own `POST /oauth/token`
// refresh call. The backend ROTATES refresh tokens (compare-and-set): the
// first call succeeds and revokes the presented token; the second call then
// presents the now-revoked token, which the backend treats as token reuse —
// the entire token FAMILY is revoked and the user is forced to sign in
// again. The fix: exactly ONE shared mutex that every refresh entry point
// goes through. Concurrent refresh attempts DEDUPE onto the same in-flight
// future, so there is exactly one refresh HTTP call per token family.
//
// Semantics are DEDUPE, not serialization: a caller that arrives while a
// refresh is in flight does NOT queue behind it — it receives the SAME
// future and observes the same outcome (success, transient failure, or
// `CooksSignedOutException`). Serialized retries would just burn the rotated
// pair and re-trigger the race; dedupe is the only correct shape here.
//
// Koi endpoint invent mat karo — this file does NO networking; it only
// coordinates calls into `CooksAuthRepository.refreshSession()`.

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Single-flight gate for token refresh calls.
///
/// One instance is shared app-wide (see [refreshMutexProvider]); every
/// refresh entry point — the silent scheduler and the future 401-reactive
/// interceptor delegate — runs its refresh task through [runSingleFlight].
class RefreshMutex {
  /// The in-flight refresh shared by concurrent callers.
  Future<void>? _inflight;

  /// Creates the mutex.
  RefreshMutex();

  /// Runs [task], deduping concurrent calls onto the same in-flight future.
  ///
  /// If a refresh is already running, returns the SAME future — the caller
  /// observes the in-flight attempt's outcome (success, transient failure,
  /// or `CooksSignedOutException`) without issuing another HTTP call.
  /// Otherwise starts [task], publishes its future as the in-flight one,
  /// and returns it. The slot is cleared on completion (success or error),
  /// so a later refresh starts a fresh attempt.
  ///
  /// Errors propagate to every caller awaiting the shared future; the
  /// mutex itself never swallows or retries.
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
    // to it — an unhandled async error in the zone. The trailing
    // `.then(..., onError: ...)` swallows the derived future's error;
    // waiters still observe the outcome on the ORIGINAL future returned
    // above, which is untouched.
    future.whenComplete(() {
      if (identical(_inflight, future)) _inflight = null;
    }).then<void>((_) {}, onError: (_) {});
    return future;
  }

  /// Whether a refresh is currently in flight (test/diagnostic use).
  bool get isRefreshInFlight => _inflight != null;
}

/// Shared single-flight refresh mutex, app-lifetime (NOT autoDispose).
///
/// Every refresh entry point — the proactive silent-refresh scheduler and
/// the future 401-reactive interceptor — reads this single provider, so
/// concurrent silent-timer + 401 refreshes collapse into ONE refresh HTTP
/// call per token family (S1).
final refreshMutexProvider = Provider<RefreshMutex>(
  (ref) => RefreshMutex(),
  name: 'refreshMutexProvider',
);
