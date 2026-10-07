// ============================================================================
// gram_core - Gram API client
// ============================================================================
//
// Copy-adapt of `quant_foundation`'s QuantApiClient (Dart port of
// `packages/api-client/src/core/http-client.ts` + `create-client.ts`), built
// on Dio, retargeted at QuantGram.
//
// The TS client is fetch-based with per-request AbortController timeouts and
// a `{ success, data, error }` envelope that never throws for HTTP/network
// failures. This port preserves that contract:
//   - `get/post/put/patch/delete` return `Future<ApiResult<T>>`;
//   - transport failures are mapped into `ApiError` (never thrown), except
//     programmer errors (e.g. bad base URL) which still throw.
//
// Interceptor stack (registered in this order; Dio runs onRequest in order
// and onResponse/onError in REVERSE registration order):
//   1. AuthInterceptor     — Bearer injection
//      (onRequest: 1st; onError: last)
//   2. RefreshInterceptor  — 401 → mutex-guarded refresh + exactly one retry
//      (S1: the refresh funnels through AuthRepository → RefreshMutex, shared
//      with the silent-refresh timer)
//      (onError: 3rd — runs before Retry, so 401s never enter backoff)
//   3. RetryInterceptor    — idempotent 5xx/network retry, dual schedule
//      (PERF-1: interactive [0ms, 200ms, 800ms] by default; background
//      [0s, 1s, 4s, 15s, 60s] when `extra['gram_background'] == true`)
//      (onError: 2nd — runs after Refresh)
//   4. LoggingInterceptor  — debug-only request/response logging
//      (onError: 1st; onRequest: last)
//
// S3 fix (security-audit 2026-10-03): `followRedirects: false` — Dio never
// follows a 3xx automatically, so the `Authorization` header cannot leak to a
// redirect target. Redirect responses surface as errors (Dio's default
// validateStatus rejects 3xx); callers that EXPECT redirects (none yet —
// TODO(UNVERIFIED): confirm no API flow depends on redirect-following) must
// handle them explicitly.

import 'dart:async';

import 'package:dio/dio.dart';

import '../auth/auth_api.dart';
import '../auth/auth_repository.dart';
import '../auth/token_manager.dart';
import 'api_result.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/logging_interceptor.dart';
import 'interceptors/refresh_interceptor.dart';
import 'interceptors/retry_interceptor.dart';

/// Configuration for [GramApiClient].
class GramApiConfig {
  /// Backend base URL, e.g. `https://api.quant.app`. Trailing slashes are
  /// stripped.
  final String baseUrl;

  /// Endpoint path identifying the refresh call, resolved against [baseUrl].
  ///
  /// The interceptor uses this only to recognize the refresh call itself
  /// (so a 401 on it never re-enters the refresh flow); the refresh
  /// transport is the repository's [GramAuthApi] (verified OAuth2 contract:
  /// `POST /oauth/token` JSON `{"grant_type":"refresh_token",
  /// "refresh_token":"…"}` — snake_case, NO `client_id`). Defaults to
  /// `/oauth/token`.
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

  /// Creates the client configuration.
  const GramApiConfig({
    required this.baseUrl,
    this.refreshEndpoint = OAuthPaths.token,
    this.timeout = const Duration(seconds: 30),
    this.headers = const {},
    this.onAuthFailure,
  });
}

/// Dio-based API client with the TS HttpClient's behavior contract.
///
/// Obtain the shared [Dio] instance via [dio] to hand to the openapi-generator
/// output (the generated `ApiClient` accepts an optional `Dio`), so generated
/// endpoints reuse the same interceptor stack.
class GramApiClient {
  final Dio _dio;
  final TokenManager _tokenManager;
  final AuthRepository _authRepository;

  /// Creates the client, building (or reusing) a Dio with the
  /// auth/refresh/retry/log interceptor stack wired to [tokenManager] and
  /// [authRepository]. Pass a custom [retryInterceptor] to override the
  /// backoff schedules in tests.
  GramApiClient({
    required GramApiConfig config,
    required TokenManager tokenManager,
    required AuthRepository authRepository,
    Dio? dio,
    RetryInterceptor? retryInterceptor,
  })  : _tokenManager = tokenManager,
        _authRepository = authRepository,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _normalizeBaseUrl(config.baseUrl),
                connectTimeout: config.timeout,
                receiveTimeout: config.timeout,
                sendTimeout: config.timeout,
                headers: <String, dynamic>{
                  'Content-Type': 'application/json',
                  ...config.headers,
                },
                // S3 (security-audit): never follow redirects automatically —
                // a 302 to an attacker-influenced host would otherwise carry
                // the Authorization header. Redirects surface as errors;
                // TODO(UNVERIFIED): confirm no QuantGram API flow depends on
                // redirect-following before this ships.
                followRedirects: false,
              ),
            ) {
    // Registration order: onRequest runs Auth -> Refresh -> Retry -> Log;
    // onError/onResponse run in reverse: Log -> Retry -> Refresh -> Auth.
    // (Refresh's onError must precede Retry's so 401s skip backoff.)
    _dio.interceptors.addAll([
      AuthInterceptor(_tokenManager),
      RefreshInterceptor(
        dio: _dio,
        tokenManager: _tokenManager,
        authRepository: _authRepository,
        refreshEndpoint: config.refreshEndpoint,
        onAuthFailure: config.onAuthFailure,
      ),
      retryInterceptor ?? RetryInterceptor(dio: _dio),
      LoggingInterceptor(),
    ]);
  }

  /// The underlying Dio instance (shares the interceptor stack).
  Dio get dio => _dio;

  /// The token manager backing auth for this client.
  TokenManager get tokenManager => _tokenManager;

  /// The auth repository backing the 401-refresh flow.
  AuthRepository get authRepository => _authRepository;

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

  static String _normalizeBaseUrl(String baseUrl) =>
      baseUrl.replaceAll(RegExp(r'/+$'), '');

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
