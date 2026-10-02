// ============================================================================
// quant_wave_core - Retry interceptor (idempotent 5xx/network retry)
// ============================================================================
//
// Retries transient failures on idempotent requests with backoff.
//
// PERF-1: the DEFAULT schedule is the short interactive one
// ([kInteractiveRetryBackoff]: [0, 200ms, 800ms]) — interactive timeline
// requests must fail fast rather than stall the UI for a minute. The long
// web-outbox schedule ([0, 1s, 4s, 15s, 60s]) is reserved for
// background/sync requests, which opt in via [kBackgroundRequestExtraKey].

import 'package:dio/dio.dart';

import 'auth_interceptor.dart';

/// RequestOptions extra key: set to `true` to opt a request out of backoff
/// retry (used by the refresh call and auth endpoints — those must fail fast).
const String kNoRetryExtraKey = 'quant_no_retry';

/// RequestOptions extra key tracking how many backoff retries have already
/// been performed for this request.
const String kRetryCountExtraKey = 'quant_retry_count';

/// RequestOptions extra key: set to `true` to mark a request as
/// background/sync so it uses [kBackgroundRetryBackoff] instead of the
/// interactive schedule.
///
/// TODO: the interactive-vs-background classification is provisional — no
/// call sites mark this yet, so everything currently gets the interactive
/// schedule. Audit call sites once the sync engine lands.
const String kBackgroundRequestExtraKey = 'quant_background_request';

/// HTTP methods considered idempotent and therefore safe to retry.
const Set<String> kIdempotentMethods = {'GET', 'HEAD', 'PUT', 'DELETE'};

/// Backoff schedule for interactive requests (PERF-1): fail fast, keep the
/// UI responsive. `delays[i]` is the wait before retry number `i`.
const List<Duration> kInteractiveRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(milliseconds: 200), // retry #1
  Duration(milliseconds: 800), // retry #2: last retry, then give up
];

/// Default retry schedule — the interactive one (PERF-1).
const List<Duration> kRetryBackoff = kInteractiveRetryBackoff;

/// Long backoff reserved for background/sync requests (the legacy web-outbox
/// `RETRY_BACKOFF_MS` schedule, verbatim). Opt in per request with
/// [kBackgroundRequestExtraKey].
const List<Duration> kBackgroundRetryBackoff = [
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
/// - 401: owned by [RefreshInterceptor] (registered after this one so its
///   onError runs first);
/// - other 4xx: client errors are not transient;
/// - 429: no `Retry-After` handling yet — retrying blindly risks worsening a
///   rate-limit; TODO: honor `Retry-After` when the backend contract confirms it;
/// - non-idempotent methods (POST/PATCH): never retried automatically;
/// - requests marked with [kNoRetryExtraKey].
class RetryInterceptor extends Interceptor {
  final Dio _dio;

  /// Override the backoff schedule (defaults to [kRetryBackoff], the
  /// interactive PERF-1 schedule). Length of the list = max number of
  /// retries. Requests marked with [kBackgroundRequestExtraKey] use
  /// [kBackgroundRetryBackoff] instead.
  final List<Duration> backoff;

  /// Creates the retry interceptor. [dio] re-issues retried requests;
  /// [backoff] overrides the default interactive schedule.
  RetryInterceptor({required Dio dio, this.backoff = kRetryBackoff})
      : _dio = dio;

  /// Pure helper: the delay before retry number [retryIndex], or null when
  /// the schedule is exhausted. Kept static for unit testing.
  static Duration? delayForRetry(int retryIndex, [List<Duration>? schedule]) {
    final delays = schedule ?? kRetryBackoff;
    if (retryIndex < 0 || retryIndex >= delays.length) return null;
    return delays[retryIndex];
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRetryable(err)) {
      handler.next(err);
      return;
    }

    // PERF-1: background/sync requests get the long schedule; everything
    // else fails fast on the interactive schedule.
    final schedule = options.extra[kBackgroundRequestExtraKey] == true
        ? kBackgroundRetryBackoff
        : backoff;

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
