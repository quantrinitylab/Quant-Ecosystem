// ============================================================================
// quantmax_core - Refresh interceptor (401 -> single-flight token refresh)
// ============================================================================
//
// Ports the 401-handling half of the TS HttpClient:
//   - concurrent 401s share ONE in-flight refresh (single flight);
//   - on success the original request is retried exactly once (`isRetry`);
//   - on failure tokens are cleared and [onAuthFailure] fires (route to login).
//
// S1: the single flight is the SHARED [RefreshMutex] from `auth/` — the same
// instance the proactive `silentRefreshProvider` timer uses. A timer fire
// coinciding with a 401 joins the in-flight grant instead of firing a second
// one (the backend ROTATES refresh tokens: a second concurrent grant
// presents an already-revoked token → family revocation → spurious sign-out).
// Pass the app-lifetime instance from `refreshMutexProvider` (see
// [QuantMaxApiClient] — it takes the mutex as a constructor argument).
//
// Dio note: error interceptors run in REVERSE order of registration, so this
// interceptor must be registered AFTER RetryInterceptor for its onError to run
// first. See QuantMaxApiClient for the wiring.

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart' show OAuthException;

import '../../auth/auth_api.dart';
import '../../auth/refresh_mutex.dart';
import '../../auth/token_manager.dart';
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
/// Leave `null` (default) to use the built-in [QuantMaxAuthApi.refreshToken]
/// (verified OAuth2 contract, `phase0/AUTH_CONTRACT.md` §1.4). Set this only
/// to substitute a custom transport (e.g. in tests); it receives the stored
/// refresh token and must return the rotated pair.
typedef RefreshTokensFn = Future<Map<String, String>?> Function(
    String refreshToken);

/// Handles 401 responses with a single-flight token refresh.
///
/// Flow on 401 (when a refresh token exists and this request has not already
/// been refresh-retried):
///  1. [_refreshMutex.runSingleFlight] — concurrent 401s (and any in-flight
///     silent-refresh attempt) share ONE refresh grant.
///  2. Success: the new token pair is stored via
///     `TokenManager.setTokens(access, refresh)` (the backend ROTATES refresh
///     tokens — the presented token is revoked server-side and must be
///     discarded) and the original request is re-issued exactly once with
///     the fresh Bearer token.
///  3. Failure: tokens are cleared and [onAuthFailure] fires (the app routes
///     to login); the ORIGINAL 401 error propagates to the caller.
///
/// The refresh call goes through [QuantMaxAuthApi] (a bare Dio: no
/// auth/refresh/retry interceptors, `followRedirects: false` per S3), so it
/// carries no stale Bearer header and can never recurse into this
/// interceptor's own 401 flow.
class RefreshInterceptor extends Interceptor {
  final Dio _dio;
  final TokenManager _tokenManager;

  /// Shared single-flight guard (S1) — the same instance the silent-refresh
  /// timer uses, passed in from `refreshMutexProvider`.
  final RefreshMutex _refreshMutex;

  /// Bare OAuth2 transport performing the refresh call.
  ///
  /// Its Dio carries no interceptors and never follows redirects (S3): the
  /// refresh request attaches no stale Bearer header and can never recurse
  /// into this interceptor's 401 flow.
  final QuantMaxAuthApi _authApi;

  /// Path of the refresh endpoint, resolved against the Dio base URL.
  ///
  /// Used only to recognize the refresh call itself in [_isRefreshable401],
  /// so a 401 on the refresh request never re-enters the refresh flow.
  /// Defaults to the OAuth2 token path; from [AppConfig.oauthTokenPath].
  final String refreshEndpoint;

  /// Invoked after tokens are cleared when refresh fails (navigate to login).
  final FutureOr<void> Function()? onAuthFailure;

  /// Optional custom refresh transport (see [RefreshTokensFn]).
  ///
  /// When set, [_doRefresh] calls this delegate INSTEAD of the built-in
  /// [QuantMaxAuthApi.refreshToken]: the delegate owns the wire format and
  /// returns both rotated tokens, which are stored together. When `null`
  /// (default), the verified OAuth2 contract is used via [QuantMaxAuthApi].
  final RefreshTokensFn? tokenRefresher;

  /// Creates the refresh interceptor. [dio] is the client instance used to
  /// re-issue the retried request; [tokenManager] supplies tokens;
  /// [refreshMutex] is the SHARED single flight (S1) — pass the
  /// `refreshMutexProvider` instance; [refreshEndpoint] recognizes the
  /// refresh call itself (defaults to `/oauth/token`); [authApi] is the
  /// bare OAuth2 transport used for the refresh call — defaults to
  /// `QuantMaxAuthApi(baseUrl: dio.options.baseUrl)`.
  RefreshInterceptor({
    required Dio dio,
    required TokenManager tokenManager,
    required RefreshMutex refreshMutex,
    this.refreshEndpoint = '/oauth/token',
    this.onAuthFailure,
    this.tokenRefresher,
    QuantMaxAuthApi? authApi,
  })  : _dio = dio,
        _tokenManager = tokenManager,
        _refreshMutex = refreshMutex,
        _authApi = authApi ?? QuantMaxAuthApi(baseUrl: dio.options.baseUrl);

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;

    if (!_isRefreshable401(err)) {
      handler.next(err);
      return;
    }

    // S1: shared single flight with the silent-refresh timer. Concurrent
    // 401s (and an in-flight proactive refresh) await the same grant.
    final refreshed = await _refreshMutex.runSingleFlight(_doRefresh);

    if (!refreshed) {
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

  /// Performs the refresh HTTP call. Returns true only when a new token pair
  /// was received and stored. Never throws (so the mutex waiters always get
  /// a bool, never a stray error).
  ///
  /// On `invalid_grant` the repository semantics apply: the presented token
  /// is dead — return false so the caller clears tokens and notifies. (The
  /// dedicated `AuthSignedOutException` mapping lives in
  /// [QuantMaxAuthRepository.refreshSession]; here a false is enough.)
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

      // Verified OAuth2 contract (AUTH_CONTRACT.md §1.4): POST /oauth/token
      // JSON {"grant_type":"refresh_token","refresh_token": …} → snake_case
      // TokenSet. The backend ROTATES: the presented token is revoked
      // (compare-and-set), so store BOTH returned tokens.
      final tokenSet = await _authApi.refreshToken(refreshToken);
      await _tokenManager.setTokens(
          tokenSet.accessToken, tokenSet.refreshToken);
      return true;
    } on OAuthException {
      // invalid_grant (revoked/reused → family revocation) is a definitive
      // "session dead"; other OAuth errors (network, server) likewise map
      // to false here — the clear-tokens + onAuthFailure path runs and the
      // original 401 propagates. (The dedicated AuthSignedOutException
      // mapping lives in QuantMaxAuthRepository.refreshSession.)
      return false;
    } catch (_) {
      return false;
    }
  }
}
