// ============================================================================
// ads_core - Riverpod provider graph
// ============================================================================
//
// Plain Riverpod providers (no codegen / riverpod_generator). Every provider
// is override-friendly: tests and flavors override [adsConfigProvider] or
// [tokenManagerProvider] and the rest of the graph follows.
//
// Provider graph:
//
//   adsConfigProvider ──────┬──▶ apiClientProvider (QuantApiClient)
//                           │
//   tokenManagerProvider ───┼──▶ authStateProvider (StreamProvider<AuthState>)
//                           │         │
//                           │         └──▶ isAuthenticatedProvider (bool)
//                           │
//                           └──▶ apiClientProvider (token injection + refresh)
//
// Lifetime: [tokenManagerProvider] disposes its [TokenManager] with the
// container; the API client holds no resources beyond its Dio instance.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/ads_config.dart';

/// Compile-time configuration, override-friendly per flavor / test.
///
/// Defaults come from `--dart-define` flags (see [AdsConfig]); override with
/// `adsConfigProvider.overrideWithValue(const AdsConfig(apiBaseUrl: ...))`.
final adsConfigProvider = Provider<AdsConfig>(
  (ref) => const AdsConfig(),
  name: 'adsConfigProvider',
);

/// Shared token manager backed by the platform secure store.
///
/// The default [TokenManager] storage is [SecureTokenStorage]
/// (flutter_secure_storage: encryptedSharedPreferences on Android, keychain
/// after-first-unlock on iOS). Tests override this provider with
/// `TokenManager(storage: InMemoryTokenStorage())`.
final tokenManagerProvider = Provider<TokenManager>(
  (ref) {
    final manager = TokenManager();
    ref.onDispose(manager.dispose);
    return manager;
  },
  name: 'tokenManagerProvider',
);

/// Broadcast auth-state stream from the token manager.
///
/// Uses the real [TokenManager.onAuthStateChanged] member (rxdart
/// BehaviorSubject: late subscribers immediately receive the latest state,
/// e.g. UI binding after login completes).
final authStateProvider = StreamProvider<AuthState>(
  (ref) => ref.watch(tokenManagerProvider).onAuthStateChanged,
  name: 'authStateProvider',
);

/// Shared API client: [QuantApiClient] wired to the token manager with the
/// foundation interceptor stack (onRequest: Auth → Retry → Refresh;
/// onError runs in reverse: Refresh → Retry → Auth).
///
/// Refresh contract decision (verified `phase0/AUTH_CONTRACT.md` §1.4): the
/// client uses the NATIVE OAuth2 contract — `POST /oauth/token` with JSON
/// `{"grant_type":"refresh_token","refresh_token":"…"}` returning
/// snake_case tokens, with ROTATION (both tokens stored). The TS-web
/// camelCase contract (`{'refreshToken': …}` → `accessToken`/`token`,
/// refresh token preserved) is REJECTED for native and no longer exists in
/// the interceptor — its default transport is now the built-in [AuthApi]
/// (verified contract). The explicit [tokenRefresher] delegate below keeps
/// the refresh transport visible at the wiring site and maps `invalid_grant`
/// to an immediate sign-out; the refresh call uses a bare [AuthApi] (no
/// interceptors), so it can never re-enter the refresh loop.
///
/// Note: this client exists for authenticated transport (auth headers,
/// refresh). No ads endpoints are wired here yet — the QuantAds OpenAPI
/// spec does not exist (TODO: spec-first wiring in a later shift).
final apiClientProvider = Provider<QuantApiClient>(
  (ref) {
    final config = ref.watch(adsConfigProvider);
    final tokenManager = ref.watch(tokenManagerProvider);
    return QuantApiClient(
      config: QuantApiConfig(
        baseUrl: config.apiBaseUrl,
        // Kept for the legacy path only; unused while tokenRefresher is set.
        refreshEndpoint: config.oauthTokenPath,
        timeout: config.requestTimeout,
        onAuthFailure: () => tokenManager.clearTokens(),
        tokenRefresher: (refreshToken) async {
          // Bare Dio: no auth/refresh/retry interceptors on the token call.
          final authApi = AuthApi(baseUrl: config.apiBaseUrl);
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
    );
  },
  name: 'apiClientProvider',
);

/// Synchronous derived flag for routing/guards (e.g. go_router redirect).
///
/// Returns `false` while the auth-state stream is still loading (status
/// `unknown`) — treat as "not yet known", not as signed-out.
final isAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authStateProvider).maybeWhen(
        data: (state) => state.isAuthenticated,
        orElse: () => false,
      ),
  name: 'isAuthenticatedProvider',
);
