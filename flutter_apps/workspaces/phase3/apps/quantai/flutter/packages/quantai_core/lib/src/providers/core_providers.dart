// ============================================================================
// quantai_core - Riverpod provider graph (QuantAI dedicated app)
// ============================================================================
//
// Adapted from QuantMail's phase1 pattern
// (`phase1/apps/quantmail/flutter/packages/quant_core/lib/src/providers/core_providers.dart`).
//
// Differences vs the QuantMail graph:
// - The API client is [QuantAiApiClient] (this app's D5-tuned client with the
//   interactive-AI retry schedule), not foundation [QuantApiClient].
// - Two app-specific providers are exposed: [usageGateProvider] (D5 credits
//   metering client-side gate) and [sseClientProvider] (streaming transport).
//
// Provider graph:
//
//   appConfigProvider ──────┬──▶ apiClientProvider (QuantAiApiClient)
//                           │
//   tokenManagerProvider ───┼──▶ authStateProvider (StreamProvider<AuthState>)
//                           │         │
//                           │         └──▶ isAuthenticatedProvider (bool)
//                           │
//                           ├──▶ apiClientProvider (token injection + refresh)
//                           └──▶ sseClientProvider (Bearer from tokenManager)

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../api/quantai_api_client.dart';
import '../api/sse_client.dart';
import '../api/usage_gate.dart';
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

/// Shared API client: [QuantAiApiClient] wired to the token manager with the
/// foundation interceptor stack (onRequest: Auth → Retry → Refresh;
/// onError runs in reverse: Refresh → Retry → Auth).
///
/// The retry schedule is the D5 interactive-AI schedule `[0, 200ms, 800ms]`
/// (see [QuantAiApiClient.create]): interactive AI calls fail fast so the UI
/// can stream a partial/typed response or a retry affordance instead of
/// stalling on a 60s background schedule.
///
/// Refresh contract decision (M2, verified `phase0/AUTH_CONTRACT.md` §1.4):
/// the client uses the NATIVE OAuth2 contract — `POST /oauth/token` with JSON
/// `{"grant_type":"refresh_token","refresh_token":"…"}` returning snake_case
/// tokens, with ROTATION (both tokens stored). The explicit [tokenRefresher]
/// delegate below keeps the refresh transport visible at the wiring site and
/// maps `invalid_grant` to an immediate sign-out; the refresh call uses a bare
/// [AuthApi] (no interceptors), so it can never re-enter the refresh loop.
final apiClientProvider = Provider<QuantAiApiClient>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    final tokenManager = ref.watch(tokenManagerProvider);
    return QuantAiApiClient.create(
      config: config,
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

/// D5 credits-metering client-side gate (Bet 2).
///
/// Currently a stub that fails OPEN in dev ([UsageGate.checkBeforeAction]
/// returns [UsageCheckResult.unverified]) until the backend metering contract
/// exists — see `TODO(UNVERIFIED)` in `api/usage_gate.dart`.
final usageGateProvider = Provider<UsageGate>(
  (ref) => UsageGate(apiClient: ref.watch(apiClientProvider)),
  name: 'usageGateProvider',
);

/// SSE streaming transport for interactive AI responses (D5).
///
/// Shares the API client's Dio (same interceptor stack) and reads Bearer
/// tokens from the token manager; the SSE connect timeout comes from
/// [AppConfig.aiStreamTimeout].
final sseClientProvider = Provider<QuantAiSseClient>(
  (ref) => QuantAiSseClient(
    dio: ref.watch(apiClientProvider).dio,
    tokenManager: ref.watch(tokenManagerProvider),
    connectTimeout: ref.watch(appConfigProvider).aiStreamTimeout,
  ),
  name: 'sseClientProvider',
);
