// ============================================================================
// quantmax_core - QuantMax API client
// ============================================================================
//
// Dio-based API client for QuantMax, built on the phase0 foundation's
// behavior contract (Dart port of `packages/api-client/src/core/http-client.ts`):
//   - `get/post/put/patch/delete` return `Future<ApiResult<T>>`;
//   - transport failures are mapped into `ApiError` (never thrown), except
//     programmer errors (e.g. bad base URL) which still throw.
//
// Interceptor stack (registered in this order; note Dio runs onError in
// REVERSE registration order):
//   1. AuthInterceptor    — Bearer injection (onRequest order: 1st)
//   2. RetryInterceptor   — idempotent 5xx/network retry, PERF-1 interactive
//                           backoff [0, 200ms, 800ms]
//   3. RefreshInterceptor — 401 single-flight refresh + exactly one retry,
//                           through the SHARED RefreshMutex (S1)
//      (onError order: 3rd registered => runs FIRST, before Retry)
//
// Security:
//   - S4: `http://` base URLs are rejected (both in debug via assert and at
//     runtime via [ArgumentError]); `http://localhost` is allowed only with
//     the explicit [QuantMaxApiConfig.allowInsecureLocalhost] escape hatch
//     (dev/tests).
//
// Obtain the shared [Dio] instance via [dio] to hand to the openapi-generator
// output (the generated `ApiClient` accepts an optional `Dio`), so generated
// endpoints reuse the same interceptor stack.
//
// TODO(UNVERIFIED): wire after `app-foundations/quantmax` spec lands —
// feed/discover/create/upload endpoints are NOT invented here; the client
// only carries the transport + auth machinery for now.

import 'dart:async';

import 'package:dio/dio.dart';

import '../auth/refresh_mutex.dart';
import '../auth/token_manager.dart';
import 'api_result.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/refresh_interceptor.dart';
import 'interceptors/retry_interceptor.dart';

/// Configuration for [QuantMaxApiClient].
class QuantMaxApiConfig {
  /// Backend base URL, e.g. `https://api.quantmail.com`. Trailing slashes are
  /// stripped. S4: `http://` is rejected (see [QuantMaxApiClient]).
  final String baseUrl;

  /// Endpoint path identifying the refresh call, resolved against [baseUrl].
  ///
  /// The verified OAuth2 contract (`phase0/AUTH_CONTRACT.md` §1.4): the
  /// refresh is `POST /oauth/token` with JSON
  /// `{"grant_type":"refresh_token","refresh_token":"…"}` (rotation). The
  /// interceptor uses this path only to recognize the refresh call itself
  /// (so a 401 on it never re-enters the refresh flow).
  ///
  /// TODO(UNVERIFIED): AppConfig member name (W1: `oauthTokenPath` per the
  /// phase1 pattern) — pass it here from the provider wiring.
  final String refreshEndpoint;

  /// Request timeout applied to connect, send and receive phases.
  ///
  /// The TS client uses ONE timeout (default 30s) for the whole request via
  /// AbortController; Dio splits timeouts per phase, so the same value is
  /// applied to all three. Slightly more lenient than TS on slow-but-alive
  /// connections (each phase gets the full budget).
  final Duration timeout;

  /// Extra headers merged over the defaults on every request.
  final Map<String, String> headers;

  /// Invoked after a failed refresh when tokens are cleared (route to login).
  final FutureOr<void> Function()? onAuthFailure;

  /// Optional custom refresh transport (see [RefreshTokensFn]).
  /// Passed through to the [RefreshInterceptor]; when `null` (default) the
  /// interceptor uses its built-in [QuantMaxAuthApi] transport (verified
  /// OAuth2 contract). Set this to substitute the transport (e.g. to share
  /// the `quantMaxAuthApiProvider` instance, or in tests).
  final RefreshTokensFn? tokenRefresher;

  /// Override the interactive retry backoff (defaults to
  /// [kInteractiveRetryBackoff], PERF-1). Pass [kBackgroundRetryBackoff] for
  /// background sync / outbox requests (pluggable — no outbox exists yet).
  final List<Duration> retryBackoff;

  /// Escape hatch for local dev/tests: allow `http://localhost` /
  /// `http://127.0.0.1` base URLs. Defaults to false; NEVER enable in a
  /// release build (S4).
  final bool allowInsecureLocalhost;

