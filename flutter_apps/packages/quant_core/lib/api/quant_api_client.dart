// Sovereign Quant Ecosystem - Resilient Dio HTTP & Token Refresh Client
// Strictly ZERO raw Unicode emojis throughout this file.

import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../auth/quant_auth_session.dart';
import '../auth/quant_auth_service.dart';

/// Strongly typed API exception for Quant Ecosystem network operations.
class QuantApiException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic details;
  final String? path;
  final int? latencyMs;

  const QuantApiException({
    required this.message,
    this.statusCode,
    this.details,
    this.path,
    this.latencyMs,
  });

  @override
  String toString() {
    return 'QuantApiException(statusCode: $statusCode, path: $path, latency: ${latencyMs}ms, message: $message)';
  }
}

/// Thrown when session credentials cannot be refreshed and user must re-authenticate.
class QuantAuthExpiredException extends QuantApiException {
  const QuantAuthExpiredException({
    String message = 'Session expired. Please sign in again.',
    int? latencyMs,
    String? path,
  }) : super(
          message: message,
          statusCode: 401,
          path: path,
          latencyMs: latencyMs,
        );
}

/// Thrown on connectivity failure, timeout, or DNS resolution failure.
class QuantNetworkException extends QuantApiException {
  const QuantNetworkException({
    String message = 'Network connection failed. Operating in offline-first mode.',
    int? latencyMs,
    String? path,
  }) : super(
          message: message,
          statusCode: 0,
          path: path,
          latencyMs: latencyMs,
        );
}

/// Standard response wrapper for Quant Ecosystem REST APIs.
class QuantApiResponse<T> {
  final bool success;
  final T? data;
  final String message;
  final int statusCode;
  final DateTime timestamp;

  const QuantApiResponse({
    required this.success,
    this.data,
    this.message = '',
    required this.statusCode,
    required this.timestamp,
  });

  factory QuantApiResponse.fromResponse(Response<dynamic> response, T Function(dynamic data)? parser) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      final success = body['success'] as bool? ?? (response.statusCode != null && response.statusCode! >= 200 && response.statusCode! < 300);
      final rawData = body.containsKey('data') ? body['data'] : body;
      final parsedData = (rawData != null && parser != null) ? parser(rawData) : (rawData as T?);
      final msg = body['message'] as String? ?? '';
      return QuantApiResponse<T>(
        success: success,
        data: parsedData,
        message: msg,
        statusCode: response.statusCode ?? 200,
        timestamp: DateTime.now(),
      );
    }

    final parsedData = (body != null && parser != null) ? parser(body) : (body as T?);
    return QuantApiResponse<T>(
      success: response.statusCode != null && response.statusCode! >= 200 && response.statusCode! < 300,
      data: parsedData,
      message: '',
      statusCode: response.statusCode ?? 200,
      timestamp: DateTime.now(),
    );
  }
}

/// Sovereign HTTP client powered by Dio with automatic Bearer token injection,
/// race-condition-free 401 token refresh queue, telemetry latency tracking (<5ms SLA),
/// and structured error mapping.
class QuantApiClient {
  static const String defaultBaseUrl = 'https://quantmail.in/api';
  static const Duration defaultTimeout = Duration(seconds: 15);

  final String baseUrl;
  final QuantAuthSession? authSession;
  final QuantAuthService? authService;
  late final Dio dio;
  late final Dio _refreshDio;

  QuantApiClient({
    String? baseUrl,
    this.authSession,
    this.authService,
    Dio? customDio,
  }) : baseUrl = baseUrl ?? defaultBaseUrl {
    final baseOptions = BaseOptions(
      baseUrl: this.baseUrl,
      connectTimeout: defaultTimeout,
      receiveTimeout: defaultTimeout,
      sendTimeout: defaultTimeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client-Platform': 'Flutter-Sovereign',
        'X-Client-Version': '1.0.0',
      },
    );

    dio = customDio ?? Dio(baseOptions);

