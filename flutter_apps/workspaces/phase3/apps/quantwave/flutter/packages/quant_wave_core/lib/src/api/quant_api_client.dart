// ============================================================================
// quant_wave_core - Quant API client
// ============================================================================
//
// Dart port of `packages/api-client/src/core/http-client.ts` (+ the wiring
// from `create-client.ts`), built on Dio, adapted for the QuantWave core
// package.
//
// The TS client is fetch-based with per-request AbortController timeouts and
// a `{ success, data, error }` envelope that never throws for HTTP/network
// failures. This port preserves that contract:
//   - `get/post/put/patch/delete` return `Future<ApiResult<T>>`;
//   - transport failures are mapped into `ApiError` (never thrown), except
//     programmer errors (e.g. bad base URL) which still throw.
//
// Interceptor stack (registered in this order; note Dio runs onError in
// REVERSE registration order):
//   1. AuthInterceptor    — Bearer injection (onRequest order: 1st)
//   2. RetryInterceptor   — idempotent 5xx/network retry with backoff
//      (PERF-1: interactive schedule [0, 200ms, 800ms] by default)
//   3. RefreshInterceptor — 401 single-flight refresh + exactly one retry
//      (onError order: 3rd registered => runs FIRST, before Retry)
//
// S3: Dio's native redirect following replays the original request headers —
// including `Authorization: Bearer` — to the redirect target, even
// cross-origin. Dio-level following is therefore DISABLED and redirects are
// followed manually by [_RedirectSafeAdapter], which strips `Authorization`
// (and other auth material) whenever a redirect crosses origins.
// S4: [QuantApiConfig.baseUrl] must be HTTPS (loopback exempt for local dev).

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'package:quant_wave_core/src/api/api_result.dart';
import 'package:quant_wave_core/src/api/interceptors/auth_interceptor.dart';
import 'package:quant_wave_core/src/api/interceptors/refresh_interceptor.dart';
import 'package:quant_wave_core/src/api/interceptors/retry_interceptor.dart';
import 'package:quant_wave_core/src/auth/auth_api.dart';
import 'package:quant_wave_core/src/auth/token_manager.dart';
import 'package:quant_wave_core/src/config/app_config.dart';

/// Configuration for [QuantApiClient].
class QuantApiConfig {
  /// Backend base URL, e.g. `https://api.quantrinity.example`. Trailing
  /// slashes are stripped (mirrors the TS `buildUrl` normalization).
  ///
  /// S4: must be `https://` (`http://` loopback is allowed for local dev);
  /// anything else throws [ArgumentError] at client construction.
  final String baseUrl;

  /// Endpoint path identifying the refresh call, resolved against [baseUrl].
  ///
  /// The refresh contract is the native OAuth2 one — `POST /oauth/token`
  /// with JSON `{"grant_type":"refresh_token","refresh_token":"…"}`, rotation
  /// (board-verified; the camelCase cookie-flow payload is rejected). The
  /// interceptor uses this path only to recognize the refresh call itself
  /// (so a 401 on it never re-enters the refresh flow); the transport is
  /// [AuthApi] (or [tokenRefresher] when set). Defaults to `/oauth/token`
  /// via the interceptor.
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
  /// interceptor uses its built-in [AuthApi] transport (verified OAuth2
  /// contract). Set this to substitute the transport (e.g. in tests).
  final RefreshTokensFn? tokenRefresher;

  /// Creates the client configuration.
  const QuantApiConfig({
    required this.baseUrl,
    required this.refreshEndpoint,
    this.timeout = const Duration(seconds: 30),
    this.headers = const {},
    this.onAuthFailure,
    this.tokenRefresher,
  });
}

/// Dio-based API client with the TS HttpClient's behavior contract.
///
/// Obtain the shared [Dio] instance via [dio] to hand to the openapi-generator
/// output (the generated `ApiClient` accepts an optional `Dio`), so generated
/// endpoints reuse the same interceptor stack.
class QuantApiClient {
  final Dio _dio;
  final TokenManager _tokenManager;

