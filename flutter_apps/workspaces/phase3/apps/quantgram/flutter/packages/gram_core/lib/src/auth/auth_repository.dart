// ============================================================================
// gram_core - AuthRepository: QuantGram SSO (OAuth2 + PKCE) orchestration
// ============================================================================
//
// Copy-adapt of phase1 `quant_core`'s AuthRepository, retargeted at the
// QuantGram SSO flow:
//
//   1. [prepareAuthorization] builds the authorize URL (fresh [PkcePair] +
//      `state`); the app opens it in the system browser.
//   2. The custom-scheme redirect comes back to the app; [completeAuthorization]
//      verifies `state`, surfaces provider errors, and calls [signInWithCode].
//   3. [signInWithCode] exchanges the code (PKCE) and stores the token pair.
//   4. [refreshSession] rotates the pair proactively (silent-refresh timer)
//      and reactively (the 401 interceptor calls this same method).
//   5. [signOut] revokes best-effort and wipes local tokens.
//
// S1 fix (security-audit 2026-10-03): [refreshSession] funnels EVERY refresh
// through the injected [RefreshMutex] — the 401 interceptor and the
// silent-refresh timer share the repository, so they share the mutex and can
// never fire two concurrent refresh grants (which would trigger rotation
// family-revocation and a forced sign-out).
//
// Only contract-known endpoints are used: `GET /oauth/authorize` and
// `POST /oauth/token` (+ `POST /oauth/revoke` on sign-out). Anything else is
// marked TODO(UNVERIFIED).

import 'auth_api.dart';
import 'auth_exceptions.dart';
import 'pkce.dart';
import 'refresh_mutex.dart';
import 'token_manager.dart';

/// Optional override for the refresh transport (test seam).
///
/// Receives the stored refresh token and returns the rotated pair as a map
/// with `accessToken` / `refreshToken` (camelCase, matching the phase0
/// convention), or null on failure. When set, it is used INSTEAD of the
/// verified [GramAuthApi.refreshToken] transport — still under the
/// [RefreshMutex], so the S1 single-flight guarantee holds in tests too.
typedef RefreshTokensFn = Future<Map<String, String>?> Function(
    String refreshToken);

/// In-flight SSO authorization request, awaiting the browser callback.
///
/// Created by [prepareAuthorization]; consumed (and cleared) by
/// [completeAuthorization] or [signOut].
class PendingAuthorization {
  /// The URL to open in the system browser.
  final Uri authorizeUrl;

  /// The PKCE verifier to present at the code exchange. Keep secret.
  final String codeVerifier;

  /// The `state` to verify against the callback (CSRF protection).
  final String state;

  /// Creates a pending authorization request.
  const PendingAuthorization({
    required this.authorizeUrl,
    required this.codeVerifier,
    required this.state,
  });
}

/// Orchestrates QuantGram SSO authentication.
///
/// Constructed from the auth primitives plus deployment config; exposed to
/// the app through Riverpod providers (see `auth_providers.dart`). The
/// injected dependencies ([authApi], [tokenManager], [refreshMutex]) are
/// owned by the caller — this repository never disposes them.
class AuthRepository {
  /// Default custom-scheme redirect URI for the QuantGram Flutter client.
  ///
  /// TODO(UNVERIFIED): the registered QuantGram `client_id` and redirect
  /// URIs are not confirmed yet (no QuantGram spec — app-foundations pending).
  /// `quantgram://oauth/callback` follows the quantmail convention
  /// (`quantmail://oauth/callback`, verified in `phase0/AUTH_CONTRACT.md`
  /// §1.1); must be byte-identical between authorize and token calls either
  /// way (the backend enforces redirect_uri rebinding).
  static const String defaultRedirectUri = 'quantgram://oauth/callback';

  /// OAuth2 PKCE transport (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`).
  final GramAuthApi authApi;

  /// Secure token store + in-memory cache + auth-state broadcast.
  final TokenManager tokenManager;

  /// Single-flight guard shared by the silent-refresh timer and the 401
  /// interceptor (S1 fix). MUST be the app-wide instance from
  /// [refreshMutexProvider] — a second mutex instance would reintroduce the
  /// race this guard exists to prevent.
  final RefreshMutex refreshMutex;

