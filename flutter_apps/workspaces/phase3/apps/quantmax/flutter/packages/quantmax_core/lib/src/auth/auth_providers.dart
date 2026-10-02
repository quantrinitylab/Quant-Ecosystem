// ============================================================================
// quantmax_core - auth providers + SSO session state
// ============================================================================
//
// Riverpod layer over the auth transport ([QuantMaxAuthApi]), the secure
// token store ([TokenManager], via `tokenManagerProvider` from W1's
// `providers/core_providers.dart`), the shared [RefreshMutex] single flight
// (S1), and the SSO orchestration ([QuantMaxAuthRepository]).
//
// Provider graph:
//
//   appConfigProvider ──▶ quantMaxAuthApiProvider (bare-Dio, AppConfig paths)
//                           │
//   tokenManagerProvider ───┼──▶ quantMaxAuthRepositoryProvider
//                           │
//   refreshMutexProvider ───┼──▶ (shared by RefreshInterceptor + silent refresh)
//                           │
//   pendingOAuthRedirectProvider (Uri?, set by the /oauth/callback route)
//                           │
//   quantMaxAuthRepositoryProvider ──▶ authStateProvider
//                                     (AsyncNotifier<AuthSessionState>)
//                                          │
//                                          └──▶ isSessionAuthenticatedProvider
//
// CONTRACT NOTE: this file owns the provider named `authStateProvider`
// (AsyncNotifierProvider<AuthSessionState>) — the go_router redirect wiring
// (W1) imports THAT name. `providers/core_providers.dart` must NOT also
// define `authStateProvider`.
//
// Silent token-refresh *scheduling* is NOT done here — `silent_refresh.dart`
// owns it in its own file (and shares [RefreshMutex] with the 401-reactive
// path, S1). This layer only reacts to explicit session events.
//
// TODO(UNVERIFIED): [AppConfig] member names used below (`oauthAuthorizePath`,
// `oauthTokenPath`, `oauthRevokePath`, `oauthClientId`, `oauthRedirectUri`,
// `refreshLeeway`, `apiBaseUrl`) follow the phase1 `quant_core` pattern;
// confirm against W1's `config/app_config.dart` once it lands.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import 'auth_api.dart';
import 'auth_exceptions.dart';
import 'auth_repository.dart';
import 'refresh_mutex.dart';

/// Bare-Dio OAuth2 client for the token/authorize/revoke endpoints.
///
/// Uses its own Dio instance (no auth/refresh/retry interceptors): token
/// calls carry no Bearer header and must fail fast rather than enter the
/// refresh loop. Endpoint PATHS come from [AppConfig] (W1) — the contract
/// stays in one place instead of being hard-coded in the transport.
final quantMaxAuthApiProvider = Provider<QuantMaxAuthApi>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return QuantMaxAuthApi(
      baseUrl: config.apiBaseUrl,
      // TODO(UNVERIFIED): AppConfig member names (W1) — see file doc.
      authorizePath: config.oauthAuthorizePath,
      tokenPath: config.oauthTokenPath,
      // NOTE: AppConfig has no oauthRevokePath (W1) — the transport's
      // default '/oauth/revoke' (RFC 7009, verified) is used.
    );
  },
  name: 'quantMaxAuthApiProvider',
);

/// Shared refresh single flight (S1).
///
/// ONE instance per app lifetime, used by BOTH the 401-reactive
/// [RefreshInterceptor] (pass it into [QuantMaxApiClient]) and the proactive
/// `silentRefreshProvider` timer. Without this, a timer fire coinciding with
/// a 401 produces two concurrent refresh grants — the backend ROTATES
/// refresh tokens, so the second grant presents a revoked token and triggers
/// family revocation (spurious sign-out).
final refreshMutexProvider = Provider<RefreshMutex>(
  (ref) => RefreshMutex(),
  name: 'refreshMutexProvider',
);

/// Repository orchestrating the QuantMail SSO flows: browser sign-in
/// bootstrap, the OAuth2 + PKCE code exchange, silent refresh with
/// rotation, and sign-out.
///
/// Wired from [quantMaxAuthApiProvider], [tokenManagerProvider] and the
/// compile-time [appConfigProvider] values (`apiBaseUrl`, `oauthClientId`,
/// `oauthRedirectUri`).
final quantMaxAuthRepositoryProvider = Provider<QuantMaxAuthRepository>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return QuantMaxAuthRepository(
      authApi: ref.watch(quantMaxAuthApiProvider),
      tokenManager: ref.watch(tokenManagerProvider),
      apiBaseUrl: config.apiBaseUrl,
      oauthClientId: config.oauthClientId,
      // TODO(UNVERIFIED): AppConfig member name (W1) — see file doc.
      redirectUri: config.oauthRedirectUri,
    );
  },
  name: 'quantMaxAuthRepositoryProvider',
);

