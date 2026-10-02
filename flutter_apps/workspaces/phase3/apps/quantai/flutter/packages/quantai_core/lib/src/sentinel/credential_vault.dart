// ============================================================================
// quantai_core - Credential vault (Sentinel)
// ============================================================================
//
// Trust boundary (QuantAI Sentinel, cf. QUANTAI_BLUEPRINT §3.2):
//
//   THE AGENT MAY LEARN THAT A CREDENTIAL EXISTS. IT MAY NEVER LEARN ITS
//   VALUE.
//
// This law is enforced by the API surface itself: [CredentialVault] exposes
// no value-returning read method. The complete public surface is
// `storeCredential`, `hasCredential`, `deleteCredential`, `listCredentialIds`
// (ids only) plus the opaque OTP handle API. Existence is knowable; values
// are not.
//
// Storage: foundation [TokenStorage] (default [SecureTokenStorage] —
// keychain / encryptedSharedPreferences; tests inject
// [InMemoryTokenStorage]). Keys are namespaced under `sentinel.*` so vault
// entries can never collide with auth tokens (foundation [TokenKeys]).

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Storage key layout for the vault.
///
/// All vault keys live under `sentinel.` — disjoint from the foundation
/// [TokenKeys] (`token` / `refreshToken`), so credential storage can never
/// overwrite or shadow an auth token.
class SentinelKeys {
  /// Prefix for stored credentials: `sentinel.cred.<id>`.
  static const String credPrefix = 'sentinel.cred.';

  /// JSON index of known credential ids (ids only, no values).
  static const String credIndex = 'sentinel.cred.index';

  /// Prefix for OTP secrets bound to handles: `sentinel.otp.<handleId>`.
  static const String otpPrefix = 'sentinel.otp.';
}

/// Credential ids are storage-key fragments: keep them tight so a hostile
/// id can never escape the `sentinel.cred.` namespace.
final RegExp _credentialIdPattern = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');

void _checkCredentialId(String id) {
  if (!_credentialIdPattern.hasMatch(id)) {
    throw ArgumentError.value(
      id,
      'id',
      'Credential id must match ${_credentialIdPattern.pattern}.',
    );
  }
}

/// Opaque single-use OTP reference.
///
/// Carries NO secret: only a random handle id and its expiry. The runtime
/// binds the handle to the underlying secret in [CredentialVault]'s private
/// record map; the agent (or any caller) can only ever hold the handle.
class OtpHandle {
  /// Random opaque identifier; also the storage-key suffix.
  final String id;

  /// UTC expiry of the underlying secret.
  final DateTime expiresAt;

  const OtpHandle._(this.id, this.expiresAt);

  /// Whether the handle's TTL has elapsed (checked against UTC now).
  bool get isExpired => DateTime.now().toUtc().isAfter(expiresAt);

  @override
  String toString() => 'OtpHandle(<opaque>)';
}

/// Base class for OTP lifecycle errors.
class OtpException implements Exception {
  /// Human-readable, UI-safe reason.
  final String message;

  const OtpException(this.message);

  @override
  String toString() => 'OtpException: $message';
}

/// Thrown when [CredentialVault.consumeOtp] is called on an already-used
/// handle. Exactly-once: a consumed handle never verifies again.
class OtpAlreadyConsumed extends OtpException {
  const OtpAlreadyConsumed() : super('This one-time code was already used.');
}

/// Thrown when the handle's TTL elapsed, its secret is gone, or the handle
/// is unknown to this runtime (e.g. issued before a process restart).
/// Unknown handles fail closed as expired.
class OtpExpired extends OtpException {
  const OtpExpired() : super('This one-time code has expired.');
}

/// Thrown when the supplied code does not match. The handle is NOT consumed
/// by a mismatch — the user may retry until the TTL elapses.
class OtpMismatch extends OtpException {
  const OtpMismatch() : super('The code did not match. Please try again.');
}

/// Private runtime binding of an issued OTP handle to its secret metadata.
///
/// The secret itself lives in secure storage under
/// `sentinel.otp.<handleId>`; this record tracks expiry and consumption.
/// Kept in memory only: after a process restart every old handle is unknown
/// and therefore fails closed as [OtpExpired].
class _OtpRecord {
  final DateTime expiresAt;
  bool consumed = false;

  _OtpRecord(this.expiresAt);
}

/// Existence-only credential store + opaque single-use OTP handles.
///
/// Wraps foundation [TokenStorage] (secure by default). The agent-facing
/// contract:
/// - `hasCredential(id)` → bool (existence only),
/// - `listCredentialIds()` → ids only, never values,
/// - `storeCredential` / `deleteCredential` → write paths,
/// - OTP: `issueOtpHandle` / `consumeOtp` with exactly-once semantics.
///
/// There is deliberately NO method that returns a stored value.
class CredentialVault {
  final TokenStorage _storage;

  /// Private runtime bindings for issued OTP handles (never exposed).
  final Map<String, _OtpRecord> _otpRecords = {};

  /// Ids whose OTP was already consumed (exactly-once enforcement).
  final Set<String> _consumedOtpIds = {};

  final Random _random = Random.secure();

  /// Creates the vault. Production default is [SecureTokenStorage]
  /// (platform keychain / encrypted prefs); tests pass
  /// `InMemoryTokenStorage()`.
  CredentialVault({TokenStorage? storage})
      : _storage = storage ?? SecureTokenStorage();

