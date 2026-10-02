// ============================================================================
// quant_wave_core - Refresh interceptor (401 -> single-flight token refresh)
// ============================================================================
//
// Ports the 401-handling half of the TS HttpClient:
//   - `attemptTokenRefresh()` dedupes concurrent refreshes via `refreshPromise`;
//   - on success the original request is retried exactly once (`isRetry`);
//   - on failure `onAuthError` fires and the original 401 is returned.
//
// Dio note: error interceptors run in REVERSE order of registration, so this
// interceptor must be registered AFTER RetryInterceptor for its onError to run
// first. See QuantApiClient for the wiring.
//
// CRITICAL (board-verified contract): the refresh transport is the NATIVE
// OAuth2 one — `POST /oauth/token` JSON `{"grant_type":"refresh_token",
// "refresh_token":"…"}` → snake_case `TokenSet`. The camelCase
// `{'refreshToken': …}` payload was the rejected cookie flow and must never
// be used.

import 'dart:async';

import 'package:dio/dio.dart';

import 'package:quant_wave_core/src/auth/auth_api.dart';
import 'package:quant_wave_core/src/auth/token_manager.dart';
import 'auth_interceptor.dart';
import 'retry_interceptor.dart';

/// RequestOptions extra key marking that the 401-refresh retry already ran.
/// Guarantees exactly one retry per request (mirrors the TS `isRetry` flag).
const String kRefreshAttemptedExtraKey = 'quant_refresh_attempted';

/// Optional override for the refresh transport.
///
/// Return a map with `accessToken` and `refreshToken` on success — the
/// backend ROTATES refresh tokens, so BOTH returned tokens must be stored
/// and the presented token discarded. Return `null` (or throw) on failure;
/// the interceptor then takes the normal failure path (clear + notify).
///
/// Leave `null` (default) to use the built-in [AuthApi.refreshToken]
/// (verified OAuth2 contract, `phase0/AUTH_CONTRACT.md` §1.4). Set this only
/// to substitute a custom transport (e.g. in tests); it receives the stored
/// refresh token and must return the rotated pair.
typedef RefreshTokensFn = Future<Map<String, String>?> Function(
    String refreshToken);

/// Result of a refresh attempt, kept internal to the interceptor.
class _RefreshOutcome {
  final bool ok;
  const _RefreshOutcome(this.ok);
}

/// Handles 401 responses with a single-flight token refresh.
///
/// Flow on 401 (when a refresh token exists and this request has not already
/// been refresh-retried):
///  1. [_refreshSingleFlight] — concurrent 401s share ONE in-flight refresh
///     (plain-Dart `Future` dedupe, mirroring the TS `refreshPromise` field).
///  2. Success: the new token pair is stored via
///     `TokenManager.setTokens(access, refresh)` (the backend ROTATES refresh
///     tokens — the presented token is revoked server-side and must be
///     discarded) and the original request is re-issued exactly once with
///     the fresh Bearer token.
///  3. Failure: tokens are cleared and [onAuthFailure] fires (the app routes
///     to login); the ORIGINAL 401 error propagates to the caller.
///
/// S1: the grant additionally runs under the shared [RefreshMutex] (pass the
/// app-wide instance from `refreshMutexProvider`), serialized against the
/// silent proactive refresh — concurrent grants would race into rotation
/// family-revocation.
///
/// The refresh call goes through [AuthApi] (a bare Dio: no auth/refresh/retry
/// interceptors), so it carries no stale Bearer header and can never recurse
/// into this interceptor's own 401 flow.
///
/// Set [tokenRefresher] to substitute a custom refresh transport (e.g. in
/// tests); otherwise the verified OAuth2 contract is used
/// (`POST /oauth/token` JSON `{"grant_type":"refresh_token",
/// "refresh_token": …}`, snake_case `TokenSet` — `phase0/AUTH_CONTRACT.md`
/// §1.4).
class RefreshInterceptor extends Interceptor {
  final Dio _dio;
  final TokenManager _tokenManager;

  /// Bare OAuth2 transport performing the refresh call.
  ///
  /// Its Dio carries no interceptors: the refresh request attaches no stale
  /// Bearer header and can never recurse into this interceptor's 401 flow.
  final AuthApi _authApi;

  /// Path of the refresh endpoint, resolved against the Dio base URL.
  ///
  /// Used only to recognize the refresh call itself in [_isRefreshable401],
  /// so a 401 on the refresh request never re-enters the refresh flow.
  /// Defaults to the OAuth2 token path ([OAuthPaths.token]).
  final String refreshEndpoint;

  /// Invoked after tokens are cleared when refresh fails (navigate to login).
  final FutureOr<void> Function()? onAuthFailure;

