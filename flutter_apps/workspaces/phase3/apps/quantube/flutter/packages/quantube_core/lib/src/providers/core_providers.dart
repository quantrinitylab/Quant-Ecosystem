// ============================================================================
// quantube_core - Riverpod provider graph
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
//                           │         │
//                           │         └──▶ isAuthenticatedProvider (bool)
//                           │
//                           └──▶ apiClientProvider (token injection + refresh)
//
// Refresh contract (verified `phase0/AUTH_CONTRACT.md` §1.4, backend-prep
// read-only verification): the client uses the NATIVE OAuth2 contract —
// `POST /oauth/token` with JSON `{"grant_type":"refresh_token",
// "refresh_token":"…"}` returning snake_case tokens, with ROTATION (both
// tokens stored). The TS-web camelCase contract is REJECTED for native.
//
// TODO(UNVERIFIED): Flutter SDK is env me nahi hai — `dart analyze` pending.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/app_config.dart';

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
/// (encryptedSharedPreferences on Android, keychain after-first-unlock on
/// iOS). Tests override this provider with
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
/// BehaviorSubject: late subscribers immediately receive the latest state).
final authStateProvider = StreamProvider<AuthState>(
  (ref) => ref.watch(tokenManagerProvider).onAuthStateChanged,
  name: 'authStateProvider',
);

/// Shared API client: [QuantApiClient] wired to the token manager with the
/// foundation interceptor stack (onRequest: Auth → Retry → Refresh;
/// onError runs in reverse: Refresh → Retry → Auth).
///
/// The explicit [tokenRefresher] delegate keeps the refresh transport visible
/// at the wiring site and maps `invalid_grant` to an immediate sign-out; the
/// refresh call uses a bare [AuthApi] (no interceptors), so it can never
/// re-enter the refresh loop.
///
/// NOTE (board S1): the silent-refresh ↔ 401-refresh race needs a shared
/// refresh mutex before production — see `../auth/silent_refresh.dart`
/// Phase-2 contract doc.
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
            // 400 invalid_grant = refresh token revoked/expired (or family
            // revoked on reuse) → signed out. Clear now; the interceptor's
            // failure path clears + notifies again (idempotent).
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