  // -- Credentials (existence-only) -----------------------------------------

  String _credKey(String id) => '${SentinelKeys.credPrefix}$id';

  String _otpKey(String handleId) => '${SentinelKeys.otpPrefix}$handleId';

  /// Stores [value] under [id]. Overwrites any existing entry.
  Future<void> storeCredential(String id, String value) async {
    _checkCredentialId(id);
    if (value.isEmpty) {
      throw ArgumentError.value(value, 'value', 'Credential must be non-empty.');
    }
    await _storage.write(_credKey(id), value);
    final ids = await listCredentialIds();
    if (!ids.contains(id)) {
      await _writeIndex([...ids, id]);
    }
  }

  /// Existence check only — returns whether a credential is stored under
  /// [id]. The value is read internally to answer this and is never
  /// returned to the caller.
  Future<bool> hasCredential(String id) async {
    _checkCredentialId(id);
    return (await _storage.read(_credKey(id))) != null;
  }

  /// Deletes the credential stored under [id]. No-op when absent.
  Future<void> deleteCredential(String id) async {
    _checkCredentialId(id);
    await _storage.delete(_credKey(id));
    final ids = await listCredentialIds();
    if (ids.remove(id)) {
      await _writeIndex(ids);
    }
  }

  /// Lists known credential ids (sorted). Ids only — never values.
  Future<List<String>> listCredentialIds() async {
    final raw = await _storage.read(SentinelKeys.credIndex);
    if (raw == null || raw.isEmpty) return <String>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.whereType<String>().toList()..sort();
      }
    } catch (_) {
      // Corrupt index fails closed: treat as empty rather than guessing.
    }
    return <String>[];
  }

  Future<void> _writeIndex(List<String> ids) =>
      _storage.write(SentinelKeys.credIndex, jsonEncode(ids));

  // -- OTP: single-use opaque references ------------------------------------

  /// Issues an opaque single-use OTP handle valid for [ttl].
  ///
  /// The runtime generates the underlying secret, stores it under
  /// `sentinel.otp.<handleId>`, and binds the handle to it in the private
  /// record map. The returned [OtpHandle] carries no secret material.
  Future<OtpHandle> issueOtpHandle(Duration ttl) async {
    if (ttl <= Duration.zero) {
      throw ArgumentError.value(ttl, 'ttl', 'OTP TTL must be positive.');
    }
    final id = _randomHex(16);
    final expiresAt = DateTime.now().toUtc().add(ttl);
    final code = _randomDigits(6);
    await _storage.write(_otpKey(id), code);
    _otpRecords[id] = _OtpRecord(expiresAt);
    return OtpHandle._(id, expiresAt);
  }

  /// Consumes [handle] exactly once against the user-supplied [code].
  ///
  /// Success deletes the secret and marks the handle consumed. Failures:
  /// - [OtpAlreadyConsumed] — the handle was already used (no re-verify),
  /// - [OtpExpired] — TTL elapsed, secret gone, or handle unknown to this
  ///   runtime (fails closed),
  /// - [OtpMismatch] — wrong code; the handle stays valid for retry.
  Future<void> consumeOtp(OtpHandle handle, {required String code}) async {
    final id = handle.id;
    if (_consumedOtpIds.contains(id)) {
      throw const OtpAlreadyConsumed();
    }
    final record = _otpRecords[id];
    if (record == null) {
      // Unknown handle (e.g. issued before a restart): fail closed.
      throw const OtpExpired();
    }
    if (record.consumed || DateTime.now().toUtc().isAfter(record.expiresAt)) {
      _otpRecords.remove(id);
      await _storage.delete(_otpKey(id));
      if (record.consumed) {
        _consumedOtpIds.add(id);
        throw const OtpAlreadyConsumed();
      }
      throw const OtpExpired();
    }
    final expected = await _storage.read(_otpKey(id));
    if (expected == null) {
      _otpRecords.remove(id);
      throw const OtpExpired();
    }
    if (!_constantTimeEquals(expected, code)) {
      // Wrong code: handle NOT consumed; the user may retry within the TTL.
      throw const OtpMismatch();
    }
    // Exactly-once: mark consumed BEFORE deleting the secret so a crash
    // between the two cannot resurrect the handle.
    record.consumed = true;
    _consumedOtpIds.add(id);
    _otpRecords.remove(id);
    await _storage.delete(_otpKey(id));
  }

  String _randomHex(int bytes) {
    final data = List<int>.generate(bytes, (_) => _random.nextInt(256));
    return data.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  String _randomDigits(int length) {
    final min = BigInt.from(10).pow(length - 1).toInt();
    final span = BigInt.from(10).pow(length).toInt() - min;
    return (min + _random.nextInt(span)).toString();
  }

  /// Length-then-content comparison without early exit on content mismatch,
  /// so a wrong code reveals nothing about the expected one via timing.
  bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }
}

/// Shared vault: secure storage in production, override in tests with
/// `credentialVaultProvider.overrideWithValue(
///   CredentialVault(storage: InMemoryTokenStorage()))`.
final credentialVaultProvider = Provider<CredentialVault>(
  (ref) => CredentialVault(),
  name: 'credentialVaultProvider',
);