  /// Optional custom refresh transport (see [RefreshTokensFn]).
  ///
  /// When set, [_doRefresh] calls this delegate INSTEAD of the built-in
  /// [AuthApi.refreshToken]: the delegate owns the wire format and returns
  /// both rotated tokens, which are stored together. When `null` (default),
  /// the verified OAuth2 contract is used via [AuthApi].
  final RefreshTokensFn? tokenRefresher;

  /// Shared refresh mutex (S1). When omitted a private instance is created —
  /// correct in isolation, but prefer passing the app-wide instance from
  /// `refreshMutexProvider` so the 401 refresh is serialized against the
  /// silent proactive refresh.
  final RefreshMutex _mutex;

  /// Creates the refresh interceptor. [dio] is the client instance used to
  /// re-issue the retried request; [tokenManager] supplies tokens;
  /// [refreshEndpoint] recognizes the refresh call itself (defaults to
  /// [OAuthPaths.token]); [authApi] is the bare OAuth2 transport used for the
  /// refresh call — defaults to `AuthApi(baseUrl: dio.options.baseUrl)`;
  /// [refreshMutex] should be the shared app-wide mutex (S1).
  RefreshInterceptor({
    required Dio dio,
    required TokenManager tokenManager,
    this.refreshEndpoint = OAuthPaths.token,
    this.onAuthFailure,
    this.tokenRefresher,
    AuthApi? authApi,
    RefreshMutex? refreshMutex,
  })  : _dio = dio,
        _tokenManager = tokenManager,
        _authApi = authApi ?? AuthApi(baseUrl: dio.options.baseUrl),
        _mutex = refreshMutex ?? RefreshMutex();

  /// The in-flight refresh shared by concurrent 401s (TS: `refreshPromise`).
  Future<_RefreshOutcome>? _inflightRefresh;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRefreshable401(err)) {
      handler.next(err);
      return;
    }

    final refreshed = await _refreshSingleFlight();

    if (!refreshed.ok) {
      // Refresh failed: clear tokens (TS: refresh returns false) and notify
      // (TS: onAuthError). The original 401 propagates to the caller.
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

  /// Single-flight refresh: concurrent callers share one in-flight attempt.
  /// Mirrors the TS `attemptTokenRefresh()` / `refreshPromise` dedupe.
  ///
  /// The grant runs under the shared [RefreshMutex] (S1) so it can never
  /// overlap the silent proactive refresh.
  Future<_RefreshOutcome> _refreshSingleFlight() {
    final inflight = _inflightRefresh;
    if (inflight != null) return inflight;
    final future = _mutex.run(_doRefresh).then(
      (ok) => _RefreshOutcome(ok),
      onError: (_) => const _RefreshOutcome(false),
    );
    _inflightRefresh = future;
    // Clear the slot when done so a later 401 triggers a fresh attempt.
    // (TS does this in the `finally` of attemptTokenRefresh.)
    future.whenComplete(() {
      if (identical(_inflightRefresh, future)) _inflightRefresh = null;
    });
    return future;
  }

  /// Performs the refresh HTTP call. Returns true only when a new token pair
  /// was received and stored. Never throws.
  ///
  /// Always re-reads the refresh token from [TokenManager] at call time:
  /// under the shared mutex a waiter may run after another refresh already
  /// rotated the pair, so it must present the latest token.
  Future<bool> _doRefresh() async {
    final refreshToken = _tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      // Custom transport override (e.g. tests): returns the rotated pair as
      // a camelCase map; store both, discard the presented token.
      final refresher = tokenRefresher;
      if (refresher != null) {
        final tokens = await refresher(refreshToken);
        final newAccessToken = tokens?['accessToken'];
        final newRefreshToken = tokens?['refreshToken'];
        if (newAccessToken == null ||
            newAccessToken.isEmpty ||
            newRefreshToken == null ||
            newRefreshToken.isEmpty) {
          return false;
        }
        await _tokenManager.setTokens(newAccessToken, newRefreshToken);
        return true;
      }

      // Verified OAuth2 contract (AUTH_CONTRACT.md §1.4, board-confirmed):
      // POST /oauth/token JSON {"grant_type":"refresh_token",
      // "refresh_token": …} → snake_case TokenSet. The backend ROTATES: the
      // presented token is revoked (compare-and-set), so store BOTH returned
      // tokens. Never the camelCase cookie-flow payload.
      final tokenSet = await _authApi.refreshToken(refreshToken);
      await _tokenManager.setTokens(
          tokenSet.accessToken, tokenSet.refreshToken);
      return true;
    } catch (_) {
      return false;
    }
  }
}
