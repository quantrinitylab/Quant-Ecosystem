// ============================================================================
// chat_core - Riverpod provider graph (QuantChat, shift 1)
//
// Port of quantmail's `quant_core/.../providers/core_providers.dart`,
// adapted for QuantChat's auth contract (W3):
//
//   AppConfig(ssoBaseUrl, apiBaseUrl, webOrigin, oauthClientId)
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

import 'package:quant_foundation/quant_foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';

/// Compile-time configuration, override-friendly per flavor / test.
///
/// Defaults come from `--dart-define` flags (see [AppConfig]); override with
/// `appConfigProvider.overrideWithValue(AppConfig(apiBaseUrl: ...))`.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig(),
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
    final TokenManager manager = TokenManager();
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
/// Refresh contract decision (mirrored from quantmail Phase 1 M2): the
/// client uses the NATIVE OAuth2 contract — `POST /oauth/token` with JSON
/// `{"grant_type":"refresh_token","refresh_token":"…"}` returning
/// snake_case tokens, with ROTATION (both tokens stored). The explicit
/// [tokenRefresher] delegate below keeps the refresh transport visible at
/// the wiring site and maps `invalid_grant` to an immediate sign-out; the
/// refresh call uses a bare [AuthApi] (no interceptors), so it can never
/// re-enter the refresh loop.
final apiClientProvider = Provider<QuantApiClient>(
  (ref) {
    final AppConfig config = ref.watch(appConfigProvider);
    final TokenManager tokenManager = ref.watch(tokenManagerProvider);
    return QuantApiClient(
      config: QuantApiConfig(
        baseUrl: config.apiBaseUrl,
        // TODO(UNVERIFIED): quantchat's OAuth2 token path — not yet verified
        // against the backend; mirrors quantmail's verified
        // `phase0/AUTH_CONTRACT.md` §1.4. Kept as the legacy path; unused
        // while tokenRefresher is set.
        refreshEndpoint: _oauthTokenPath,
        timeout: config.requestTimeout,
        onAuthFailure: () => tokenManager.clearTokens(),
        tokenRefresher: (String refreshToken) async {
          // Bare Dio: no auth/refresh/retry interceptors on the token call.
          final AuthApi authApi = AuthApi(baseUrl: config.ssoBaseUrl);
          try {
            final tokens = await authApi.refreshToken(refreshToken);
            return <String, String>{
              'accessToken': tokens.accessToken,
              'refreshToken': tokens.refreshToken,
            };
          } on OAuthException catch (e) {
            // 400 invalid_grant = the refresh token is revoked/expired (or
            // the family was revoked on reuse) → signed out. Clear now; the
            // interceptor's failure path clears + notifies again
            // (idempotent).
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
        data: (AuthState state) => state.isAuthenticated,
        orElse: () => false,
      ),
  name: 'isAuthenticatedProvider',
);

// -- Token-path constant --------------------------------------------------------
// W3's AppConfig carries no `oauthTokenPath` field (only the four core
// fields plus oauthRedirectUri/requestTimeout/refreshLeeway). This mirrors
// quantmail's AppConfig default until it is verified against the quantchat
// backend and added there.

/// OAuth2 token endpoint path (resolved against [AppConfig.ssoBaseUrl]).
///
/// TODO(UNVERIFIED): not yet verified against the quantchat backend; mirrors
/// quantmail's verified `phase0/AUTH_CONTRACT.md` §1.4.
const String _oauthTokenPath = '/oauth/token';
