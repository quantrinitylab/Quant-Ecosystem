// ============================================================================
// quant_foundation - Retry interceptor (idempotent 5xx/network retry)
// ============================================================================
//
// Two backoff schedules:
//
// - [kInteractiveRetryBackoff] (default): interactive requests — inbox list,
//   thread, search, auth-adjacent GETs. Added by PERF-1: the web-outbox
//   schedule below used to apply to ALL idempotent requests, so a transient
//   5xx on an interactive GET stalled the UI up to 60 s, blowing the
//   interactive budgets. The interactive schedule caps the worst-case added
//   stall at ~1 s.
// - [kRetryBackoff]: BACKGROUND/sync/outbox work only. Taken verbatim from
//   the web outbox (`apps/quantmail/src/lib/offline/outbox.ts`):
//   RETRY_BACKOFF_MS = [0, 1_000, 4_000, 15_000, 60_000]
//   indexed by the number of retries already performed; when the schedule is
//   exhausted the last error propagates. No jitter (faithful to the outbox).

import 'package:dio/dio.dart';

import 'auth_interceptor.dart';

/// RequestOptions extra key: set to `true` to opt a request out of backoff
/// retry (used by the refresh call and auth endpoints — those must fail fast).
const String kNoRetryExtraKey = 'quant_no_retry';

/// RequestOptions extra key tracking how many backoff retries have already
/// been performed for this request.
const String kRetryCountExtraKey = 'quant_retry_count';

/// RequestOptions extra key: set to `true` to opt a request IN to the long
/// background backoff ([kRetryBackoff]). Sync/outbox-style work — drift sync,
/// outbox drain, prefetch — sets this flag so transient failures retry on
/// the patient web-outbox schedule instead of the interactive one.
const String kBackgroundRetryExtraKey = 'quant_background_retry';

/// HTTP methods considered idempotent and therefore safe to retry.
const Set<String> kIdempotentMethods = {'GET', 'HEAD', 'PUT', 'DELETE'};

/// Backoff delays for INTERACTIVE requests (the default schedule), indexed
/// by retry count. `delays[i]` is the wait before retry number `i`.
///
/// PERF-1: a transient 5xx on an interactive GET used to stall the UI up to
/// 60 s (the old default). This schedule caps the worst-case added latency
/// at ~1 s (immediate + 200 ms + 800 ms across two retries), protecting the
/// interactive budgets:
///
/// | Surface        | p50 budget | p99 budget |
/// |----------------|------------|------------|
/// | Inbox list     | <300 ms    | <600 ms    |
/// | Search         | <100 ms    | <250 ms    |
/// | Cached thread  | <50 ms     | <150 ms    |
const List<Duration> kInteractiveRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(milliseconds: 200), // retry #1
  Duration(milliseconds: 800), // retry #2: last retry, then give up
];

/// Backoff delays indexed by retry count, mirroring the web outbox
/// `RETRY_BACKOFF_MS`. `delays[i]` is the wait before retry number `i`.
///
/// BACKGROUND/sync/outbox work ONLY — set [kBackgroundRetryExtraKey] on the
/// request, or construct [RetryInterceptor] with this schedule explicitly.
/// Never the default: interactive requests use [kInteractiveRetryBackoff].
const List<Duration> kRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(seconds: 1), // retry #1
  Duration(seconds: 4), // retry #2
  Duration(seconds: 15), // retry #3
  Duration(seconds: 60), // retry #4: last retry, then give up
];

/// Retries idempotent requests on transient failures with exponential backoff.
///
/// Schedule selection (PERF-1): requests default to the short
/// [kInteractiveRetryBackoff] so a transient 5xx on inbox/thread/search
/// stalls the UI by ~1 s at most — never the 60 s the old single schedule
/// could add. Set `options.extra[kBackgroundRetryExtraKey] = true` on
/// sync/outbox work (drift sync, outbox drain, prefetch) to use the long
/// [kRetryBackoff] instead.
///
/// Retried: HTTP 5xx, connect/send/receive timeouts, connection errors and
/// other transport failures (`DioExceptionType.unknown`).
///
/// NOT retried (deliberate):
/// - 401: owned by [RefreshInterceptor] (registered after this one so its
///   onError runs first);
/// - other 4xx: client errors are not transient;
/// - 429: no `Retry-After` handling yet — retrying blindly risks worsening a
///   rate-limit; TODO: honor `Retry-After` when the backend contract confirms it;
/// - non-idempotent methods (POST/PATCH): never retried automatically;
/// - requests marked with [kNoRetryExtraKey].
class RetryInterceptor extends Interceptor {
  final Dio _dio;

  /// Backoff schedule for interactive requests (defaults to
  /// [kInteractiveRetryBackoff]). Length of the list = max number of retries.
  /// Requests flagged with [kBackgroundRetryExtraKey] use [kRetryBackoff]
  /// instead, regardless of this value.
  final List<Duration> backoff;

  /// Creates the retry interceptor. [dio] re-issues retried requests;
  /// [backoff] overrides the default interactive schedule.
  RetryInterceptor({required Dio dio, this.backoff = kInteractiveRetryBackoff})
      : _dio = dio;

  /// Pure helper: the delay before retry number [retryIndex], or null when
  /// the schedule is exhausted. Kept static for unit testing. Defaults to
  /// the background/outbox schedule ([kRetryBackoff]) — the schedule the web
  /// outbox defines; pass [kInteractiveRetryBackoff] (or a custom list)
  /// explicitly to probe another path.
  static Duration? delayForRetry(int retryIndex, [List<Duration>? schedule]) {
    final delays = schedule ?? kRetryBackoff;
    if (retryIndex < 0 || retryIndex >= delays.length) return null;
    return delays[retryIndex];
  }

  /// Resolves the schedule for one request: [kRetryBackoff] when the request
  /// opted in with [kBackgroundRetryExtraKey], otherwise [backoff] (the
  /// interactive default). Extracted for unit testing.
  List<Duration> scheduleForRequest(RequestOptions options) =>
      options.extra[kBackgroundRetryExtraKey] == true ? kRetryBackoff : backoff;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRetryable(err)) {
      handler.next(err);
      return;
    }

    final retryCount = (options.extra[kRetryCountExtraKey] as int?) ?? 0;
    final delay = delayForRetry(retryCount, scheduleForRequest(options));
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
