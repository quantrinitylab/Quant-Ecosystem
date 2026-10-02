// ============================================================================
// quantai_core - QuantAI API client (D5-tuned foundation client)
// ============================================================================
//
// Thin wrapper around the foundation Dio interceptor stack
// (Auth → Retry → Refresh) with two QuantAI-specific decisions:
//
// 1. **HTTPS-only base URL (S4 lesson).** [QuantAiApiClient.create] asserts
//    the [AppConfig.apiBaseUrl] scheme is `https`. `http` is only accepted for
//    local/dev hosts (`localhost`, `127.0.0.1`, `10.x`, `192.168.x`,
//    `172.16.x`); anything else throws [ArgumentError].
//
// 2. **Interactive-AI retry schedule (D5/PERF-1 lesson).** The foundation
//    default is the web-outbox background schedule `[0s, 1s, 4s, 15s, 60s]`,
//    which is wrong for interactive AI: a stalled chat call should fail fast
//    so the UI can stream a partial response or show a retry affordance. The
//    default schedule here is `[0, 200ms, 800ms]` (max ~1s of added latency);
//    pass [retryInterceptor] to override per call-site/test.
//
// 3. **Redirect-sensitive paths (S3 lesson).** The foundation Dio follows
//    redirects by default. Auth-adjacent calls (authorize/code-exchange/token)
//    use a BARE Dio with `followRedirects: false` inside [AuthRepository]
//    (W2) — never send redirect-sensitive paths through this client.

import 'package:dio/dio.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/app_config.dart';

/// Default D5 backoff schedule for interactive AI requests.
///
/// `delays[i]` is the wait before retry number `i` (see
/// [RetryInterceptor.delayForRetry]). 2 retries max: interactive calls fail
/// fast so the UI can react (~1s worst-case added latency). POSTs are NOT
/// retried by the interceptor anyway (not idempotent); this schedule applies
/// to idempotent AI-adjacent reads (e.g. conversation history, usage checks
/// once the contract exists).
const List<Duration> kAiRetryBackoff = [
  Duration.zero, // retry #0: immediate
  Duration(milliseconds: 200), // retry #1
  Duration(milliseconds: 800), // retry #2: last retry, then give up
];

/// QuantAI's HTTP API client.
///
/// Wraps the foundation interceptor stack (Auth → Retry → Refresh) with the
/// QuantAI D5 decisions documented above. The refresh transport uses the
/// native OAuth2 contract — `POST /oauth/token` with JSON
/// `{"grant_type":"refresh_token","refresh_token":"…"}` returning snake_case
/// tokens with ROTATION (verified `phase0/AUTH_CONTRACT.md` §1.4) — via a
/// bare [AuthApi] (no interceptors), so the refresh call can never re-enter
/// the refresh loop; `invalid_grant` maps to an immediate sign-out
/// ([TokenManager.clearTokens]).
class QuantAiApiClient {
  final QuantApiClient _client;

  QuantAiApiClient._(this._client);

  /// Creates the QuantAI API client.
  ///
  /// - Asserts [AppConfig.apiBaseUrl] is `https` (see [assertSecureBaseUrl]).
  /// - Registers the interceptor stack with the D5 retry schedule
  ///   ([kAiRetryBackoff]), overridable via [retryInterceptor].
  factory QuantAiApiClient.create({
    required AppConfig config,
    required TokenManager tokenManager,
    RetryInterceptor? retryInterceptor,
  }) {
    final baseUrl = _normalizeBaseUrl(config.apiBaseUrl);
    assertSecureBaseUrl(baseUrl);
    final client = QuantApiClient(
      config: QuantApiConfig(
        baseUrl: baseUrl,
        refreshEndpoint: config.oauthTokenPath,
        timeout: config.requestTimeout,
        onAuthFailure: tokenManager.clearTokens,
        tokenRefresher: (refreshToken) async {
          // Bare AuthApi: no auth/refresh/retry interceptors on the token call.
          final authApi = AuthApi(baseUrl: baseUrl);
          try {
            final tokens = await authApi.refreshToken(refreshToken);
            return {
              'accessToken': tokens.accessToken,
              'refreshToken': tokens.refreshToken,
            };
          } on OAuthException catch (e) {
            // 400 invalid_grant = the refresh token is revoked/expired (or
            // the family was revoked on reuse) → signed out. Clear now; the
            // interceptor's failure path clears + notifies again (idempotent).
            if (e.error == 'invalid_grant') {
              await tokenManager.clearTokens();
            }
            return null;
          }
        },
      ),
      tokenManager: tokenManager,
      retryInterceptor: retryInterceptor,
    );
    return QuantAiApiClient._(client);
  }

  /// The underlying Dio instance (shares the interceptor stack).
  ///
  /// Hand this to generated clients or the SSE transport
  /// ([QuantAiSseClient]) so every call reuses auth/refresh/retry.
  Dio get dio => _client.dio;

  /// The token manager backing auth for this client.
  TokenManager get tokenManager => _client.tokenManager;

  /// GET request. Mirrors foundation [QuantApiClient.get].
  Future<ApiResult<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _client.get<T>(path,
          queryParameters: queryParameters, options: options);

  /// POST request. Mirrors foundation [QuantApiClient.post].
  Future<ApiResult<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _client.post<T>(path,
          data: data, queryParameters: queryParameters, options: options);

  /// PUT request. Mirrors foundation [QuantApiClient.put].
  Future<ApiResult<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _client.put<T>(path,
          data: data, queryParameters: queryParameters, options: options);

  /// PATCH request. Mirrors foundation [QuantApiClient.patch].
  Future<ApiResult<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _client.patch<T>(path,
          data: data, queryParameters: queryParameters, options: options);

  /// DELETE request. Mirrors foundation [QuantApiClient.delete].
  Future<ApiResult<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _client.delete<T>(path,
          data: data, queryParameters: queryParameters, options: options);

  // -- Internals ---------------------------------------------------------------

  static String _normalizeBaseUrl(String baseUrl) =>
      baseUrl.replaceAll(RegExp(r'/+$'), '');
}

/// Asserts the API base URL is safe to talk to with Bearer credentials.
///
/// `https` always passes. `http` is only accepted for loopback/private dev
/// hosts (`localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`,
/// `172.16.0.0/12`); anything else throws [ArgumentError] (S4 lesson: never
/// send OAuth tokens over plaintext to a public host).
///
/// @visibleForTesting — exposed so tests can cover the allowlist without the
/// provider graph.
void assertSecureBaseUrl(String baseUrl) {
  final uri = Uri.tryParse(baseUrl);
  if (uri == null || !uri.hasScheme) {
    throw ArgumentError('apiBaseUrl must be an absolute URL: "$baseUrl"');
  }
  if (uri.scheme == 'https') return;
  if (uri.scheme != 'http') {
    throw ArgumentError(
        'apiBaseUrl must use https, not "${uri.scheme}": "$baseUrl"');
  }
  final host = uri.host.toLowerCase();
  final isLocal = host == 'localhost' ||
      host == '127.0.0.1' ||
      host == '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      (host.startsWith('172.') && _is172Private(host));
  if (!isLocal) {
    throw ArgumentError(
        'apiBaseUrl must be https; http is only allowed for local/dev '
        'hosts (localhost, 127.0.0.1, 10.x, 192.168.x, 172.16.x): "$baseUrl"');
  }
}

/// `true` for the `172.16.0.0/12` private range (second octet 16–31).
bool _is172Private(String host) {
  final octets = host.split('.');
  if (octets.length != 4) return false;
  final second = int.tryParse(octets[1]);
  return second != null && second >= 16 && second <= 31;
}
