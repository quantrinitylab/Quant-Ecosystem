// ============================================================================
// chat_core - auth providers + session state (QuantChat, shift 1)
//
// Port of quantmail's `quant_core/.../auth_providers.dart` (Phase 1 M2),
// adapted for QuantChat's auth contract (W3):
//
//   AuthRepository(authApi, tokenManager, ssoBaseUrl, apiBaseUrl, webOrigin,
//       oauthClientId, redirectUri = 'quantchat://oauth/callback')
//   AppConfig(ssoBaseUrl, apiBaseUrl, webOrigin, oauthClientId)
//
//   sealed AuthSessionState + subclasses with POSITIONAL constructors
//   (AuthInitial/AuthLoading/AuthTwoFactorRequired(challenge)/
//    AuthConsentRequired(authorizeUrl)/AuthAuthenticated/AuthFailure(message))
//
// Imports `package:quant_foundation` (phase0) for
// [AuthApi], [TokenManager] and the token primitives. `auth_repository.dart`
// and `auth_exceptions.dart` (this directory) are W3's workstream.
//
// Provider graph:
//
//   appConfigProvider ──▶ authApiProvider (bare-Dio AuthApi, ssoBaseUrl)
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
// owns it. This layer only reacts to explicit session events.

import 'dart:async';

import 'package:quant_foundation/quant_foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import 'auth_exceptions.dart';
import 'auth_repository.dart';

/// Bare-Dio OAuth2 client for the token/authorize/revoke endpoints.
///
/// Uses its own Dio instance (no auth/refresh/retry interceptors): token
/// calls carry no Bearer header and must fail fast rather than enter the
/// refresh loop. The base URL follows [AppConfig.ssoBaseUrl] — QuantChat's
/// OAuth2 endpoints live on the SSO host, unlike QuantMail where they shared
/// the API host.
final authApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(baseUrl: ref.watch(appConfigProvider).ssoBaseUrl),
  name: 'authApiProvider',
);

/// Repository orchestrating the login / 2FA / OAuth-upgrade flows (W3:
/// `src/auth/auth_repository.dart`).
///
/// Wired from [authApiProvider], [tokenManagerProvider] and the compile-time
/// [appConfigProvider] values. `redirectUri` is intentionally NOT passed:
/// W3's contract defaults it to `quantchat://oauth/callback`.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return AuthRepository(
      authApi: ref.watch(authApiProvider),
      tokenManager: ref.watch(tokenManagerProvider),
      ssoBaseUrl: config.ssoBaseUrl,
      apiBaseUrl: config.apiBaseUrl,
      webOrigin: config.webOrigin,
      oauthClientId: config.oauthClientId,
    );
  },
  name: 'authRepositoryProvider',
);

/// Incoming OAuth redirect URI from the system-browser consent flow.
///
/// The `/oauth/callback` go_router route writes the full callback URI here
/// (`quantchat://oauth/callback?code=…&state=…`); [AuthSessionNotifier]
/// consumes it via [AuthSessionNotifier.completeOAuthCallback] and resets it
/// to `null`.
final pendingOAuthRedirectProvider = StateProvider<Uri?>(
  (ref) => null,
  name: 'pendingOAuthRedirectProvider',
);

// -- Session state ------------------------------------------------------------

/// Sealed session state for the QuantChat auth slice.
///
/// The notifier itself is an [AsyncNotifier], so the *initial* hydration
/// surfaces as [AsyncLoading]; these states describe the session once known.
///
/// All subclasses use POSITIONAL constructors — named arguments are a known
/// compile break (QA caught this exact bug in quantmail).
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

/// The password was accepted but the backend requires a TOTP second factor.
class AuthTwoFactorRequired extends AuthSessionState {
  /// Opaque challenge issued by the backend; hand it back to
  /// [AuthSessionNotifier.submitTotp] together with the user's code.
  final String challenge;

  const AuthTwoFactorRequired(this.challenge);
}

/// OAuth tokens need fresh user consent: open [authorizeUrl] in the system
/// browser (the login screen owns the browser launch and the callback
/// routing).
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

  /// Completes the system-browser OAuth consent for [uri].
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
