// ============================================================================
// gram_core - auth providers + session state
// ============================================================================
//
// Copy-adapt of phase1 `quant_core`'s auth providers, retargeted at the
// QuantGram SSO flow (no password/2FA bootstrap — system browser →
// custom-scheme callback).
//
// Provider graph:
//
//   appConfigProvider (defined below — W3 owns the provider graph)
//        │
//        ├──▶ authApiProvider (bare-Dio GramAuthApi)
//        │
//   tokenManagerProvider ───┼──▶ authRepositoryProvider (AuthRepository)
//        │                  │         │
//        │                  │         └── (refreshMutexProvider: RefreshMutex,
//        │                  │              app-wide single instance — S1)
//        │                  │
//        └──▶ authStateProvider (StreamProvider<AuthState>)
//                                │
//                                └──▶ isAuthenticatedProvider (bool)
//
//   pendingOAuthRedirectProvider (Uri?, set by the /oauth/callback route)
//        │
//        └──▶ authSessionProvider (AsyncNotifier<AuthSessionState>)
//
// Silent token-refresh *scheduling* is NOT done here — `silent_refresh.dart`
// owns it (F2: injectable scheduler). This layer only reacts to explicit
// session events.
//
// W1 DEPENDENCY: none — [AppConfig] lives in W1's `src/config/app_config.dart`
// (already landed); [appConfigProvider] is defined in THIS file (W3 owns the
// provider graph per the W1/W3 split noted in `gram_core.dart`).

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'auth_api.dart';
import 'auth_exceptions.dart';
import 'auth_repository.dart';
import 'refresh_mutex.dart';
import 'token_manager.dart';

/// Compile-time configuration, override-friendly per flavor / test.
///
/// Defaults come from `--dart-define` flags (see [AppConfig]); override with
/// `appConfigProvider.overrideWithValue(const AppConfig(apiBaseUrl: ...))`.
/// Defined here (W3) per the W1/W3 split: W1 owns `AppConfig`, W3 owns the
/// provider graph.
final appConfigProvider = Provider<AppConfig>(
  (ref) => const AppConfig(),
  name: 'appConfigProvider',
);

/// Shared token manager backed by the platform secure store.
///
/// The default storage is [SecureTokenStorage] (flutter_secure_storage:
/// encryptedSharedPreferences on Android, keychain when-unlocked on iOS).
/// Tests override this provider with
/// `TokenManager(storage: InMemoryTokenStorage())`.
final tokenManagerProvider = Provider<TokenManager>(
  (ref) {
    final manager = TokenManager();
    ref.onDispose(manager.dispose);
    return manager;
  },
  name: 'tokenManagerProvider',
);

/// Bare-Dio OAuth2 client for the token/authorize/revoke endpoints.
///
/// Uses its own Dio instance (no auth/refresh/retry interceptors): token
/// calls carry no Bearer header and must fail fast rather than enter the
/// refresh loop. The base URL follows [appConfigProvider].
final authApiProvider = Provider<GramAuthApi>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return GramAuthApi(
      baseUrl: config.apiBaseUrl,
      timeout: config.requestTimeout,
    );
  },
  name: 'authApiProvider',
);

/// App-wide single-flight refresh guard (S1 fix, security-audit 2026-10-03).
///
/// ONE instance per container, shared by `AuthRepository.refreshSession`
/// (used by both the silent-refresh timer and the 401 interceptor). Never
/// create a second mutex for refresh — that would reintroduce the race.
final refreshMutexProvider = Provider<RefreshMutex>(
  (ref) => RefreshMutex(),
  name: 'refreshMutexProvider',
);

/// Repository orchestrating the QuantGram SSO flow (`src/auth/auth_repository.dart`).
///
/// Wired from [authApiProvider], [tokenManagerProvider], [refreshMutexProvider]
/// and the compile-time [appConfigProvider] values (`oauthClientId`,
/// `oauthRedirectUri`).
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return AuthRepository(
      authApi: ref.watch(authApiProvider),
      tokenManager: ref.watch(tokenManagerProvider),
      refreshMutex: ref.watch(refreshMutexProvider),
      oauthClientId: config.oauthClientId,
      // Honors the --dart-define GRAM_OAUTH_REDIRECT_URI override; default
      // matches AuthRepository.defaultRedirectUri.
      redirectUri: config.oauthRedirectUri,
    );
  },
  name: 'authRepositoryProvider',
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

/// Synchronous derived flag for routing/guards (e.g. go_router redirect).
///
/// `true` only when the session state is [AuthAuthenticated]; `false` while
/// the initial hydration is still loading.
final isAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authSessionProvider).valueOrNull is AuthAuthenticated,
  name: 'isAuthenticatedProvider',
);

