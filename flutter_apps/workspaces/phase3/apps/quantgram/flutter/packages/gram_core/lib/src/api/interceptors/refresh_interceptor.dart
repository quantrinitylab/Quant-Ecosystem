// ============================================================================
// gram_core - Refresh interceptor (401 -> mutex-guarded token refresh)
// ============================================================================
//
// Copy-adapt of `quant_foundation`'s refresh interceptor, with the S1 fix
// baked in (security-audit 2026-10-03):
//
//   Phase0 deduped concurrent 401-refreshes with an interceptor-local
//   `_inflightRefresh` future — but knew nothing about the silent-refresh
//   timer, so the two paths could fire concurrent refresh grants → rotation
//   family-revocation → forced sign-out.
//
//   Here the refresh goes through `AuthRepository.refreshSession()`, which
//   funnels EVERY refresh through the app-wide [RefreshMutex]. The 401 path
//   and the silent timer share the repository, so they share the mutex.
//
// Flow on 401 (when this request has not already been refresh-retried):
//  1. `AuthRepository.refreshSession()` — mutex single-flight; concurrent
//     401s (and a racing silent refresh) share ONE network refresh.
//  2. Success: the rotated pair is already stored by the repository; the
//     original request is re-issued exactly once with the fresh Bearer token.
//  3. Failure: tokens are cleared (the repository clears on `invalid_grant`
//     before throwing [AuthSignedOutException]; we clear defensively on any
//     failure, mirroring the TS client) and [onAuthFailure] fires so the app
//     routes to login; the ORIGINAL 401 error propagates to the caller.
//
// The refresh network call itself goes through [GramAuthApi] (a bare Dio: no
// auth/refresh/retry interceptors), so it carries no stale Bearer header and
// can never recurse into this interceptor's own 401 flow.
//
// Dio note: error interceptors run in REVERSE order of registration — see
// GramApiClient for the wiring.

import 'dart:async';

import 'package:dio/dio.dart';

import '../../auth/auth_api.dart';
import '../../auth/auth_exceptions.dart';
import '../../auth/auth_repository.dart';
import '../../auth/token_manager.dart';
import 'auth_interceptor.dart';
import 'retry_interceptor.dart';

/// RequestOptions extra key marking that the 401-refresh retry already ran.
/// Guarantees exactly one retry per request (mirrors the TS `isRetry` flag).
const String kRefreshAttemptedExtraKey = 'gram_refresh_attempted';

/// Handles 401 responses with a mutex-guarded token refresh.
class RefreshInterceptor extends Interceptor {
  final Dio _dio;
  final TokenManager _tokenManager;

  /// Repository owning the refresh flow (mutex-guarded). Its transport is the
  /// bare [GramAuthApi] (verified OAuth2 contract,
  /// `POST /oauth/token` JSON `{"grant_type":"refresh_token",
  /// "refresh_token": …}`, snake_case `TokenSet` — `phase0/AUTH_CONTRACT.md`
  /// §1.4 + VERIFIED board note: two-field body, NO `client_id`).
  final AuthRepository _authRepository;

  /// Path of the refresh endpoint, resolved against the Dio base URL.
  ///
  /// Used only to recognize the refresh call itself in [_isRefreshable401],
  /// so a 401 on the refresh request never re-enters the refresh flow.
  /// Defaults to the OAuth2 token path ([OAuthPaths.token]).
  final String refreshEndpoint;

  /// Invoked after tokens are cleared when refresh fails (navigate to login).
  final FutureOr<void> Function()? onAuthFailure;

  /// Creates the refresh interceptor. [dio] is the client instance used to
  /// re-issue the retried request; [tokenManager] supplies tokens;
  /// [authRepository] performs the mutex-guarded refresh; [refreshEndpoint]
  /// recognizes the refresh call itself (defaults to [OAuthPaths.token]).
  RefreshInterceptor({
    required Dio dio,
    required TokenManager tokenManager,
    required AuthRepository authRepository,
    this.refreshEndpoint = OAuthPaths.token,
    this.onAuthFailure,
  })  : _dio = dio,
        _tokenManager = tokenManager,
        _authRepository = authRepository;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRefreshable401(err)) {
      handler.next(err);
      return;
    }

    final refreshed = await _refreshOnce();

    if (!refreshed) {
      // Refresh failed: clear tokens (TS: refresh returns false) and notify
      // (TS: onAuthError). The original 401 propagates to the caller.
      // (On invalid_grant the repository already cleared before throwing
      // AuthSignedOutException — clearTokens is idempotent.)
      await _tokenManager.clearTokens();
      await onAuthFailure?.call();
      handler.next(err);
      return;
    }

    // Refresh succeeded: retry the original request exactly once with the
    // fresh token (TS: `request(method, url, body, /* isRetry */ true)`).
    final retryOptions = options.copyWith();
    retryOptions.extra[kRefreshAttemptedExtraKey] = true;
    // Fresh attempt: reset the backoff-retry counter so 5xx retry applies to
    // the retried request as its own attempt series.
    retryOptions.extra[kRetryCountExtraKey] = 0;
    final newToken = _tokenManager.getAccessToken();
    if (newToken != null && newToken.isNotEmpty) {
      retryOptions.headers['Authorization'] = 'Bearer $newToken';
    }

    try {
      final response = await _dio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryErr) {
      handler.next(retryErr);
    }
  }

  /// 401s eligible for the refresh flow: HTTP 401, not the refresh request
  /// itself, not an auth-bypassed request, and not already refresh-retried.
  bool _isRefreshable401(DioException err) {
    if (err.response?.statusCode != 401) return false;
    final options = err.requestOptions;
    if (options.extra[kRefreshAttemptedExtraKey] == true) return false;
    if (options.extra[kSkipAuthExtraKey] == true) return false;
    if (_isRefreshRequest(options)) return false;
    return true;
  }

  bool _isRefreshRequest(RequestOptions options) {
    // Both are relative paths resolved against the same base URL.
    return options.path == refreshEndpoint;
  }

  /// Performs the mutex-guarded refresh via the repository. Returns true
  /// only when a new token pair was received and stored. Never throws —
  /// failures surface as `false` (callers take the sign-out path).
  ///
  /// S1: concurrent 401s AND a racing silent-refresh timer all funnel into
  /// `AuthRepository.refreshSession` → the single app-wide [RefreshMutex] →
  /// exactly one network refresh grant.
  Future<bool> _refreshOnce() async {
    try {
      await _authRepository.refreshSession();
      return true;
    } on AuthSignedOutException {
      // invalid_grant: the repository already cleared tokens. Fall through
      // to the failure path (notify + propagate the original 401).
      return false;
    } catch (_) {
      return false;
    }
  }
}
