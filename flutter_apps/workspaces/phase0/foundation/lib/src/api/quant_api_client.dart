// ============================================================================
// quant_foundation - Quant API client
// ============================================================================
//
// Dart port of `packages/api-client/src/core/http-client.ts` (+ the wiring
// from `create-client.ts`), built on Dio.
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
//   3. RefreshInterceptor — 401 single-flight refresh + exactly one retry
//      (onError order: 3rd registered => runs FIRST, before Retry)

import 'dart:async';

import 'package:dio/dio.dart';

import 'api_result.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/refresh_interceptor.dart';
import 'interceptors/retry_interceptor.dart';
import '../auth/token_manager.dart';

/// Configuration for [QuantApiClient].
class QuantApiConfig {
  /// Backend base URL, e.g. `https://api.quant.app`. Trailing slashes are
  /// stripped (mirrors the TS `buildUrl` normalization).
  final String baseUrl;

  /// Endpoint path identifying the refresh call, resolved against [baseUrl].
  ///
  /// RECONCILED (M2, `phase0/AUTH_CONTRACT.md` §1.4): the refresh contract is
  /// the native OAuth2 one — `POST /oauth/token` with JSON
  /// `{"grant_type":"refresh_token","refresh_token":"…"}`, rotation. The
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
  /// contract). Set this to substitute the transport (e.g. to share W2's
  /// `authApiProvider` instance, or in tests).
  final RefreshTokensFn? tokenRefresher;

  /// Whether plain-`http` URLs are accepted for loopback hosts
  /// (`localhost`, `127.0.0.1`, `::1`) during local development.
  ///
  /// Defaults to `true` so dev machines and emulators can run the backend
  /// without TLS. S4 (security audit): non-loopback `http://` URLs are
  /// ALWAYS rejected by [_normalizeBaseUrl] regardless of this flag — the
  /// flag only gates the loopback exception, it never permits cleartext to a
  /// remote host.
  final bool allowInsecureLocalhost;

  /// Creates the client configuration.
  const QuantApiConfig({
    required this.baseUrl,
    required this.refreshEndpoint,
    this.timeout = const Duration(seconds: 30),
    this.headers = const {},
    this.onAuthFailure,
    this.tokenRefresher,
    this.allowInsecureLocalhost = true,
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
  /// [retryInterceptor] to override the backoff schedule in tests.
  QuantApiClient({
    required QuantApiConfig config,
    required TokenManager tokenManager,
    Dio? dio,
    RetryInterceptor? retryInterceptor,
  })  : _tokenManager = tokenManager,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _normalizeBaseUrl(config.baseUrl,
                    allowInsecureLocalhost: config.allowInsecureLocalhost),
                connectTimeout: config.timeout,
                receiveTimeout: config.timeout,
                sendTimeout: config.timeout,
                // S3 (security audit): never follow redirects on the
                // authenticated API client. On a 302 Dio would replay the
                // Bearer token verbatim to the redirect target, which may be
                // attacker-controlled. The API surface is JSON with no
                // legitimate redirect-following — a 3xx surfaces as an
                // ApiError via the existing mapping instead. The OAuth2 PKCE
                // browser flow uses the system browser, not this client, and
                // M2's bare-Dio auth transport already uses
                // followRedirects:false; this makes the main client
                // consistent with it.
                followRedirects: false,
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
      retryInterceptor ?? RetryInterceptor(dio: _dio),
      RefreshInterceptor(
        dio: _dio,
        tokenManager: _tokenManager,
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

  /// GET request returning the FULL decoded response body as a map, without
  /// interpreting the `{success, data}` envelope beyond the `success` flag.
  ///
  /// Use this when the envelope's `data` field is an array (e.g. paginated
  /// list responses like `PaginatedEmails`): [_guard]'s `body['data'] as T`
  /// cast cannot express "data is a List but I need the whole envelope".
  /// The caller parses the envelope itself (e.g. `PaginatedEmails.fromJson`).
  /// Transport failures and `success: false` bodies still map to
  /// [ApiResult.failure] via the same error mapping as [get].
  Future<ApiResult<Map<String, dynamic>>> getEnvelope(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _guardEnvelope(() => _dio.get<dynamic>(path,
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

  /// Normalizes and validates the base URL. S4 (security audit): the scheme
  /// is enforced here, fail-fast — `https` is always allowed; plain-`http`
  /// is only allowed for loopback hosts when [allowInsecureLocalhost] is
  /// true (dev only). Anything else throws [ArgumentError] naming the
  /// offending value. See [QuantApiConfig.allowInsecureLocalhost].
  static String _normalizeBaseUrl(
    String baseUrl, {
    bool allowInsecureLocalhost = true,
  }) {
    final stripped = baseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.parse(stripped);
    if (uri.scheme == 'https') return stripped;
    if (allowInsecureLocalhost &&
        (uri.host == 'localhost' ||
            uri.host == '127.0.0.1' ||
            uri.host == '::1')) {
      return stripped;
    }
    throw ArgumentError(
      'baseUrl must use https:// (http:// is only allowed for loopback dev '
      'hosts: localhost, 127.0.0.1, [::1]): "$baseUrl"',
    );
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

  /// Like [_guard], but returns the whole decoded body as a map instead of
  /// unwrapping `data`. Used by [getEnvelope] for endpoints whose `data`
  /// field is an array. `success: false` bodies still map to failure.
  Future<ApiResult<Map<String, dynamic>>> _guardEnvelope(
      Future<Response<dynamic>> Function() call) async {
    try {
      final response = await call();
      final body = response.data;
      if (body is Map<String, dynamic>) {
        if (body.containsKey('success') && body['success'] != true) {
          final err = body['error'];
          return ApiResult<Map<String, dynamic>>.failure(
            err is Map<String, dynamic>
                ? _apiErrorFromBody(err, response.statusCode ?? 0)
                : ApiError(
                    code: 'UNKNOWN_ERROR',
                    message: response.statusMessage ?? 'Request failed',
                    statusCode: response.statusCode ?? 0,
                  ),
          );
        }
        return ApiResult<Map<String, dynamic>>.ok(body);
      }
      return ApiResult<Map<String, dynamic>>.failure(ApiError(
        code: 'PARSE_ERROR',
        message: 'Expected a JSON object response body',
        statusCode: response.statusCode ?? 0,
      ));
    } on DioException catch (e) {
      return ApiResult<Map<String, dynamic>>.failure(_mapError(e));
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
