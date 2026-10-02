// ============================================================================
// quant_core - unit tests: AppLogger format + AppBootstrap cold-start guard
// ============================================================================
//
// [AppLogger] writes through the top-level [debugPrint], which the tests
// capture by temporarily replacing it. The [AppBootstrap] tests pin the
// two-phase cold-start contract: pre-runApp work is logging-only, and the
// post-first-frame warm-up logs secure-storage failures instead of throwing
// — cold start must not crash because the keystore is unavailable.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('AppLogger', () {
    late List<String?> messages;
    late DebugPrintCallback originalDebugPrint;

    setUp(() {
      messages = <String?>[];
      originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        messages.add(message);
      };
    });

    tearDown(() {
      debugPrint = originalDebugPrint;
    });

    test('info prefixes messages with the quantmail INFO tag', () {
      AppLogger.info('hello');

      expect(messages, <String?>['[quantmail] INFO: hello']);
    });

    test('warning prefixes messages with the quantmail WARN tag', () {
      AppLogger.warning('careful');

      expect(messages, <String?>['[quantmail] WARN: careful']);
    });

    test('error includes the cause and prints the stack trace', () {
      final stack = StackTrace.fromString('frame1\nframe2');

      AppLogger.error('boom', StateError('bad'), stack);

      expect(messages, hasLength(2));
      expect(messages[0], contains('[quantmail] ERROR: boom'));
      expect(messages[0], contains('Bad state: bad'));
      expect(messages[1], contains('frame1'));
    });

    test('error without a cause omits the separator', () {
      AppLogger.error('plain');

      expect(messages, <String?>['[quantmail] ERROR: plain']);
    });
  });

  group('AppBootstrap two-phase API (PERF-2)', () {
    test('preRunApp completes without throwing (logging setup only)',
        () async {
      await AppBootstrap.preRunApp();
    });

    test('warmUp returns immediately and never throws synchronously', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      // Fire-and-forget by design: returns void, never throws.
      AppBootstrap.warmUp(container);
    });

    test(
        'warmUp completes without throwing when the secure-storage backend '
        'is unavailable', () async {
      // In unit tests flutter_secure_storage has no platform channel, so the
      // 400ms-guarded hydration fails; the contract is that cold start still
      // completes (the failure is only logged, never thrown).
      final container = ProviderContainer();
      addTearDown(container.dispose);
      AppBootstrap.warmUp(container);
      // Let the fire-and-forget warm-up settle; any unhandled async error
      // would fail this test via the test framework.
      await Future<void>.delayed(const Duration(seconds: 1));
    });
  });
}