  /// Creates the client configuration.
  const QuantMaxApiConfig({
    required this.baseUrl,
    this.refreshEndpoint = '/oauth/token',
    this.timeout = const Duration(seconds: 30),
    this.headers = const {},
    this.onAuthFailure,
    this.tokenRefresher,
    this.retryBackoff = kInteractiveRetryBackoff,
    this.allowInsecureLocalhost = false,
  });
}

/// Dio-based API client with the TS HttpClient's behavior contract.
///
/// The [refreshMutex] should be the app-lifetime instance from
/// `refreshMutexProvider` (S1: shared with the silent-refresh timer); when
/// omitted a private instance is created (acceptable in tests, WRONG in the
/// app — the timer and the interceptor would single-flight separately).
class QuantMaxApiClient {
  final Dio _dio;
  final TokenManager _tokenManager;

  /// Creates the client, building (or reusing) a Dio with the auth/refresh/
  /// retry interceptor stack wired to [tokenManager].
  ///
  /// Pass a custom [retryInterceptor] to override the backoff schedule in
  /// tests; pass the app's shared [RefreshMutex] via [refreshMutex].
  QuantMaxApiClient({
    required QuantMaxApiConfig config,
    required TokenManager tokenManager,
    RefreshMutex? refreshMutex,
    Dio? dio,
    RetryInterceptor? retryInterceptor,
  })  : _tokenManager = tokenManager,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _normalizeBaseUrl(
                  config.baseUrl,
                  allowInsecureLocalhost: config.allowInsecureLocalhost,
                ),
                connectTimeout: config.timeout,
                receiveTimeout: config.timeout,
                sendTimeout: config.timeout,
                headers: <String, dynamic>{
                  'Content-Type': 'application/json',
                  ...config.headers,
                },
              ),
            ) {
    // Registration order matters: onRequest runs Auth -> Retry -> Refresh,
    // onError runs in reverse: Refresh -> Retry -> Auth.
    _dio.interceptors.addAll([
      AuthInterceptor(_tokenManager),
      retryInterceptor ??
          RetryInterceptor(dio: _dio, backoff: config.retryBackoff),
      RefreshInterceptor(
        dio: _dio,
        tokenManager: _tokenManager,
        // S1: the SHARED single flight — same instance the silent-refresh
        // timer uses, so concurrent timer + 401 refreshes never double-grant.
        refreshMutex: refreshMutex ?? RefreshMutex(),
        refreshEndpoint: config.refreshEndpoint,
        onAuthFailure: config.onAuthFailure,
        tokenRefresher: config.tokenRefresher,
      ),
    ]);
  }

  /// The underlying Dio instance (shares the interceptor stack).
  Dio get dio => _dio;

  /// The token manager backing auth for this client.
  TokenManager get tokenManager => _tokenManager;

  // -- Convenience methods (mirror the TS HttpClient surface) ---------------

  /// GET request with optional query parameters. Mirrors TS `HttpClient.get`.
  Future<ApiResult<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guard<T>(() => _dio.get<dynamic>(path,
          queryParameters: queryParameters, options: options));

  /// POST request with an optional JSON-encodable body. Mirrors TS `HttpClient.post`.
  Future<ApiResult<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guard<T>(() => _dio.post<dynamic>(path,
          data: data, queryParameters: queryParameters, options: options));

  /// PUT request with an optional JSON-encodable body. Mirrors TS `HttpClient.put`.
  Future<ApiResult<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guard<T>(() => _dio.put<dynamic>(path,
          data: data, queryParameters: queryParameters, options: options));

  /// The TS HttpClient has no PATCH; included because the backend exposes
  /// PATCH-style updates. Never auto-retried (not in the idempotent set).
  Future<ApiResult<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guard<T>(() => _dio.patch<dynamic>(path,
          data: data, queryParameters: queryParameters, options: options));

  /// DELETE request. Mirrors TS `HttpClient.delete`.
  Future<ApiResult<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guard<T>(() => _dio.delete<dynamic>(path,
          data: data, queryParameters: queryParameters, options: options));

  // -- Internals ---------------------------------------------------------------

  /// S4: rejects `http://` base URLs (runtime guard, complements W1's
  /// AppConfig assert). `http://localhost`/`http://127.0.0.1` are allowed
  /// only via the explicit [QuantMaxApiConfig.allowInsecureLocalhost] flag.
  static String _normalizeBaseUrl(
    String baseUrl, {
    required bool allowInsecureLocalhost,
  }) {
    final trimmed = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    final isLocalhost = uri != null &&
        (uri.host == 'localhost' || uri.host == '127.0.0.1') &&
        uri.scheme == 'http';
    if (uri == null ||
        (uri.scheme != 'https' && !(allowInsecureLocalhost && isLocalhost))) {
      throw ArgumentError.value(
        baseUrl,
        'baseUrl',
        'must be an https:// URL (S4: http:// is rejected to prevent '
        'token leakage over cleartext)',
      );
    }
    return trimmed;
  }

  /// Maps Dio outcomes into the TS-style envelope. Only throws for
  /// programmer errors (never for HTTP/transport failures).
  Future<ApiResult<T>> _guard<T>(
      Future<Response<dynamic>> Function() call) async {
    try {
      final response = await call();
      return _mapSuccess<T>(response);
    } on DioException catch (e) {
      return ApiResult<T>.failure(_mapError(e));
    }
  }

  ApiResult<T> _mapSuccess<T>(Response<dynamic> response) {
    final body = response.data;
    // If the backend speaks the TS `APIResponse` envelope, unwrap it;
    // otherwise treat the body itself as the data (codegen'd models).
    if (body is Map<String, dynamic> && body.containsKey('success')) {
      final success = body['success'] == true;
      if (!success) {
        final err = body['error'];
        return ApiResult<T>.failure(
          err is Map<String, dynamic>
              ? _apiErrorFromBody(err, response.statusCode ?? 0)
              : ApiError(
                  code: 'UNKNOWN_ERROR',
                  message: response.statusMessage ?? 'Request failed',
                  statusCode: response.statusCode ?? 0,
                ),
        );
      }
      final metadata = body['metadata'];
      return ApiResult<T>.ok(
        body['data'] as T,
        metadata: metadata is Map<String, dynamic> ? metadata : null,
      );
    }
    return ApiResult<T>.ok(body as T);
  }

  /// Mirrors the TS error mapping: `{code, message, statusCode, details}`
  /// from the error body with `UNKNOWN_ERROR` / `statusText` fallbacks,
  /// `TIMEOUT` (408) for timeouts, `NETWORK_ERROR` (0) for transport failures.
  ApiError _mapError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        final ms = e.requestOptions.connectTimeout?.inMilliseconds;
        return ApiError(
          code: 'TIMEOUT',
          message:
              'Request timed out after ${ms ?? 'unknown'}ms', // TS: `Request timed out after ${timeout}ms`
          statusCode: 408,
        );
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        return ApiError(
          code: 'NETWORK_ERROR',
          message: e.message ?? e.error?.toString() ?? 'Network error',
          statusCode: 0,
        );
      case DioExceptionType.cancel:
        // No TS equivalent (fetch AbortController aborts were all mapped to
        // TIMEOUT); surfaced distinctly so callers can tell cancellation apart.
        return ApiError(
          code: 'CANCELLED',
          message: 'Request was cancelled',
          statusCode: 0,
        );
      case DioExceptionType.badCertificate:
        return ApiError(
          code: 'TLS_ERROR',
          message: e.message ?? 'Certificate verification failed',
          statusCode: 0,
        );
      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode ?? 0;
        final data = e.response?.data;
        if (data is Map<String, dynamic>) {
          return _apiErrorFromBody(data, statusCode,
              fallbackMessage: e.response?.statusMessage);
        }
        return ApiError(
          code: 'UNKNOWN_ERROR',
          message: e.response?.statusMessage ?? 'Request failed',
          statusCode: statusCode,
        );
    }
  }

  ApiError _apiErrorFromBody(
    Map<String, dynamic> body,
    int statusCode, {
    String? fallbackMessage,
  }) {
    // TS: `code: errorBody.code || 'UNKNOWN_ERROR'`,
    //     `message: errorBody.message || response.statusText`.
    final details = body['details'];
    return ApiError(
      code: (body['code'] as String?) ?? 'UNKNOWN_ERROR',
      message: (body['message'] as String?) ??
          fallbackMessage ??
          'Request failed',
      statusCode: statusCode,
      details: details is Map<String, dynamic> ? details : null,
    );
  }
}