    // Isolated un-intercepted Dio instance strictly for token refresh roundtrips
    _refreshDio = Dio(BaseOptions(
      baseUrl: this.baseUrl,
      connectTimeout: defaultTimeout,
      receiveTimeout: defaultTimeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client-Platform': 'Flutter-Sovereign',
      },
    ));

    _setupInterceptors();
  }

  Dio get rawDio => dio;

  /// Helper to resolve current access token across auth providers.
  Future<String?> _resolveAccessToken() async {
    if (authService != null) {
      return await authService!.getAccessToken();
    }
    return authSession?.accessToken;
  }

  /// Helper to resolve current workspace / tenant ID.
  Future<String?> _resolveWorkspaceId() async {
    if (authService != null) {
      return await authService!.getActiveWorkspaceId();
    }
    return authSession?.tenantId;
  }

  /// Helper to resolve refresh token.
  Future<String?> _resolveRefreshToken() async {
    if (authService != null) {
      return await authService!.getRefreshToken();
    }
    return authSession?.state.refreshToken;
  }

  /// Helper to update tokens on refresh.
  Future<void> _updateTokens({required String accessToken, String? refreshToken, DateTime? expiresAt}) async {
    if (authService != null) {
      await authService!.updateTokens(
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
      );
    }
    if (authSession != null) {
      await authSession!.updateTokens(
        newAccessToken: accessToken,
        newRefreshToken: refreshToken,
        expiresAt: expiresAt,
      );
    }
  }

  /// Helper to logout on refresh exhaustion.
  Future<void> _logout() async {
    if (authService != null) {
      await authService!.logout();
    }
    if (authSession != null) {
      await authSession!.logout();
    }
  }

  void _setupInterceptors() {
    dio.interceptors.clear();

    // 1. Auth Interceptor: Injects Authorization Bearer & Multi-Tenant Routing
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.extra['request_start_time'] = DateTime.now().millisecondsSinceEpoch;

          final isNoAuth = options.extra['no_auth'] == true;
          final path = options.path;

          final isWhitelisted = path.contains('/auth/login') ||
              path.contains('/auth/register') ||
              path.contains('/auth/phone/send-otp') ||
              path.contains('/auth/phone/verify-otp') ||
              path.contains('/auth/refresh') ||
              path.contains('/public/');

          if (!isNoAuth && !isWhitelisted) {
            final token = await _resolveAccessToken();
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }

            final workspaceId = await _resolveWorkspaceId();
            if (workspaceId != null && workspaceId.isNotEmpty) {
              options.headers['X-Workspace-Id'] = workspaceId;
              options.headers['X-Tenant-ID'] = workspaceId;
            }
          }

          debugPrint('[QuantApiClient] [REQ] ${options.method.toUpperCase()} ${options.path}');
          return handler.next(options);
        },
        onResponse: (response, handler) {
          final startTime = response.requestOptions.extra['request_start_time'] as int?;
          if (startTime != null) {
            final latency = DateTime.now().millisecondsSinceEpoch - startTime;
            response.extra['latency_ms'] = latency;
            debugPrint('[QuantApiClient] [RES] ${response.statusCode} ${response.requestOptions.method} ${response.requestOptions.path} (${latency}ms)');
          }
          return handler.next(response);
        },
      ),
    );

    // 2. Token Refresh Interceptor: Handles 401 with thread-safe refresh queue
    dio.interceptors.add(_TokenRefreshInterceptor(
      client: this,
      dio: dio,
      refreshDio: _refreshDio,
    ));

    // 3. Structured Logging & Telemetry Error Interceptor
    dio.interceptors.add(
      InterceptorsWrapper(
        onError: (DioException error, handler) {
          final startTime = error.requestOptions.extra['request_start_time'] as int?;
          final latency = startTime != null
              ? DateTime.now().millisecondsSinceEpoch - startTime
              : null;

          String message = error.message ?? 'Unknown network failure';
          dynamic details;

          if (error.response != null) {
            final data = error.response?.data;
            if (data is Map && data.containsKey('message')) {
              message = data['message'].toString();
            } else if (data is Map && data.containsKey('error')) {
              message = data['error'].toString();
            }
            details = data;
          }

          final customException = error.response?.statusCode == 401
              ? QuantAuthExpiredException(
                  message: message,
                  path: error.requestOptions.path,
                  latencyMs: latency,
                )
              : (error.type == DioExceptionType.connectionTimeout ||
                      error.type == DioExceptionType.receiveTimeout ||
                      error.type == DioExceptionType.sendTimeout ||
                      error.type == DioExceptionType.connectionError)
                  ? QuantNetworkException(
                      message: error.message ?? 'Network connection timeout.',
                      path: error.requestOptions.path,
                      latencyMs: latency,
                    )
                  : QuantApiException(
                      message: message,
                      statusCode: error.response?.statusCode,
                      details: details,
                      path: error.requestOptions.path,
                      latencyMs: latency,
                    );

          debugPrint('[QuantApiClient] [ERR] ${error.response?.statusCode ?? 'NETWORK_FAIL'} ${error.requestOptions.method} ${error.requestOptions.path} (${latency ?? 0}ms): $message');

          error.extra['quant_exception'] = customException;
          return handler.next(error);
        },
      ),
    );
  }

  // Core HTTP Verbs with automatic error normalization

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onReceiveProgress,
  }) async {
    try {
      return await dio.get<T>(
        path,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
        onReceiveProgress: onReceiveProgress,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
    ProgressCallback? onSendProgress,
    ProgressCallback? onReceiveProgress,
  }) async {
    try {
      return await dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
        onSendProgress: onSendProgress,
        onReceiveProgress: onReceiveProgress,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await dio.put<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await dio.patch<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await dio.delete<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  /// High-throughput multipart upload for FastCDC 64KB QuantDrive files.
  Future<Response<T>> uploadFile<T>(
    String path, {
    required FormData formData,
    ProgressCallback? onSendProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      return await dio.post<T>(
        path,
        data: formData,
        cancelToken: cancelToken,
        onSendProgress: onSendProgress,
        options: Options(contentType: 'multipart/form-data'),
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  /// Downloads file directly to local device path with streaming progress.
  Future<Response> downloadFile(
    String urlPath,
    String savePath, {
    ProgressCallback? onReceiveProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      return await dio.download(
        urlPath,
        savePath,
        onReceiveProgress: onReceiveProgress,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _unwrapException(e);
    }
  }

  Exception _unwrapException(DioException e) {
    if (e.extra.containsKey('quant_exception')) {
      return e.extra['quant_exception'] as Exception;
    }
    return QuantApiException(
      message: e.message ?? 'Network error occurred',
      statusCode: e.response?.statusCode,
      path: e.requestOptions.path,
    );
  }
}

/// Thread-safe token refresh interceptor with queue serialization to prevent refresh race conditions.
class _TokenRefreshInterceptor extends QueuedInterceptor {
  final QuantApiClient client;
  final Dio dio;
  final Dio refreshDio;

  Completer<bool>? _refreshCompleter;

  _TokenRefreshInterceptor({
    required this.client,
    required this.dio,
    required this.refreshDio,
  });

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    // Only intercept 401 Unauthorized for authenticated endpoints
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    final requestOptions = err.requestOptions;
    final isNoAuth = requestOptions.extra['no_auth'] == true;
    final isRefreshCall = requestOptions.path.contains('/auth/refresh');

    // Never attempt to refresh a failed refresh call or unauthenticated calls
    if (isNoAuth || isRefreshCall) {
      return handler.next(err);
    }

    // Check if a retry was already attempted for this request
    final retryCount = requestOptions.extra['token_retry_count'] as int? ?? 0;
    if (retryCount >= 1) {
      debugPrint('[QuantApiClient] Request already retried once after 401. Aborting.');
      return handler.next(err);
    }

    try {
      final success = await _performTokenRefresh();
      if (success) {
        // Retrieve fresh token
        final newToken = await client._resolveAccessToken();
        if (newToken != null && newToken.isNotEmpty) {
          requestOptions.headers['Authorization'] = 'Bearer $newToken';
        }

        requestOptions.extra['token_retry_count'] = retryCount + 1;

        debugPrint('[QuantApiClient] Retrying failed request ${requestOptions.method} ${requestOptions.path} with new token.');
        final response = await dio.fetch(requestOptions);
        return handler.resolve(response);
      } else {
        // Refresh failed: wipe session and emit 401
        await client._logout();
        return handler.next(err);
      }
    } catch (e) {
      debugPrint('[QuantApiClient] Exception in token refresh interceptor: $e');
      await client._logout();
      return handler.next(err);
    }
  }

  /// Atomically orchestrates the token refresh roundtrip.
  /// Subsequent 401s join and await the active future, preventing concurrent refresh requests.
  Future<bool> _performTokenRefresh() async {
    if (_refreshCompleter != null) {
      debugPrint('[QuantApiClient] Token refresh already in-flight. Queuing request behind existing completer.');
      return await _refreshCompleter!.future;
    }

    _refreshCompleter = Completer<bool>();

    try {
      final refreshToken = await client._resolveRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        debugPrint('[QuantApiClient] No refresh token present. Cannot refresh.');
        _refreshCompleter!.complete(false);
        return false;
      }

      debugPrint('[QuantApiClient] Executing token refresh against /auth/refresh...');
      final response = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(headers: {'Authorization': 'Bearer $refreshToken'}),
      );

      if (response.statusCode == 200 && response.data != null) {
        final data = response.data;
        String? newAccessToken;
        String? newRefreshToken;
        DateTime? expiresAt;

        if (data is Map<String, dynamic>) {
          final payload = data['data'] is Map<String, dynamic> ? data['data'] as Map<String, dynamic> : data;
          newAccessToken = payload['accessToken'] as String? ?? payload['token'] as String?;
          newRefreshToken = payload['refreshToken'] as String?;
          final expiresInSeconds = (payload['expiresIn'] as num?)?.toInt();
          if (expiresInSeconds != null) {
            expiresAt = DateTime.now().add(Duration(seconds: expiresInSeconds));
          }
        }

        if (newAccessToken != null && newAccessToken.isNotEmpty) {
          await client._updateTokens(
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresAt: expiresAt,
          );
          _refreshCompleter!.complete(true);
          return true;
        }
      }

      debugPrint('[QuantApiClient] Server rejected token refresh with code ${response.statusCode}.');
      _refreshCompleter!.complete(false);
      return false;
    } catch (e) {
      debugPrint('[QuantApiClient] Network error while attempting token refresh: $e');
      _refreshCompleter!.complete(false);
      return false;
    } finally {
      _refreshCompleter = null;
    }
  }
}