  /// Public OAuth2 client id for the QuantGram Flutter client.
  ///
  /// TODO(UNVERIFIED): unknown whether a quantgram client is registered yet.
  /// Empty until provisioned — [prepareAuthorization] and [signInWithCode]
  /// fail loudly instead of sending an empty `client_id`.
  final String oauthClientId;

  /// Redirect URI used for the PKCE flow. Defaults to [defaultRedirectUri].
  final String redirectUri;

  /// Optional custom refresh transport (see [RefreshTokensFn]); used under
  /// the mutex instead of [GramAuthApi.refreshToken] when set.
  final RefreshTokensFn? tokenRefresher;

  /// In-flight SSO request awaiting the browser callback. Set by
  /// [prepareAuthorization]; cleared by [completeAuthorization] and
  /// [signOut].
  PendingAuthorization? _pending;

  /// Creates the repository.
  AuthRepository({
    required this.authApi,
    required this.tokenManager,
    required this.refreshMutex,
    required this.oauthClientId,
    this.redirectUri = defaultRedirectUri,
    this.tokenRefresher,
  });

  /// The in-flight SSO authorization request (non-null while a browser
  /// round-trip is outstanding).
  PendingAuthorization? get pendingAuthorization => _pending;

  /// Broadcast stream of auth-state changes (delegates to [TokenManager]).
  Stream<AuthState> get sessionStream => tokenManager.onAuthStateChanged;

  /// Current auth-state snapshot (synchronous, from the in-memory cache).
  AuthState get currentSession => tokenManager.currentState;

  /// Starts the SSO flow: builds the authorize URL with a fresh [PkcePair]
  /// and `state`.
  ///
  /// Open the returned [PendingAuthorization.authorizeUrl] in the system
  /// browser; the custom-scheme redirect arrives via the app's
  /// `/oauth/callback` route → [completeAuthorization]. Throws
  /// [AuthException] (`client_not_provisioned`) when [oauthClientId] is empty.
  PendingAuthorization prepareAuthorization({
    List<String> scopes = const ['openid', 'profile', 'email'],
  }) {
    _assertClientProvisioned();
    final pkce = PkcePair.generate();
    final state = generateOAuthState();
    final url = authApi.buildAuthorizeUrl(
      clientId: oauthClientId,
      redirectUri: redirectUri,
      pkce: pkce,
      scopes: scopes,
      state: state,
    );
    final pending = PendingAuthorization(
      authorizeUrl: url,
      codeVerifier: pkce.verifier,
      state: state,
    );
    _pending = pending;
    return pending;
  }

  /// Completes the SSO flow for the incoming custom-scheme [callbackUri].
  ///
  /// Verifies `state` against the pending request (mismatch →
  /// [AuthException] `state_mismatch`), surfaces an `error` query param
  /// (`access_denied`, …), then exchanges the `code` (PKCE) and stores the
  /// token pair. Clears the pending request in all cases.
  Future<void> completeAuthorization(Uri callbackUri) async {
    final pending = _pending;
    if (pending == null) {
      throw const AuthException(
        'No pending authorization request — call prepareAuthorization first',
        code: 'no_pending_request',
      );
    }
    try {
      final params = callbackUri.queryParameters;
      if (params['state'] != pending.state) {
        throw const AuthException(
          'OAuth state mismatch — possible CSRF attack',
          code: 'state_mismatch',
        );
      }
      final error = params['error'];
      if (error != null) {
        final description = params['error_description'];
        throw AuthException(
          'Authorization failed ($error)'
          '${description != null ? ': $description' : ''}',
          code: error,
        );
      }
      final code = params['code'];
      if (code == null || code.isEmpty) {
        throw const AuthException(
          'Authorization response carried no code',
          code: 'missing_code',
        );
      }
      await signInWithCode(code: code, codeVerifier: pending.codeVerifier);
    } finally {
      _pending = null;
    }
  }

