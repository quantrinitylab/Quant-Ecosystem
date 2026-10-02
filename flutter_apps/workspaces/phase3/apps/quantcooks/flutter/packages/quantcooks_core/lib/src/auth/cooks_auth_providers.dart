// ============================================================================
// quantcooks_core - auth providers + session state
// ============================================================================
//
// Riverpod layer over the phase-0 foundation auth primitives ([AuthApi],
// [TokenManager]) and the [CooksAuthRepository].
//
// Provider graph:
//
//   appConfigProvider ──▶ cooksAuthApiProvider (bare-Dio AuthApi)
//                           │
//   cooksTokenManagerProvider ┼──▶ cooksAuthRepositoryProvider
//                           │        (CooksAuthRepository)
//   pendingOAuthRedirectProvider (Uri?, set by the /oauth/callback route)
//                           │
//   cooksAuthRepositoryProvider ┴──▶ cooksAuthSessionProvider
//                                (AsyncNotifier<CooksAuthSessionState>)
//                                     │
//                                     ├──▶ isSessionAuthenticatedProvider
//                                     └──▶ currentAccessTokenProvider
//
// Silent token-refresh *scheduling* is not done here — a later shift owns it
// in its own file. This layer only reacts to explicit session events.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../config/cooks_config.dart';
import 'cooks_auth_exceptions.dart';
import 'cooks_auth_repository.dart';

/// Compile-time QuantCooks configuration (override per flavor / in tests).
final appConfigProvider = Provider<CooksConfig>(
  (ref) => const CooksConfig(),
  name: 'appConfigProvider',
);

/// Secure token manager: in-memory cache + secure-storage backing +
/// auth-state broadcast.
final cooksTokenManagerProvider = Provider<TokenManager>(
  (ref) => TokenManager(),
  name: 'cooksTokenManagerProvider',
);

/// Bare-Dio OAuth2 client for the token/authorize/revoke endpoints.
///
/// Uses its own Dio instance (no auth/refresh/retry interceptors): token
/// calls carry no Bearer header and must fail fast rather than enter the
/// refresh loop. The base URL follows [appConfigProvider].
final cooksAuthApiProvider = Provider<AuthApi>(
  (ref) => AuthApi(baseUrl: ref.watch(appConfigProvider).apiBaseUrl),
  name: 'cooksAuthApiProvider',
);

/// Repository orchestrating the login / 2FA / OAuth-upgrade flows
/// (`auth/cooks_auth_repository.dart`).
///
/// Wired from [cooksAuthApiProvider], [cooksTokenManagerProvider] and the
/// compile-time [appConfigProvider] values (`apiBaseUrl`, `webOrigin`,
/// `oauthClientId`).
final cooksAuthRepositoryProvider = Provider<CooksAuthRepository>(
  (ref) {
    final config = ref.watch(appConfigProvider);
    return CooksAuthRepository(
      authApi: ref.watch(cooksAuthApiProvider),
      tokenManager: ref.watch(cooksTokenManagerProvider),
      apiBaseUrl: config.apiBaseUrl,
      webOrigin: config.webOrigin,
      oauthClientId: config.oauthClientId,
      redirectUri: config.oauthRedirectUri,
      scopes: config.scopes,
      timeout: config.requestTimeout,
    );
  },
  name: 'cooksAuthRepositoryProvider',
);

/// Incoming OAuth redirect URI from the system-browser bootstrap flow.
///
/// The `/oauth/callback` go_router route writes the full callback URI here;
/// [CooksAuthSessionNotifier] consumes it via
/// [CooksAuthSessionNotifier.completeOAuthCallback] and resets it to `null`.
final pendingOAuthRedirectProvider = StateProvider<Uri?>(
  (ref) => null,
  name: 'pendingOAuthRedirectProvider',
);

// -- Session state ------------------------------------------------------------

/// Sealed session state for the QuantCooks vertical slice.
///
/// The notifier itself is an [AsyncNotifier], so the *initial* hydration
/// surfaces as [AsyncLoading]; these states describe the session once known.
sealed class CooksAuthSessionState {
  const CooksAuthSessionState();
}

