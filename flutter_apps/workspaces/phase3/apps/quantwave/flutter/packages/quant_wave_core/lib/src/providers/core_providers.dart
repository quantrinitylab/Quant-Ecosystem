// ============================================================================
// quant_wave_core - Riverpod provider graph
// ============================================================================
//
// Plain Riverpod providers (no codegen / riverpod_generator). Every provider
// is override-friendly: tests and flavors override [appConfigProvider] or
// [tokenManagerProvider] and the rest of the graph follows.
//
// Provider graph:
//
//   appConfigProvider ──────┬──▶ apiClientProvider (QuantApiClient)
//                           │
//   tokenManagerProvider ───┼──▶ authStateProvider (StreamProvider<AuthState>)
//   │                       │         │
//   │                       │         └──▶ isAuthenticatedProvider (bool)
//   │                       │
//   └── refreshMutexProvider ┴──▶ apiClientProvider (S1: shared refresh mutex
//                                with AuthRepository via auth_providers.dart)
//
// Lifetime: [tokenManagerProvider] disposes its [TokenManager] with the
// container; the API client holds no resources beyond its Dio instance.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:quant_wave_core/src/api/interceptors/refresh_interceptor.dart';
import 'package:quant_wave_core/src/api/quant_api_client.dart';
import 'package:quant_wave_core/src/auth/auth_api.dart';
import 'package:quant_wave_core/src/auth/token_manager.dart';
import 'package:quant_wave_core/src/config/app_config.dart';

/// Compile-time configuration, override-friendly per flavor / test.
///
/// Defaults come from `--dart-define` flags (see [AppConfig]); override with
/// `appConfigProvider.overrideWithValue(const AppConfig(apiBaseUrl: ...))`.
final appConfigProvider = Provider<AppConfig>(
  (ref) => const AppConfig(),
  name: 'appConfigProvider',
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

/// Single shared refresh mutex (army review finding S1).
///
/// Handed to both [AuthRepository.refreshSession] (via
/// `authRepositoryProvider`) and the [RefreshInterceptor] (via
/// [apiClientProvider]) so the silent proactive refresh and the 401-reactive
/// refresh can never run the refresh grant concurrently — concurrent grants
/// race into rotation family-revocation and sign the user out.
final refreshMutexProvider = Provider<RefreshMutex>(
  (ref) => RefreshMutex(),
  name: 'refreshMutexProvider',
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
/// interceptor stack (onRequest: Auth → Retry → Refresh; onError runs in
/// reverse: Refresh → Retry → Auth).
///
/// Refresh contract decision (board-verified): the client uses the NATIVE
/// OAuth2 contract — `POST /oauth/token` with JSON
/// `{"grant_type":"refresh_token","refresh_token":"…"}` returning snake_case
/// tokens, with ROTATION (both tokens stored). The TS-web camelCase contract
/// (`{'refreshToken': …}` → `accessToken`/`token`, refresh token preserved)
/// is REJECTED for native and does not exist anywhere in this client. The
/// explicit [tokenRefresher] delegate below keeps the refresh transport
/// visible at the wiring site and maps `invalid_grant` to an immediate
/// sign-out; the refresh call uses a bare [AuthApi] (no interceptors), so it
/// can never re-enter the refresh loop.
///
/// S3: the client's Dio disables native redirect following; the
/// [_RedirectSafeAdapter] follows redirects manually and strips
/// `Authorization` on cross-origin hops.
/// S4: [QuantApiConfig.baseUrl] must be HTTPS (throws at construction).
final apiClientProvider = Provider<QuantApiClient>(
  (ref) {
    final config = ref.watch(appConfigProvider);
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
      // S1: share the app-wide refresh mutex with AuthRepository.
      refreshMutex: ref.watch(refreshMutexProvider),
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
