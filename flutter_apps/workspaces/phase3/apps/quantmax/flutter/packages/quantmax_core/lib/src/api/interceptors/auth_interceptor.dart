// ============================================================================
// quantmax_core - Auth interceptor (Bearer injection)
// ============================================================================
//
// First in the interceptor stack. Ports the header-injection half of the TS
// HttpClient.request(): `Authorization: Bearer <authToken>` on every request
// when a token is present.

import 'package:dio/dio.dart';

import '../../auth/token_manager.dart';

/// RequestOptions extra key: set to `true` to skip Bearer injection for a
/// single request (token exchange, refresh, revoke, public endpoints).
const String kSkipAuthExtraKey = 'quant_skip_auth';

/// Injects `Authorization: Bearer <accessToken>` from [TokenManager].
///
/// The token is read synchronously from the manager's in-memory cache so the
/// request hot path never blocks on storage I/O; warm the cache once at
/// startup via `TokenManager.hydrate()` / `getValidToken()`.
///
/// An explicitly-set `Authorization` header on the request is never
/// overwritten.
class AuthInterceptor extends Interceptor {
  final TokenManager _tokenManager;

  /// Creates an interceptor injecting Bearer tokens from [tokenManager].
  AuthInterceptor(this._tokenManager);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.extra[kSkipAuthExtraKey] == true) {
      handler.next(options);
      return;
    }

    if (!options.headers.containsKey('Authorization')) {
      final token = _tokenManager.getAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }

    handler.next(options);
  }
}

/// Marks [options] to bypass [AuthInterceptor] (and the refresh flow).
RequestOptions skipAuth(RequestOptions options) {
  options.extra[kSkipAuthExtraKey] = true;
  return options;
}
