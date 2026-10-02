// ============================================================================
// quantube_core - auth providers + session state
// ============================================================================
//
// Riverpod layer over the phase0 foundation auth primitives ([AuthApi],
// [TokenManager]) and the [AuthRepository].
//
// Provider graph:
//
//   appConfigProvider ──▶ authApiProvider (bare-Dio AuthApi)
//                           │
//   tokenManagerProvider ────┼──▶ authRepositoryProvider (AuthRepository)
//                           │
//   pendingOAuthRedirectProvider (Uri?, set by the /oauth/callback route)
//                           │
//   authRepositoryProvider ──┴──▶ authSessionProvider
//                                (AsyncNotifier<AuthSessionState>)
//                                     │
//                                     └──▶ isSessionAuthenticatedProvider
//
// Silent token-refresh *scheduling* is NOT done here — `silent_refresh.dart`
// owns it in its own file. This layer only reacts to explicit session events.
//
// All exception/state constructors used here are POSITIONAL (see
// auth_exceptions.dart): named-args variants broke QA compile before — do not
// reintroduce them.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

// Scaffold-provided core providers (read-only here; another worker owns this
// file): appConfigProvider (AppConfig), tokenManagerProvider (TokenManager).
import '../providers/core_providers.dart';
import 'auth_exceptions.dart';
import 'auth_repository.dart';

/// Bare-Dio OAuth2 client for the token/authorize/revoke endpoints.
///
/// Uses its own Dio instance (no auth/refresh/retry interceptors): token
/// calls carry no Bearer header and must fail fast rather than enter the
/// refresh loop. The base URL follows [appConfigProvider]; the https-only
/// assertion from board S4 runs before the transport is built.
final authApiProvider = Provider<AuthApi>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    config.assertHttps();
    return AuthApi(baseUrl: config.apiBaseUrl);
  },
  name: 'authApiProvider',
);

/// Repository orchestrating the login / 2FA / OAuth-upgrade flows
/// (`src/auth/auth_repository.dart`), wired from [authApiProvider],
/// [tokenManagerProvider] and the compile-time [appConfigProvider] values
/// (`apiBaseUrl`, `webOrigin`, `oauthClientId`, `oauthRedirectUri`).
///
/// The [AuthRepository] constructor itself also enforces the https-only
/// assertion (board S4), so an `http://` base URL fails loudly at startup.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    config.assertHttps();
    return AuthRepository(
      authApi: ref.watch(authApiProvider),
      tokenManager: ref.watch(tokenManagerProvider),
      apiBaseUrl: config.apiBaseUrl,
      webOrigin: config.webOrigin,
      oauthClientId: config.oauthClientId,
      redirectUri: config.oauthRedirectUri,
      timeout: config.requestTimeout,
    );
  },
  name: 'authRepositoryProvider',
);

/// Incoming OAuth redirect URI from the system-browser bootstrap flow.
///
/// The `/oauth/callback` go_router route writes the full callback URI here;
/// [AuthSessionNotifier] consumes it via
/// [AuthSessionNotifier.completeOAuthCallback] and resets it to `null`.
final pendingOAuthRedirectProvider = StateProvider<Uri?>(
  (ref) => null,
  name: 'pendingOAuthRedirectProvider',
);

// -- Session state ------------------------------------------------------------

/// Sealed session state for the QuanTube auth vertical slice.
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

/// A session operation (login, TOTP submit, OAuth callback) is in flight.
class AuthLoading extends AuthSessionState {
  const AuthLoading();
}

/// The password was accepted but the backend requires a TOTP second factor
/// (same QuantMail SSO 2FA contract — QuanTube reuses the existing backend).
class AuthTwoFactorRequired extends AuthSessionState {
  /// Opaque challenge issued by the backend; hand it back to
  /// [AuthSessionNotifier.submitTotp] together with the user's code.
  final String challenge;

  /// Creates the 2FA-required state (positional constructor — keep it).
  const AuthTwoFactorRequired(this.challenge);
}

