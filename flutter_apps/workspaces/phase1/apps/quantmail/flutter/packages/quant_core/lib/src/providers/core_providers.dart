// ============================================================================
// quant_core - Riverpod provider graph
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
// Lifetime: [tokenManagerProvider] disposes its [TokenManager] with the
// container; the API client holds no resources beyond its Dio instance.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../auth/auth_exceptions.dart';
import '../auth/auth_providers.dart';
import '../auth/refresh_coordinator.dart';
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
/// Refresh contract decision (M2, verified `phase0/AUTH_CONTRACT.md` §1.4):
/// the client uses the NATIVE OAuth2 contract — `POST /oauth/token` with
/// JSON `{"grant_type":"refresh_token","refresh_token":"…"}` returning
/// snake_case tokens, with ROTATION (both tokens stored). The TS-web
/// camelCase contract (`{'refreshToken': …}` → `accessToken`/`token`,
/// refresh token preserved) is REJECTED for native and no longer exists in
/// the interceptor — its default transport is now the built-in [AuthApi]
/// (verified contract). The explicit [tokenRefresher] delegate below keeps
/// the refresh transport visible at the wiring site.
///
/// Refresh race fix (S1): the delegate does NOT issue its own refresh HTTP
/// call. The ONLY refresh entry points are this delegate (401-reactive) and
/// the silent scheduler (proactive) — both run `AuthRepository.refreshSession()`
/// through the shared [RefreshCoordinator], so concurrent silent-timer +
/// 401 refreshes collapse into ONE HTTP call per token family. The backend
/// rotates refresh tokens (compare-and-set): a second concurrent call would
/// present the revoked token, trigger family revocation, and force
/// sign-out. Canonical refresh = `AuthRepository.refreshSession()`
/// (rotation-aware; on `invalid_grant` it clears tokens and throws
/// [AuthSignedOutException]). The delegate returns the freshly stored pair
/// from the [TokenManager] so the interceptor can re-store it (idempotent).
///
/// Import cycle note: this file imports `../auth/auth_providers.dart` while
/// `auth_providers.dart` imports `../providers/core_providers.dart`. This is
/// legal Dart — both are library-only files (no `part`/`part of` directives
/// involved); only `part`-based cycles are forbidden.
final apiClientProvider = Provider<QuantApiClient>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    final tokenManager = ref.watch(tokenManagerProvider);
    final coordinator = ref.watch(refreshCoordinatorProvider);
    return QuantApiClient(
      config: QuantApiConfig(
        baseUrl: config.apiBaseUrl,
        // Kept for the legacy path only; unused while tokenRefresher is set.
        refreshEndpoint: config.oauthTokenPath,
        timeout: config.requestTimeout,
        onAuthFailure: () => tokenManager.clearTokens(),
        tokenRefresher: (refreshToken) async {
          try {
            // S1: the ONLY refresh entry points are this delegate and the
            // silent scheduler — both go through the shared coordinator, so
            // concurrent silent-timer + 401 refreshes collapse into ONE HTTP
            // call per family. Canonical refresh =
            // AuthRepository.refreshSession() (rotation-aware, invalid_grant
            // -> clears + throws AuthSignedOutException).
            await coordinator.runSingleFlight(
              () => ref.read(authRepositoryProvider).refreshSession(),
            );
          } on AuthSignedOutException {
            return null; // repository already cleared tokens on invalid_grant
          } catch (_) {
            return null; // transient: existing interceptor failure path
          }
          final access = tokenManager.getAccessToken();
          final refresh = tokenManager.getRefreshToken();
          if (access == null || refresh == null) return null;
          return {'accessToken': access, 'refreshToken': refresh};
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
