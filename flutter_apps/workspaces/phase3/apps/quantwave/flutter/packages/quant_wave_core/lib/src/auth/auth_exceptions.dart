// ============================================================================
// quant_wave_core - authentication exceptions + login result types
// ============================================================================
//
// Typed failures surfaced by [AuthRepository]. Transport-level OAuth2 errors
// from [OAuthException] are wrapped into [AuthException] so app code only
// handles this vocabulary.

import 'package:quant_wave_core/src/auth/auth_api.dart';

/// Generic authentication failure.
///
/// Carries a human-readable [message] and, when the failure maps to a known
/// wire error (e.g. `invalid_grant`, `UNTRUSTED_ORIGIN`), its [code].
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

/// `GET /oauth/authorize` answered `200` with the HTML consent screen instead
/// of a `302` redirect (no consent on file for this client).
///
/// Open [request].url in a browser and finish the flow with
/// `AuthRepository.completeBrowserUpgrade`. The request carries the PKCE
/// `codeVerifier` and the `state` to verify on the callback.
class ConsentRequiredException implements Exception {
  /// The in-flight authorization request (verifier + state).
  final AuthorizeRequest request;

  /// Creates the consent-required signal.
  const ConsentRequiredException(this.request);

  @override
  String toString() => 'ConsentRequiredException()';
}

/// Outcome of `AuthRepository.signInWithPassword`.
sealed class LoginResult {
  /// Base outcome of a password sign-in attempt.
  const LoginResult();
}

/// Password sign-in succeeded; the short-lived access token is stored.
class LoginSucceeded extends LoginResult {
  /// Creates the success outcome.
  const LoginSucceeded();
}

/// The account requires a TOTP second factor; pass [challenge] to
/// `AuthRepository.verifyTwoFactor` together with the user's code.
class LoginTwoFactorRequired extends LoginResult {
  /// The server-issued 2FA challenge (300 s TTL per AUTH_CONTRACT.md §1.8).
  final String challenge;

  /// Creates the 2FA-required outcome.
  const LoginTwoFactorRequired(this.challenge);
}