/// No session known yet (before first login, or after logout).
class CooksAuthInitial extends CooksAuthSessionState {
  const CooksAuthInitial();
}

/// A session operation (login, TOTP submit, OAuth callback) is in flight.
class CooksAuthLoading extends CooksAuthSessionState {
  const CooksAuthLoading();
}

/// The password was accepted but the backend requires a TOTP second factor.
class CooksAuthTwoFactorRequired extends CooksAuthSessionState {
  /// Opaque challenge issued by the backend; hand it back to
  /// [CooksAuthSessionNotifier.submitTotp] together with the user's code.
  final String challenge;

  const CooksAuthTwoFactorRequired(this.challenge);
}

/// OAuth tokens need fresh user consent: open [authorizeUrl] in the system
/// browser (the login screen owns the browser launch and the callback
/// routing).
class CooksAuthConsentRequired extends CooksAuthSessionState {
  /// The authorization URL to open (PKCE `code_challenge` included).
  final Uri authorizeUrl;

  const CooksAuthConsentRequired(this.authorizeUrl);
}

/// A valid OAuth session exists (tokens stored in the [TokenManager]).
class CooksAuthAuthenticated extends CooksAuthSessionState {
  const CooksAuthAuthenticated();
}

/// The last session operation failed; [message] is safe to show in UI.
class CooksAuthFailure extends CooksAuthSessionState {
  /// Human-readable failure reason.
  final String message;

  const CooksAuthFailure(this.message);
}

// -- Session notifier ---------------------------------------------------------

