// W3 (Sentinel) — credential vault + OTP handle tests.
//
// The vault's core law (agent may know existence, never values) is enforced
// by the API surface: there is deliberately no value-returning read method.
// These tests verify that law behaviorally — existence checks answer with
// booleans, id listings contain ids only, and no public call path returns a
// stored secret. OTP tests reach the secret through the raw TokenStorage
// fake (the "runtime" path), never through the vault's public API.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'package:quantai_core/src/sentinel/credential_vault.dart';

void main() {
  late InMemoryTokenStorage storage;
  late CredentialVault vault;

  setUp(() {
    storage = InMemoryTokenStorage();
    vault = CredentialVault(storage: storage);
  });

  group('CredentialVault — existence-only contract', () {
    test('store → has → delete round trip', () async {
      expect(await vault.hasCredential('api-key'), isFalse);

      await vault.storeCredential('api-key', 'super-secret-value');
      expect(await vault.hasCredential('api-key'), isTrue);

      await vault.deleteCredential('api-key');
      expect(await vault.hasCredential('api-key'), isFalse);
    });

    test('no public API returns a stored value (negative leak test)', () async {
      const secret = 'value-that-must-never-leak-12345';
      await vault.storeCredential('db-password', secret);

      // Every public read path and its returned content:
      final exists = await vault.hasCredential('db-password');
      final ids = await vault.listCredentialIds();

      expect(exists, isTrue); // bool, not the value
      expect(ids, contains('db-password'));
      for (final id in ids) {
        expect(id, isNot(contains(secret)));
        expect(id, isNot(equals(secret)));
      }
      // The vault's public surface has no read method at all: the only
      // value-bearing calls a test can make go through the raw storage
      // fake (the runtime path), which the agent never touches.
      expect(ids.join(','), isNot(contains(secret)));
    });

    test('delete of an absent id is a no-op', () async {
      await vault.deleteCredential('never-stored');
      expect(await vault.hasCredential('never-stored'), isFalse);
    });

    test('keys are namespaced: sentinel.cred.<id>, never auth token keys',
        () async {
      await vault.storeCredential('my-id', 'v');

      // Namespaced key present in the backing store...
      expect(await storage.read('sentinel.cred.my-id'), 'v');
      // ...and auth token keys untouched.
      expect(await storage.read(TokenKeys.accessToken), isNull);
      expect(await storage.read(TokenKeys.refreshToken), isNull);
      expect(await storage.read('my-id'), isNull);
    });

    test('invalid ids are rejected (namespace escape prevention)', () async {
      for (final bad in ['', '../evil', 'a b', 'x' * 65, '.leading-dot']) {
        expect(
          () => vault.storeCredential(bad, 'v'),
          throwsArgumentError,
          reason: 'id "$bad"',
        );
        expect(() => vault.hasCredential(bad), throwsArgumentError);
        expect(() => vault.deleteCredential(bad), throwsArgumentError);
      }
    });

    test('empty values are rejected', () async {
      expect(() => vault.storeCredential('id', ''), throwsArgumentError);
    });
  });

  group('CredentialVault — OTP single-use opaque handles', () {
    /// Reads the runtime-bound secret through the raw storage fake (the
    /// "runtime" path — the vault's public API can never do this).
    Future<String> runtimeSecret(OtpHandle handle) async =>
        (await storage.read('sentinel.otp.${handle.id}'))!;

    test('handle is opaque: carries no secret', () async {
      final handle = await vault.issueOtpHandle(const Duration(minutes: 5));
      final secret = await runtimeSecret(handle);

      expect(handle.id, isNotEmpty);
      expect(handle.id, isNot(contains(secret)));
      expect(handle.toString(), isNot(contains(secret)));
      expect(handle.toString(), isNot(contains(handle.id)));
      expect(handle.expiresAt.isUtc, isTrue);
      expect(handle.isExpired, isFalse);
    });

    test('consume with correct code succeeds exactly once', () async {
      final handle = await vault.issueOtpHandle(const Duration(minutes: 5));
      final code = await runtimeSecret(handle);

      await vault.consumeOtp(handle, code: code);
      // Secret is wiped after consumption.
      expect(await storage.read('sentinel.otp.${handle.id}'), isNull);

      // Second consume → OtpAlreadyConsumed (never re-verifies).
      await expectLater(
        vault.consumeOtp(handle, code: code),
        throwsA(isA<OtpAlreadyConsumed>()),
      );
    });

    test('wrong code throws OtpMismatch and does NOT consume the handle',
        () async {
      final handle = await vault.issueOtpHandle(const Duration(minutes: 5));
      final code = await runtimeSecret(handle);

      await expectLater(
        vault.consumeOtp(handle, code: '000000'),
        throwsA(isA<OtpMismatch>()),
      );

      // Handle still valid: correct code consumes afterwards.
      await vault.consumeOtp(handle, code: code);
    });

    test('expired handle throws OtpExpired', () async {
      final handle =
          await vault.issueOtpHandle(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 120));

      expect(handle.isExpired, isTrue);
      await expectLater(
        vault.consumeOtp(handle, code: '123456'),
        throwsA(isA<OtpExpired>()),
      );
    });

    test('handle unknown to this runtime fails closed as OtpExpired', () async {
      // Simulate a process restart: a fresh vault over the same storage.
      final handle = await vault.issueOtpHandle(const Duration(minutes: 5));
      final restarted = CredentialVault(storage: storage);

      await expectLater(
        restarted.consumeOtp(handle, code: await runtimeSecret(handle)),
        throwsA(isA<OtpExpired>()),
      );
    });

    test('OTP secrets use their own namespace', () async {
      final handle = await vault.issueOtpHandle(const Duration(minutes: 5));
      expect(await storage.read('sentinel.otp.${handle.id}'), isNotNull);
      // OTP entries are not listed as credentials (ids-only list stays clean).
      expect(await vault.listCredentialIds(), isEmpty);
    });

    test('non-positive TTL is rejected', () async {
      expect(
        () => vault.issueOtpHandle(Duration.zero),
        throwsArgumentError,
      );
    });
  });

  group('credentialVaultProvider', () {
    test('default provider builds a vault (secure storage backend)', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(credentialVaultProvider), isA<CredentialVault>());
    });
  });
}
