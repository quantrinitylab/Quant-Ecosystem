// ============================================================================
// quantmax_core - authentication exceptions (QuantMail SSO)
// ============================================================================
//
// Typed failures surfaced by [QuantMaxAuthRepository]. Transport-level OAuth2
// errors ([OAuthException] from the auth transport) are wrapped into
// [AuthException] so app code only handles this vocabulary.
//
// QuantMax authenticates via QuantMail SSO (OAuth2 + PKCE, D1): there is no
// password login and no TOTP step in this package — the SSO happens in the
// system browser against the QuantMail web session.

import 'package:quant_foundation/quant_foundation.dart' show AuthorizeRequest;

/// Generic authentication failure.
///
/// Carries a human-readable [message] and, when the failure maps to a known
/// wire error (e.g. `invalid_grant`, `state_mismatch`), its [code].
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

/// The SSO authorization needs the user in a browser: open
/// [AuthorizeRequest.url] in the system browser and finish the flow with
/// `QuantMaxAuthRepository.completeBrowserUpgrade` when the redirect
/// arrives. The request carries the PKCE `codeVerifier` and the `state` to
/// verify on the callback.
class ConsentRequiredException implements Exception {
  /// The in-flight authorization request (verifier + state).
  final AuthorizeRequest request;

  /// Creates the consent-required signal.
  const ConsentRequiredException(this.request);

  @override
  String toString() => 'ConsentRequiredException()';
}
