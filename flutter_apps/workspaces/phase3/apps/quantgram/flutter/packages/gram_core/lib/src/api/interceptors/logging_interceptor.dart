// ============================================================================
// gram_core - Logging interceptor (debug only)
// ============================================================================
//
// Last in the interceptor stack. Emits one line per request/response/error
// with elapsed time. Compiled out of release builds: every hook is guarded
// by [kDebugMode], so there is zero logging overhead (and zero risk of
// leaking tokens/URLs into release logs) in production.
//
// NOTE: the Authorization header value is never printed — only its presence.

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// RequestOptions extra key: set to `true` to silence logging for a single
/// request (e.g. high-frequency polling where log spam hurts).
const String kNoLogExtraKey = 'gram_no_log';

/// Debug-only HTTP logging interceptor.
///
/// Register LAST so `onRequest` sees the final headers and `onError` sees
/// the final error after the refresh/retry interceptors had their say.
class LoggingInterceptor extends Interceptor {
  /// Creates the logging interceptor.
  LoggingInterceptor();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode && options.extra[kNoLogExtraKey] != true) {
      options.extra[_startTimeKey] = DateTime.now();
      final hasAuth = options.headers.containsKey('Authorization');
      debugPrint(
        '--> ${options.method} ${options.uri} '
        '${hasAuth ? '[auth]' : '[anon]'}',
      );
    }
    handler.next(options);
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    if (kDebugMode && response.requestOptions.extra[kNoLogExtraKey] != true) {
      debugPrint(
        '<-- ${response.statusCode} ${response.requestOptions.method} '
        '${response.requestOptions.uri} (${_elapsed(response.requestOptions)})',
      );
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode && err.requestOptions.extra[kNoLogExtraKey] != true) {
      debugPrint(
        '<-- ERROR ${err.response?.statusCode ?? err.type.name} '
        '${err.requestOptions.method} ${err.requestOptions.uri} '
        '(${_elapsed(err.requestOptions)})',
      );
    }
    handler.next(err);
  }

  static const String _startTimeKey = 'gram_log_start';

  static String _elapsed(RequestOptions options) {
    final start = options.extra[_startTimeKey];
    if (start is DateTime) {
      return '${DateTime.now().difference(start).inMilliseconds}ms';
    }
    return '?ms';
  }
}

/// Marks [options] to skip debug logging for a single request.
RequestOptions noLog(RequestOptions options) {
  options.extra[kNoLogExtraKey] = true;
  return options;
}