/// Incoming OAuth redirect URI from the system-browser SSO flow.
///
/// The `/oauth/callback` go_router route writes the full callback URI here;
/// [AuthSessionNotifier] consumes it via
/// [AuthSessionNotifier.completeOAuthCallback] and resets it to `null`.
final pendingOAuthRedirectProvider = StateProvider<Uri?>(
  (ref) => null,
  name: 'pendingOAuthRedirectProvider',
);

// -- Session state ------------------------------------------------------------

/// Sealed session state for the QuantGram SSO flow.
///
/// The notifier itself is an [AsyncNotifier], so the *initial* hydration
/// surfaces as [AsyncLoading]; these states describe the session once known.
sealed class AuthSessionState {
  const AuthSessionState();
}

/// No session known yet (before first login, or after logout).
class AuthInitial extends AuthSessionState {
  const AuthInitial();
}

/// A session operation (OAuth callback, logout) is in flight.
class AuthLoading extends AuthSessionState {
  const AuthLoading();
}

/// The SSO flow needs the system browser: open [authorizeUrl] there (the
/// login screen owns the browser launch and the callback routing).
class AuthConsentRequired extends AuthSessionState {
  /// The authorization URL to open (PKCE `code_challenge` included).
  final Uri authorizeUrl;

  const AuthConsentRequired(this.authorizeUrl);
}

/// A valid OAuth session exists (tokens stored in the [TokenManager]).
class AuthAuthenticated extends AuthSessionState {
  const AuthAuthenticated();
}

/// The last session operation failed; [message] is safe to show in UI.
class AuthFailure extends AuthSessionState {
  /// Human-readable failure reason.
  final String message;

  const AuthFailure(this.message);
}

// -- Session notifier ---------------------------------------------------------

/// Drives the SSO login → logout lifecycle.
///
/// Never throws: every public method catches repository errors and lands on
/// [AuthFailure] (or the relevant terminal state) instead of propagating.
class AuthSessionNotifier extends AsyncNotifier<AuthSessionState> {
  @override
  Future<AuthSessionState> build() async {
    // Synchronous subscriptions first: no ref.watch/ref.listen after the
    // first await, so dependencies are registered deterministically.
    final manager = ref.watch(tokenManagerProvider);

    // Consume OAuth redirects posted by the /oauth/callback route.
    ref.listen<Uri?>(pendingOAuthRedirectProvider, (previous, next) {
      final uri = next;
      if (uri == null) return;
      // Reset first so a later rebuild cannot re-trigger the flow.
      ref.read(pendingOAuthRedirectProvider.notifier).state = null;
      unawaited(completeOAuthCallback(uri));
    });

    // NOTE: silent-refresh *scheduling* lives in silent_refresh.dart (own
    // provider, own file, F2-injectable); this notifier only reacts to
    // explicit session events.

    await manager.hydrate();
    return manager.isAuthenticated()
        ? const AuthAuthenticated()
        : const AuthInitial();
  }

  /// Starts the SSO flow: prepares the authorize request and surfaces the
  /// URL for the login screen to open in the system browser.
  ///
  /// Transitions: [AuthLoading] → [AuthConsentRequired] | [AuthFailure].
  /// The browser callback completes via [completeOAuthCallback] (or the
  /// [pendingOAuthRedirectProvider] listener).
  Future<void> beginSsoLogin() async {
    try {
      state = const AsyncData(AuthLoading());
      final pending =
          ref.read(authRepositoryProvider).prepareAuthorization();
      state = AsyncData(AuthConsentRequired(pending.authorizeUrl));
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Completes the system-browser SSO flow for [uri].
  ///
  /// Called directly and from the [pendingOAuthRedirectProvider] listener.
  Future<void> completeOAuthCallback(Uri uri) async {
    try {
      state = const AsyncData(AuthLoading());
      await ref.read(authRepositoryProvider).completeAuthorization(uri);
      state = const AsyncData(AuthAuthenticated());
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Signs out: revokes server-side and clears local tokens.
  ///
  /// Best-effort — even if the revoke call fails, the local session ends on
  /// [AuthInitial] (the token manager clears its tokens first, and its
  /// auth-state stream emits unauthenticated).
  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).signOut();
    } catch (_) {
      // Swallowed: the local session must end regardless.
    }
    state = const AsyncData(AuthInitial());
  }

  /// Maps repository-layer errors to session states. Never throws.
  void _applyAuthError(Object error) {
    if (error is AuthSignedOutException) {
      state = const AsyncData(
        AuthFailure('Your session was revoked. Please sign in again.'),
      );
    } else if (error is AuthException) {
      state = AsyncData(AuthFailure(error.message));
    } else {
      state = AsyncData(AuthFailure('Unexpected error: $error'));
    }
  }
}

/// Session notifier provider (override-friendly: tests override
/// [authRepositoryProvider] with a fake).
final authSessionProvider =
    AsyncNotifierProvider<AuthSessionNotifier, AuthSessionState>(
  AuthSessionNotifier.new,
  name: 'authSessionProvider',
);
