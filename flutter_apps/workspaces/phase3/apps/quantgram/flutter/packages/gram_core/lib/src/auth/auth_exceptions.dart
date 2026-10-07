// ============================================================================
// gram_core - authentication exceptions
// ============================================================================
//
// Copy-adapt of `quant_core`'s auth exceptions (phase1). Typed failures
// surfaced by [AuthRepository]. Transport-level OAuth2 errors ([OAuthException]
// from `auth_api.dart`) are wrapped into [AuthException] so app code only
// handles this vocabulary.
//
// Adaptation note: QuantGram is SSO-only (system browser → custom-scheme
// callback) — there is no email/password + TOTP bootstrap, so the
// `LoginResult` / `LoginSucceeded` / `LoginTwoFactorRequired` types from
// quant_core are deliberately NOT carried over. `ConsentRequiredException`
// is also dropped: the browser IS the consent surface in this flow.

/// Generic authentication failure.
///
/// Carries a human-readable [message] and, when the failure maps to a known
/// wire error (e.g. `invalid_grant`), its [code].
class AuthException implements Exception {
  /// Human-readable failure description.
  final String message;

  /// Machine-readable error code when the failure maps to a known wire
  /// error; null for transport/shape failures.
  final String? code;

  /// Creates an authentication failure.
  const AuthException(this.message, {this.code});

  @override
  String toString() =>
      'AuthException(${code != null ? '$code: ' : ''}$message)';
}

/// The stored session is dead: the refresh token was invalid, revoked, or
/// reused (family revocation). Local tokens have been cleared; the caller
/// must route the user back to login.
class AuthSignedOutException implements Exception {
  /// Creates the signed-out signal.
  const AuthSignedOutException();

  @override
  String toString() => 'AuthSignedOutException()';
}