/// Drives the login → 2FA → OAuth-upgrade → logout lifecycle.
///
/// Never throws: every public method catches repository errors and lands on
/// [CooksAuthFailure] (or the relevant terminal state) instead of
/// propagating.
class CooksAuthSessionNotifier
    extends AsyncNotifier<CooksAuthSessionState> {
  @override
  Future<CooksAuthSessionState> build() async {
    // Synchronous subscriptions first: no ref.watch/ref.listen after the
    // first await, so dependencies are registered deterministically.
    final manager = ref.watch(cooksTokenManagerProvider);

    // Consume OAuth redirects posted by the /oauth/callback route.
    ref.listen<Uri?>(pendingOAuthRedirectProvider, (previous, next) {
      final uri = next;
      if (uri == null) return;
      // Reset first so a later rebuild cannot re-trigger the upgrade.
      ref.read(pendingOAuthRedirectProvider.notifier).state = null;
      unawaited(completeOAuthCallback(uri));
    });

    await manager.hydrate();
    return manager.isAuthenticated()
        ? const CooksAuthAuthenticated()
        : const CooksAuthInitial();
  }

  /// Password login: `POST /auth/login` → optional TOTP → OAuth token upgrade.
  ///
  /// Transitions: [CooksAuthLoading] → [CooksAuthTwoFactorRequired] |
  /// [CooksAuthAuthenticated] | [CooksAuthConsentRequired] |
  /// [CooksAuthFailure].
  Future<void> login({
    required String email,
    required String password,
  }) async {
    try {
      state = const AsyncData(CooksAuthLoading());
      final repository = ref.read(cooksAuthRepositoryProvider);
      final result = await repository.signInWithPassword(
        email: email,
        password: password,
      );
      switch (result) {
        case CooksLoginTwoFactorRequired(:final challenge):
          state = AsyncData(CooksAuthTwoFactorRequired(challenge));
        case CooksLoginSucceeded():
          await _upgradeToOAuthTokens(repository);
      }
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Starts the browser-driven Quant SSO flow ("Sign in with Quant").
  ///
  /// Builds the PKCE authorization URL via the repository and transitions
  /// to [CooksAuthConsentRequired] — the login screen opens the URL in the
  /// system browser; the `/oauth/callback` route finishes with
  /// [completeOAuthCallback].
  ///
  /// NOTE (AUTH_CONTRACT.md F1): the backend `GET /oauth/authorize`
  /// currently requires a pre-existing Bearer <redacted> native SSO bootstrap is
  /// the Phase-1 design item. This wires the PKCE + callback plumbing;
  /// the flow completes once the client is provisioned and the backend
  /// accepts the browser session.
  Future<void> startSsoLogin() async {
    try {
      state = const AsyncData(CooksAuthLoading());
      final repository = ref.read(cooksAuthRepositoryProvider);
      final url = repository.buildSsoAuthorizeUrl();
      state = AsyncData(CooksAuthConsentRequired(url));
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Submits the TOTP code for a pending [CooksAuthTwoFactorRequired]
  /// challenge.
  ///
  /// With no pending challenge this lands on [CooksAuthFailure] instead of
  /// calling the backend.
  Future<void> submitTotp(String code) async {
    final current = state.valueOrNull;
    if (current is! CooksAuthTwoFactorRequired) {
      state = const AsyncData(
        CooksAuthFailure('No two-factor challenge is pending.'),
      );
      return;
    }
    final challenge = current.challenge;
    try {
      state = const AsyncData(CooksAuthLoading());
      final repository = ref.read(cooksAuthRepositoryProvider);
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
      state = const AsyncData(CooksAuthLoading());
      await ref.read(cooksAuthRepositoryProvider).completeBrowserUpgrade(uri);
      state = const AsyncData(CooksAuthAuthenticated());
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Signs out: revokes server-side and clears local tokens.
  ///
  /// Best-effort — even if the revoke call fails, the local session ends on
  /// [CooksAuthInitial] (the repository clears local tokens regardless).
  Future<void> logout() async {
    try {
      await ref.read(cooksAuthRepositoryProvider).signOut();
    } catch (_) {
      // Swallowed: the local session must end regardless.
    }
    state = const AsyncData(CooksAuthInitial());
  }

  /// Exchanges the session access token for OAuth tokens.
  ///
  /// Success → [CooksAuthAuthenticated]; consent needed →
  /// [CooksAuthConsentRequired]; anything else → [CooksAuthFailure].
  Future<void> _upgradeToOAuthTokens(CooksAuthRepository repository) async {
    try {
      await repository.upgradeToOAuthTokens();
      state = const AsyncData(CooksAuthAuthenticated());
    } catch (e) {
      _applyAuthError(e);
    }
  }

  /// Maps repository-layer errors to session states. Never throws.
  void _applyAuthError(Object error) {
    if (error is CooksConsentRequiredException) {
      state = AsyncData(CooksAuthConsentRequired(error.request.url));
    } else if (error is CooksSignedOutException) {
      state = const AsyncData(
        CooksAuthFailure('Your session was revoked. Please sign in again.'),
      );
    } else if (error is CooksAuthException) {
      state = AsyncData(CooksAuthFailure(error.message));
    } else {
      state = AsyncData(CooksAuthFailure('Unexpected error: $error'));
    }
  }
}

/// Session notifier provider (override-friendly: tests override
/// [cooksAuthRepositoryProvider] with a fake).
final cooksAuthSessionProvider =
    AsyncNotifierProvider<CooksAuthSessionNotifier, CooksAuthSessionState>(
  CooksAuthSessionNotifier.new,
  name: 'cooksAuthSessionProvider',
);

/// Synchronous derived flag for routing/guards (e.g. go_router redirect).
///
/// `true` only when the session state is [CooksAuthAuthenticated]; `false`
/// while the initial hydration is still loading.
final isSessionAuthenticatedProvider = Provider<bool>(
  (ref) =>
      ref.watch(cooksAuthSessionProvider).valueOrNull
          is CooksAuthAuthenticated,
  name: 'isSessionAuthenticatedProvider',
);

/// Current access token, streamed from the token manager's auth-state
/// broadcast. `null` while signed out or before hydration.
final currentAccessTokenProvider = StreamProvider<String?>(
  (ref) => ref
      .watch(cooksTokenManagerProvider)
      .onAuthStateChanged
      .map((state) => state.accessToken),
  name: 'currentAccessTokenProvider',
);
