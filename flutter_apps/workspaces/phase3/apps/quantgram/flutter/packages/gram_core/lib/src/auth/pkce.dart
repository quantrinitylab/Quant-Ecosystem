// ============================================================================
// gram_core - OAuth2 PKCE helpers
// ============================================================================
//
// PKCE primitives (RFC 7636) for the QuantGram SSO flow. Extracted into
// their own file (rather than statics on the auth API) so the login screen
// (W2) and tests can build/verify pairs without a Dio instance.
//
// Intentional shadowing note: gram_core copy-adapts the phase0 foundation
// instead of depending on it, so the app imports ONLY gram_core. The class
// names here mirror `quant_foundation`'s PKCE helpers on purpose.

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// A PKCE code verifier / challenge pair (RFC 7636 §4).
///
/// - [verifier]: 43–128 chars, base64url, no padding. Keep secret — it is
///   presented at the token exchange to prove the authorize requester and
///   the code redeemer are the same party.
/// - [challenge]: `BASE64URL-ENCODE(SHA256(verifier))` (S256), no padding.
///   This is what travels in the `code_challenge` authorize parameter.
class PkcePair {
  /// The secret verifier (43–128 chars).
  final String verifier;

  /// The S256 challenge derived from [verifier].
  final String challenge;

  /// Creates a pair from discrete values (verifier length is validated).
  PkcePair({required this.verifier, required this.challenge}) {
    if (verifier.length < 43 || verifier.length > 128) {
      throw ArgumentError.value(
        verifier.length,
        'verifier.length',
        'PKCE verifier must be 43–128 characters (RFC 7636 §4.1)',
      );
    }
  }

  /// Generates a fresh cryptographically-random pair.
  ///
  /// [length] is the verifier length in characters, clamped to 43–128.
  factory PkcePair.generate([int length = 64]) {
    final verifier = generateCodeVerifier(length);
    return PkcePair(
      verifier: verifier,
      challenge: codeChallengeS256(verifier),
    );
  }

  @override
  String toString() => 'PkcePair(challenge: $challenge)';
}

/// Generates a cryptographically random code verifier (43–128 chars,
/// base64url, no padding). Mirrors `quant_foundation`'s generator.
String generateCodeVerifier([int length = 64]) {
  // clamp() returns num; toInt() keeps List.generate/substring on int.
  final clamped = length.clamp(43, 128).toInt();
  final bytes =
      List<int>.generate(clamped, (_) => _secureRandom.nextInt(256));
  return base64Url.encode(bytes).replaceAll('=', '').substring(0, clamped);
}

/// `BASE64URL-ENCODE(SHA256(verifier))` — the S256 code challenge, no padding.
/// Mirrors `quant_foundation`'s generator.
String codeChallengeS256(String verifier) {
  final digest = sha256.convert(utf8.encode(verifier));
  return base64Url.encode(digest.bytes).replaceAll('=', '');
}

/// Generates a cryptographically random `state` value for the authorize
/// request. The callback's `state` must equal this (CSRF protection).
String generateOAuthState() {
  final bytes = List<int>.generate(16, (_) => _secureRandom.nextInt(256));
  return base64Url.encode(bytes).replaceAll('=', '');
}

final Random _secureRandom = Random.secure();