/// Incoming OAuth redirect URI from the system-browser SSO flow.
///
/// The `/oauth/callback` go_router route writes the full callback URI here;
/// [QuantMaxAuthSessionNotifier] consumes it via
/// [QuantMaxAuthSessionNotifier.completeOAuthCallback] and resets it to
/// `null`.
final pendingOAuthRedirectProvider = StateProvider<Uri?>(
  (ref) => null,
  name: 'pendingOAuthRedirectProvider',
);

// -- Session state ------------------------------------------------------------

/// Sealed session state for the QuantMax SSO vertical slice.
///
/// The notifier itself is an [AsyncNotifier], so the *initial* hydration
/// surfaces as [AsyncLoading]; these states describe the session once known.
sealed class AuthSessionState {
  const AuthSessionState();
}

/// No session known yet (before first sign-in, or after sign-out).
class AuthInitial extends AuthSessionState {
  const AuthInitial();
}

/// A session operation (browser sign-in, OAuth callback) is in flight.
class AuthLoading extends AuthSessionState {
  const AuthLoading();
}

/// SSO needs the user in the system browser: open [authorizeUrl] there
/// (browser launcher); the `/oauth/callback` route completes the flow.
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

/// Drives the QuantMail SSO lifecycle: browser sign-in → OAuth callback →
/// authenticated → sign-out.
///
/// Never throws: every public method catches repository errors and lands on
/// [AuthFailure] (or the relevant terminal state) instead of propagating.
class QuantMaxAuthSessionNotifier extends AsyncNotifier<AuthSessionState> {
  @override
  Future<AuthSessionState> build() async {
    // Synchronous subscriptions first: no ref.watch/ref.listen after the
    // first await, so dependencies are registered deterministically.
    final manager = ref.watch(tokenManagerProvider);

    // Consume OAuth redirects posted by the /oauth/callback route.
    ref.listen<Uri?>(pendingOAuthRedirectProvider, (previous, next) {
      final uri = next;
      if (uri == null) return;
      // Reset first so a later rebuild cannot re-trigger the upgrade.
      ref.read(pendingOAuthRedirectProvider.notifier).state = null;
      unawaited(completeOAuthCallback(uri));
    });

    // NOTE: silent-refresh *scheduling* lives in silent_refresh.dart (own
    // provider, own file, shared RefreshMutex per S1); this notifier only
    // reacts to explicit session events.

    await manager.hydrate();
    return manager.isAuthenticated()
        ? const AuthAuthenticated()
        : const AuthInitial();
  }

  /// Starts the browser SSO sign-in: builds the authorize URL and lands on
  /// [AuthConsentRequired] carrying it for the browser launcher.
  Future<void> startBrowserSignIn() async {
    try {
      state = const AsyncData(AuthLoading());
      final request =
          ref.read(quantMaxAuthRepositoryProvider).beginBrowserSignIn();
      state = AsyncData(AuthConsentRequired(request.url));
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Upgrades a pre-existing Bearer session token to the OAuth2 pair
  /// (the verified F1 direct-call path).
  ///
  /// Transitions: [AuthLoading] → [AuthAuthenticated] |
  /// [AuthConsentRequired] | [AuthFailure].
  Future<void> upgradeWithSessionToken(String sessionToken) async {
    try {
      state = const AsyncData(AuthLoading());
      await ref
          .read(quantMaxAuthRepositoryProvider)
          .upgradeWithSessionToken(sessionToken);
      state = const AsyncData(AuthAuthenticated());
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
      await ref.read(quantMaxAuthRepositoryProvider).completeBrowserUpgrade(uri);
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
      await ref.read(quantMaxAuthRepositoryProvider).signOut();
    } catch (_) {
      // Swallowed: the local session must end regardless.
    }
    state = const AsyncData(AuthInitial());
  }

  /// Maps repository-layer errors to session states. Never throws.
  void _applyAuthError(Object error) {
    if (error is ConsentRequiredException) {
      state = AsyncData(AuthConsentRequired(error.request.url));
    } else if (error is AuthSignedOutException) {
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

/// Session notifier provider — THE name the go_router redirect wiring (W1)
/// imports (see the contract note in this file's doc comment).
///
/// Override-friendly: tests override [quantMaxAuthRepositoryProvider] with
/// a fake.
final authStateProvider =
    AsyncNotifierProvider<QuantMaxAuthSessionNotifier, AuthSessionState>(
  QuantMaxAuthSessionNotifier.new,
  name: 'authStateProvider',
);

/// Synchronous derived flag for routing/guards (e.g. go_router redirect).
///
/// `true` only when the session state is [AuthAuthenticated]; `false` while
/// the initial hydration is still loading.
final isSessionAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authStateProvider).valueOrNull is AuthAuthenticated,
  name: 'isSessionAuthenticatedProvider',
);
