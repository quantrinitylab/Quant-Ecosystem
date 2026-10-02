// ============================================================================
// quantmax_core - token manager (re-exported foundation primitive)
// ============================================================================
//
// Single source of truth: the secure token store + auth-state broadcast
// live in `quant_foundation` (`phase0/foundation/lib/src/auth/`). This file
// only re-exports them under the quantmax_core surface so the rest of the
// package (and W1's barrel) has one import root.
//
// [TokenManager]: in-memory cache, hydrate-once from [TokenStorage], secure
// persistent backing via [SecureTokenStorage] (flutter_secure_storage:
// encryptedSharedPreferences on Android, keychain after-first-unlock on
// iOS), [InMemoryTokenStorage] for tests, and a broadcast auth-state stream
// ([AuthStatus]/[AuthState]).
//
// Storage keys (`TokenKeys.accessToken` / `TokenKeys.refreshToken`) match the
// TS TokenManager defaults, so conventions stay consistent across clients.

export 'package:quant_foundation/quant_foundation.dart'
    show
        AuthState,
        AuthStatus,
        InMemoryTokenStorage,
        SecureTokenStorage,
        TokenKeys,
        TokenManager,
        TokenStorage;
