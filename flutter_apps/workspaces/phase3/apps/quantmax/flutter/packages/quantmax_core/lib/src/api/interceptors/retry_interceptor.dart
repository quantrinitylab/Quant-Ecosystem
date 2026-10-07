// ============================================================================
// quantmax_core - Retry interceptor (idempotent 5xx/network retry)
// ============================================================================
//
// New behavior relative to the TS HttpClient (which retries only the 401
// case, once): transient failures on idempotent requests are retried with
// exponential backoff.
//
// PERF-1: interactive requests (the 60 fps video-feed hot path) use the SHORT
// schedule `[0, 200ms, 800ms]` — the web outbox's `[0, 1s, 4s, 15s, 60s]`
// would stall transient 5xx up to 60 s and break every interaction budget.
// The long schedule stays available for background sync / offline outbox
// work — pass it explicitly when that layer is built.
//
// TODO(UNVERIFIED): the background-sync/outbox backoff design (feed upload
// retries, offline queue) is not in the QuantMax spec yet
// (`app-foundations/quantmax`); wire `backoff: kBackgroundRetryBackoff`
// when it lands.

import 'package:dio/dio.dart';

import 'auth_interceptor.dart';

/// RequestOptions extra key: set to `true` to opt a request out of backoff
/// retry (used by the refresh call and auth endpoints — those must fail fast).
const String kNoRetryExtraKey = 'quant_no_retry';

/// RequestOptions extra key tracking how many backoff retries have already
/// been performed for this request.
const String kRetryCountExtraKey = 'quant_retry_count';

/// HTTP methods considered idempotent and therefore safe to retry.
const Set<String> kIdempotentMethods = {'GET', 'HEAD', 'PUT', 'DELETE'};

/// PERF-1: interactive backoff schedule, indexed by retry count.
/// `delays[i]` is the wait before retry number `i`.
/// Keeps transient-5xx stalls under ~1 s total on the interactive hot path
/// (video feed scroll, playback, discover).
const List<Duration> kInteractiveRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(milliseconds: 200), // retry #1
  Duration(milliseconds: 800), // retry #2: last retry, then give up
];

/// Long backoff for background sync / offline outbox work (mirrors the web
/// outbox `RETRY_BACKOFF_MS` from
/// `apps/quantmail/src/lib/offline/outbox.ts`). Do NOT use for interactive
/// requests (PERF-1). Pluggable via [RetryInterceptor.backoff]; currently
/// unused — kept for the future outbox layer.
const List<Duration> kBackgroundRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(seconds: 1), // retry #1
  Duration(seconds: 4), // retry #2
  Duration(seconds: 15), // retry #3
  Duration(seconds: 60), // retry #4: last retry, then give up
];

/// Retries idempotent requests on transient failures with exponential backoff.
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
/// - non-idempotent methods (POST/PATCH): never retried automatically —
///   video upload POSTs retry only through an explicit, idempotency-keyed
///   upload manager (future work, NOT this interceptor);
/// - requests marked with [kNoRetryExtraKey].
class RetryInterceptor extends Interceptor {
  final Dio _dio;

  /// Override the backoff schedule (defaults to [kInteractiveRetryBackoff],
  /// PERF-1). Length of the list = max number of retries. Pass
  /// [kBackgroundRetryBackoff] for background sync / outbox requests.
  final List<Duration> backoff;

  /// Creates the retry interceptor. [dio] re-issues retried requests;
  /// [backoff] overrides the default interactive schedule.
  RetryInterceptor({required Dio dio, this.backoff = kInteractiveRetryBackoff})
      : _dio = dio;

  /// Pure helper: the delay before retry number [retryIndex], or null when
  /// the schedule is exhausted. Kept static for unit testing.
  static Duration? delayForRetry(int retryIndex, [List<Duration>? schedule]) {
    final delays = schedule ?? kInteractiveRetryBackoff;
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

    final retryCount = (options.extra[kRetryCountExtraKey] as int?) ?? 0;
    final delay = delayForRetry(retryCount, backoff);
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
    // Auth-bypassed calls (token exchange, public endpoints) fail fast —
    // they own their own retry semantics.
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