  /// Exchanges an authorization `code` for the token pair (PKCE) and stores
  /// both tokens via [TokenManager.setTokens].
  ///
  /// Throws [AuthException] (`client_not_provisioned`) when [oauthClientId]
  /// is empty; wraps transport failures from [GramAuthApi].
  Future<void> signInWithCode({
    required String code,
    required String codeVerifier,
  }) async {
    _assertClientProvisioned();
    try {
      // redirect_uri must be byte-identical to the authorize-time value
      // (backend enforces rebinding); [redirectUri] is used for both calls.
      final tokens = await authApi.exchangeCode(
        code: code,
        codeVerifier: codeVerifier,
        clientId: oauthClientId,
        redirectUri: redirectUri,
      );
      await tokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
    } on OAuthException catch (e) {
      throw _wrapOAuth(e, 'Authorization code exchange');
    }
  }

  /// Refreshes the session (`POST /oauth/token`, `grant_type=refresh_token`).
  ///
  /// The backend ROTATES the pair: both returned tokens are stored and the
  /// old refresh token is discarded. Runs under [refreshMutex] (S1): whether
  /// this call comes from the silent-refresh timer or the 401 interceptor,
  /// concurrent callers share ONE network refresh.
  ///
  /// On `invalid_grant` (revoked / reused — family revocation) the local
  /// tokens are cleared and [AuthSignedOutException] is thrown so the UI
  /// routes back to login.
  Future<void> refreshSession() {
    return refreshMutex.run(_doRefresh);
  }

  /// Signs out: best-effort revocation of the stored refresh token
  /// (`POST /oauth/revoke` — always 200 per RFC 7009; failures are swallowed)
  /// followed by clearing local tokens and any pending authorization.
  Future<void> signOut() async {
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken != null && refreshToken.isNotEmpty) {
      try {
        await authApi.revokeToken(refreshToken);
      } on Object {
        // Best-effort: revocation failure must not block local sign-out.
      }
    }
    _pending = null;
    await tokenManager.clearTokens();
  }

  // -- Internals --------------------------------------------------------------

  void _assertClientProvisioned() {
    if (oauthClientId.isEmpty) {
      // TODO(UNVERIFIED): unknown whether a quantgram-flutter client is
      // registered yet — fail loudly instead of sending an empty client_id.
      throw const AuthException(
        'OAuth client not provisioned',
        code: 'client_not_provisioned',
      );
    }
  }

  /// The actual refresh work, executed at most once concurrently via
  /// [refreshMutex]. Never called directly — always through [refreshSession].
  Future<void> _doRefresh() async {
    await tokenManager.hydrate();
    final refreshToken = tokenManager.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const AuthException(
        'No refresh token stored — a fresh login is required',
        code: 'no_refresh_token',
      );
    }
    try {
      final refresher = tokenRefresher;
      if (refresher != null) {
        // Test seam: delegate owns the wire format; store the rotated pair.
        final tokens = await refresher(refreshToken);
        final newAccessToken = tokens?['accessToken'];
        final newRefreshToken = tokens?['refreshToken'];
        if (newAccessToken == null ||
            newAccessToken.isEmpty ||
            newRefreshToken == null ||
            newRefreshToken.isEmpty) {
          throw const AuthException(
            'Refresh transport returned no token pair',
            code: 'refresh_failed',
          );
        }
        await tokenManager.setTokens(newAccessToken, newRefreshToken);
        return;
      }
      // VERIFIED contract (board, backend-prep): POST /oauth/token JSON
      // {"grant_type":"refresh_token","refresh_token":"…"} (snake_case, NO
      // client_id) → snake_case TokenSet. The backend ROTATES: store BOTH
      // returned tokens, discard the presented one.
      final tokens = await authApi.refreshToken(refreshToken);
      await tokenManager.setTokens(tokens.accessToken, tokens.refreshToken);
    } on OAuthException catch (e) {
      if (e.error == 'invalid_grant') {
        await tokenManager.clearTokens();
        throw const AuthSignedOutException();
      }
      throw _wrapOAuth(e, 'Token refresh');
    }
  }

  /// Wraps a transport-level [OAuthException] as an [AuthException], keeping
  /// the OAuth2 error code in both [AuthException.code] and the message.
  AuthException _wrapOAuth(OAuthException e, String context) => AuthException(
        '$context failed (${e.error})'
        '${e.description != null ? ': ${e.description}' : ''}',
        code: e.error,
      );
}