/// OAuth tokens need fresh user consent: open [authorizeUrl] in the system
/// browser (the login screen owns the browser launch and the callback
/// routing).
class AuthConsentRequired extends AuthSessionState {
  /// The authorization URL to open (PKCE `code_challenge` included).
  final Uri authorizeUrl;

  /// Creates the consent-required state (positional constructor — keep it).
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

  /// Creates the failure state (positional constructor — keep it).
  const AuthFailure(this.message);
}

// -- Session notifier ---------------------------------------------------------

/// Drives the login → 2FA → OAuth-upgrade → logout lifecycle.
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
      // Reset first so a later rebuild cannot re-trigger the upgrade.
      ref.read(pendingOAuthRedirectProvider.notifier).state = null;
      unawaited(completeOAuthCallback(uri));
    });

    // NOTE: silent-refresh *scheduling* is silent_refresh.dart's job (own
    // provider, own file); this notifier only reacts to explicit session
    // events.

    await manager.hydrate();
    return manager.isAuthenticated()
        ? const AuthAuthenticated()
        : const AuthInitial();
  }

  /// Password login: `POST /auth/login` → optional TOTP → OAuth token upgrade.
  ///
  /// Transitions: [AuthLoading] → [AuthTwoFactorRequired] |
  /// [AuthAuthenticated] | [AuthConsentRequired] | [AuthFailure].
  Future<void> login({
    required String email,
    required String password,
  }) async {
    try {
      state = const AsyncData(AuthLoading());
      final repository = ref.read(authRepositoryProvider);
      final result = await repository.signInWithPassword(
        email: email,
        password: password,
      );
      switch (result) {
        case LoginTwoFactorRequired(:final challenge):
          state = AsyncData(AuthTwoFactorRequired(challenge));
        case LoginSucceeded():
          await _upgradeToOAuthTokens(repository);
      }
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Submits the TOTP code for a pending [AuthTwoFactorRequired] challenge.
  ///
  /// With no pending challenge this lands on [AuthFailure] instead of
  /// calling the backend.
  Future<void> submitTotp(String code) async {
    final current = state.valueOrNull;
    if (current is! AuthTwoFactorRequired) {
      state = const AsyncData(
        AuthFailure('No two-factor challenge is pending.'),
      );
      return;
    }
    final challenge = current.challenge;
    try {
      state = const AsyncData(AuthLoading());
      final repository = ref.read(authRepositoryProvider);
      await repository.verifyTwoFactor(challenge: challenge, code: code);
      await _upgradeToOAuthTokens(repository);
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Completes the system-browser OAuth bootstrap for [uri].
  ///
  /// Called directly and from the [pendingOAuthRedirectProvider] listener.
  Future<void> completeOAuthCallback(Uri uri) async {
    try {
      state = const AsyncData(AuthLoading());
      await ref.read(authRepositoryProvider).completeBrowserUpgrade(uri);
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

  /// Exchanges the web session cookie for OAuth tokens after password / 2FA.
  ///
  /// Success → [AuthAuthenticated]; consent needed → [AuthConsentRequired];
  /// anything else → [AuthFailure].
  Future<void> _upgradeToOAuthTokens(AuthRepository repository) async {
    try {
      await repository.upgradeToOAuthTokens();
      state = const AsyncData(AuthAuthenticated());
    } catch (e) {
      _applyAuthError(e);
    }
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

/// Session notifier provider (override-friendly: tests override
/// [authRepositoryProvider] with a fake).
final authSessionProvider =
    AsyncNotifierProvider<AuthSessionNotifier, AuthSessionState>(
  AuthSessionNotifier.new,
  name: 'authSessionProvider',
);

/// Synchronous derived flag for routing/guards (e.g. go_router redirect).
///
/// `true` only when the session state is [AuthAuthenticated]; `false` while
/// the initial hydration is still loading.
final isSessionAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authSessionProvider).valueOrNull is AuthAuthenticated,
  name: 'isSessionAuthenticatedProvider',
);
