// ============================================================================
// gram_core - Retry interceptor (dual-schedule backoff)
// ============================================================================
//
// Copy-adapt of `quant_foundation`'s retry interceptor, with the PERF-1 fix
// (perf-budget 2026-10-03 ~01:05 IST):
//
//   Phase0 applied the web-outbox schedule `[0s, 1s, 4s, 15s, 60s]` to EVERY
//   idempotent request — a transient 5xx on an interactive GET (feed page,
//   search, thread open) could stall the UI for up to ~80 s, blowing every
//   interaction budget.
//
//   Now two schedules:
//   - INTERACTIVE (default): `[0ms, 200ms, 800ms]` — fail fast, surface the
//     error to UI (which shows cached content / retry affordance) instead of
//     hanging the scroll.
//   - BACKGROUND: `[0s, 1s, 4s, 15s, 60s]` (the web-outbox schedule, faithful,
//     no jitter) — for sync/outbox-style work that must eventually succeed.
//
// A request opts into the background schedule with
// `extra[kBackgroundRequestExtraKey] = true` (see [backgroundRequest]).
// Everything else is interactive.

import 'package:dio/dio.dart';

import 'auth_interceptor.dart';

/// RequestOptions extra key: set to `true` to opt a request out of backoff
/// retry (used by auth endpoints — those must fail fast).
const String kNoRetryExtraKey = 'gram_no_retry';

/// RequestOptions extra key tracking how many backoff retries have already
/// been performed for this request.
const String kRetryCountExtraKey = 'gram_retry_count';

/// RequestOptions extra key: set to `true` to use the BACKGROUND backoff
/// schedule (sync, outbox drains, prefetch). Default (absent/false) is the
/// INTERACTIVE schedule.
const String kBackgroundRequestExtraKey = 'gram_background';

/// HTTP methods considered idempotent and therefore safe to retry.
const Set<String> kIdempotentMethods = {'GET', 'HEAD', 'PUT', 'DELETE'};

/// Interactive backoff (PERF-1): `delays[i]` is the wait before retry `i`.
/// Total worst-case stall ≈ 1 s — the UI stays responsive and surfaces the
/// error (cached content + retry affordance) instead of hanging.
const List<Duration> kInteractiveBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(milliseconds: 200), // retry #1
  Duration(milliseconds: 800), // retry #2: last retry, then give up
];

/// Background backoff: the web-outbox `RETRY_BACKOFF_MS` schedule verbatim
/// (`apps/quantmail/src/lib/offline/outbox.ts`), for sync/outbox work that
/// must eventually succeed. `delays[i]` is the wait before retry `i`.
const List<Duration> kBackgroundBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(seconds: 1), // retry #1
  Duration(seconds: 4), // retry #2
  Duration(seconds: 15), // retry #3
  Duration(seconds: 60), // retry #4: last retry, then give up
];

/// Retries idempotent requests on transient failures with backoff.
///
/// Retried: HTTP 5xx, connect/send/receive timeouts, connection errors and
/// other transport failures (`DioExceptionType.unknown`).
///
/// NOT retried (deliberate):
/// - 401: owned by [RefreshInterceptor] (its onError runs before this one —
///   see GramApiClient for the registration order);
/// - other 4xx: client errors are not transient;
/// - 429: no `Retry-After` handling yet — retrying blindly risks worsening a
///   rate-limit; TODO: honor `Retry-After` when the backend contract confirms it;
/// - non-idempotent methods (POST/PATCH): never retried automatically;
/// - requests marked with [kNoRetryExtraKey].
class RetryInterceptor extends Interceptor {
  final Dio _dio;

  /// Override the backoff schedules. Length of each list = max retries for
  /// that class. Defaults: [kInteractiveBackoff] / [kBackgroundBackoff].
  final List<Duration> interactiveBackoff;
  final List<Duration> backgroundBackoff;

  /// Creates the retry interceptor. [dio] re-issues retried requests.
  RetryInterceptor({
    required Dio dio,
    this.interactiveBackoff = kInteractiveBackoff,
    this.backgroundBackoff = kBackgroundBackoff,
  }) : _dio = dio;

  /// Pure helper: the delay before retry number [retryIndex] on [schedule],
  /// or null when the schedule is exhausted. Kept static for unit testing.
  static Duration? delayForRetry(int retryIndex, List<Duration> schedule) {
    if (retryIndex < 0 || retryIndex >= schedule.length) return null;
    return schedule[retryIndex];
  }

  /// Whether [options] opts into the background schedule.
  static bool isBackgroundRequest(RequestOptions options) =>
      options.extra[kBackgroundRequestExtraKey] == true;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRetryable(err)) {
      handler.next(err);
      return;
    }

    final schedule = isBackgroundRequest(options)
        ? backgroundBackoff
        : interactiveBackoff;
    final retryCount = (options.extra[kRetryCountExtraKey] as int?) ?? 0;
    final delay = delayForRetry(retryCount, schedule);
    if (delay == null) {
      // Schedule exhausted: propagate the last error (outbox: "out of
      // patience — surface it rather than retrying forever").
      handler.next(err);
      return;
    }

    if (delay > Duration.zero) {
      await Future<void>.delayed(delay);
    }

    final retryOptions = options.copyWith();
    retryOptions.extra[kRetryCountExtraKey] = retryCount + 1;

    try {
      final response = await _dio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryErr) {
      handler.next(retryErr);
    }
  }

  bool _isRetryable(DioException err) {
    final options = err.requestOptions;

    if (options.extra[kNoRetryExtraKey] == true) return false;
    if (options.extra[kSkipAuthExtraKey] == true) return false;
    if (!kIdempotentMethods.contains(options.method.toUpperCase())) {
      return false;
    }

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return true;
      case DioExceptionType.badResponse:
        final status = err.response?.statusCode ?? 0;
        return status >= 500 && status <= 599;
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
        return false;
    }
  }
}

/// Marks [options] as a background request (sync/outbox/prefetch): the
/// [kBackgroundBackoff] schedule applies instead of the interactive one.
RequestOptions backgroundRequest(RequestOptions options) {
  options.extra[kBackgroundRequestExtraKey] = true;
  return options;
}
