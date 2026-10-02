// ============================================================================
// quantcooks_core - authentication exceptions + login result types
// ============================================================================
//
// Typed failures surfaced by [CooksAuthRepository]. Transport-level OAuth2
// errors from the foundation ([OAuthException]) are wrapped into
// [CooksAuthException] so app code only handles this vocabulary.

import 'package:quant_foundation/quant_foundation.dart';

/// Generic QuantCooks authentication failure.
///
/// Carries a human-readable [message] and, when the failure maps to a known
/// wire error (e.g. `invalid_grant`, `UNTRUSTED_ORIGIN`), its [code].
class CooksAuthException implements Exception {
  /// Human-readable failure description.
  final String message;

  /// Machine-readable error code when the failure maps to a known wire
  /// error; null for transport/shape failures.
  final String? code;

  /// Creates an authentication failure.
  const CooksAuthException(this.message, {this.code});

  @override
  String toString() =>
      'CooksAuthException(${code != null ? '$code: ' : ''}$message)';
}

/// The stored session is dead: the refresh token was invalid, revoked, or
/// reused (family revocation). Local tokens have been cleared; the caller
/// must route the user back to login.
class CooksSignedOutException implements Exception {
  /// Creates the signed-out signal.
  const CooksSignedOutException();

  @override
  String toString() => 'CooksSignedOutException()';
}

/// `GET /oauth/authorize` answered `200` with the HTML consent screen instead
/// of a `302` redirect (no consent on file for this client).
///
/// Open [request].url in a browser and finish the flow with
/// `CooksAuthRepository.completeBrowserUpgrade`. The request carries the PKCE
/// `codeVerifier` and the `state` to verify on the callback.
class CooksConsentRequiredException implements Exception {
  /// The in-flight authorization request (verifier + state).
  final AuthorizeRequest request;

  /// Creates the consent-required signal.
  const CooksConsentRequiredException(this.request);

  @override
  String toString() => 'CooksConsentRequiredException()';
}

/// Outcome of `CooksAuthRepository.signInWithPassword`.
sealed class CooksLoginResult {
  /// Base outcome of a password sign-in attempt.
  const CooksLoginResult();
}

/// Password sign-in succeeded; the short-lived access token is stored.
class CooksLoginSucceeded extends CooksLoginResult {
  /// Creates the success outcome.
  const CooksLoginSucceeded();
}

/// The account requires a TOTP second factor; pass [challenge] to
/// `CooksAuthRepository.verifyTwoFactor` together with the user's code.
class CooksLoginTwoFactorRequired extends CooksLoginResult {
  /// The server-issued 2FA challenge (300 s TTL per AUTH_CONTRACT.md §1.8).
  final String challenge;

  /// Creates the 2FA-required outcome.
  const CooksLoginTwoFactorRequired(this.challenge);
}