  /// Creates the client, building (or reusing) a Dio with the auth/refresh/
  /// retry interceptor stack wired to [tokenManager]. Pass a custom
  /// [retryInterceptor] to override the backoff schedule in tests, and a
  /// [refreshMutex] to share the S1 refresh mutex with the silent refresh.
  ///
  /// Throws [ArgumentError] when [QuantApiConfig.baseUrl] is not HTTPS (S4).
  QuantApiClient({
    required QuantApiConfig config,
    required TokenManager tokenManager,
    Dio? dio,
    RetryInterceptor? retryInterceptor,
    RefreshMutex? refreshMutex,
  })  : _tokenManager = tokenManager,
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
                // S3: Dio-native redirect following replays Authorization
                // cross-origin. Disabled here; [_RedirectSafeAdapter] (set
                // below) follows redirects manually with origin checks.
                followRedirects: false,
              ),
            ) {
    // Normalize + S4-check the base URL even when a custom Dio is supplied.
    _dio.options.baseUrl = _normalizeBaseUrl(_dio.options.baseUrl);
    _dio.options.followRedirects = false;
    // S3: wrap the adapter so every redirect hop is followed manually with
    // Authorization stripping on cross-origin hops. Per-request
    // `followRedirects` is intentionally ignored: all following goes through
    // this wrapper so S3 holds uniformly.
    _dio.httpClientAdapter = _RedirectSafeAdapter(_dio.httpClientAdapter);

    // Registration order matters: onRequest runs Auth -> Retry -> Refresh,
    // onError runs in reverse: Refresh -> Retry -> Auth.
    _dio.interceptors.addAll([
      AuthInterceptor(_tokenManager),
      retryInterceptor ?? RetryInterceptor(dio: _dio),
      RefreshInterceptor(
        dio: _dio,
        tokenManager: _tokenManager,
        refreshEndpoint: config.refreshEndpoint,
        onAuthFailure: config.onAuthFailure,
        tokenRefresher: config.tokenRefresher,
        refreshMutex: refreshMutex,
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

  /// Strips trailing slashes and enforces the S4 HTTPS-only rule (throws
  /// [ArgumentError] on non-HTTPS, non-loopback base URLs).
  static String _normalizeBaseUrl(String baseUrl) {
    checkHttpsBaseUrl(baseUrl);
    return baseUrl.replaceAll(RegExp(r'/+$'), '');
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

/// Manual redirect-following adapter enforcing S3.
///
/// Dio's native redirect handling replays the *original* request headers —
/// including `Authorization: Bearer <token>` — to the redirect target, even
/// when the redirect crosses origins (a token-leak vector). This wrapper
/// takes over all redirect following (`followRedirects: false` is set on the
/// client's Dio):
/// - 301/302/303/307/308 are followed up to `RequestOptions.maxRedirects`;
/// - `Authorization`, `Proxy-Authorization` and `Cookie` are STRIPPED
///   whenever the redirect target has a different origin (scheme+host+port);
/// - 301/302/303 rewrite non-GET/HEAD requests to GET with the body dropped
///   (browser/Dio convention); 307/308 preserve method and body.
///
/// The body is buffered once up front so redirect hops can re-send it
/// (request streams are single-subscription). Per-request `followRedirects`
/// is intentionally ignored: every hop goes through this wrapper so the
/// origin check holds uniformly.
class _RedirectSafeAdapter implements HttpClientAdapter {
  _RedirectSafeAdapter(this._inner);

  final HttpClientAdapter _inner;

  static const Set<int> _redirectStatuses = {301, 302, 303, 307, 308};

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final List<Uint8List>? buffered =
        requestStream == null ? null : await requestStream.toList();
    Stream<Uint8List>? bodyStream() =>
        buffered == null ? null : Stream<Uint8List>.fromIterable(buffered);

    var current = options;
    var hops = 0;
    while (true) {
      final response = await _inner.fetch(
        current.copyWith(followRedirects: false),
        bodyStream(),
        cancelFuture,
      );
      if (!_redirectStatuses.contains(response.statusCode) ||
          hops >= current.maxRedirects) {
        return response;
      }
      final location = _locationHeader(response.headers);
      if (location == null || location.isEmpty) return response;

      final from = current.uri;
      final to = from.resolve(location);
      hops++;

      var method = current.method;
      var data = current.data;
      final headers = Map<String, dynamic>.of(current.headers);
      if (to.origin != from.origin) {
        // S3: never replay auth material to a different origin.
        headers.remove('Authorization');
        headers.remove('authorization');
        headers.remove('Proxy-Authorization');
        headers.remove('proxy-authorization');
        headers.remove('Cookie');
        headers.remove('cookie');
      }
      if ((response.statusCode == 301 ||
              response.statusCode == 302 ||
              response.statusCode == 303) &&
          method != 'GET' &&
          method != 'HEAD') {
        method = 'GET';
        data = null;
        headers.remove(Headers.contentLengthHeader);
        headers.remove(Headers.contentTypeHeader);
      }

      current = current.copyWith(
        method: method,
        path: to.toString(),
        data: data,
        headers: headers,
      );
    }
  }

  static String? _locationHeader(Map<String, List<String>> headers) {
    for (final entry in headers.entries) {
      if (entry.key.toLowerCase() == 'location' && entry.value.isNotEmpty) {
        return entry.value.first;
      }
    }
    return null;
  }

  @override
  void close({bool force = false}) => _inner.close(force: force);
}
