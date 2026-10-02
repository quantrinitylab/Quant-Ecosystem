// Retry backoff schedule + PKCE unit tests.
//
// Run: `flutter test` from the package root.

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  group('RetryInterceptor.delayForRetry', () {
    test('mirrors the web outbox RETRY_BACKOFF_MS schedule', () {
      // apps/quantmail/src/lib/offline/outbox.ts:
      //   const RETRY_BACKOFF_MS = [0, 1_000, 4_000, 15_000, 60_000];
      expect(RetryInterceptor.delayForRetry(0), Duration.zero);
      expect(RetryInterceptor.delayForRetry(1), const Duration(seconds: 1));
      expect(RetryInterceptor.delayForRetry(2), const Duration(seconds: 4));
      expect(RetryInterceptor.delayForRetry(3), const Duration(seconds: 15));
      expect(RetryInterceptor.delayForRetry(4), const Duration(seconds: 60));
    });

    test('returns null once the schedule is exhausted', () {
      expect(RetryInterceptor.delayForRetry(5), isNull);
      expect(RetryInterceptor.delayForRetry(99), isNull);
      expect(RetryInterceptor.delayForRetry(-1), isNull);
    });

    test('custom schedules are honored', () {
      const custom = [Duration(milliseconds: 100), Duration(milliseconds: 200)];
      expect(RetryInterceptor.delayForRetry(0, custom),
          const Duration(milliseconds: 100));
      expect(RetryInterceptor.delayForRetry(1, custom),
          const Duration(milliseconds: 200));
      expect(RetryInterceptor.delayForRetry(2, custom), isNull);
    });

    test('the interactive schedule caps the stall at ~1s', () {
      // PERF-1: kInteractiveRetryBackoff = [0, 200ms, 800ms].
      expect(kInteractiveRetryBackoff, hasLength(3));
      expect(
        RetryInterceptor.delayForRetry(0, kInteractiveRetryBackoff),
        Duration.zero,
      );
      expect(
        RetryInterceptor.delayForRetry(1, kInteractiveRetryBackoff),
        const Duration(milliseconds: 200),
      );
      expect(
        RetryInterceptor.delayForRetry(2, kInteractiveRetryBackoff),
        const Duration(milliseconds: 800),
      );
      expect(
        RetryInterceptor.delayForRetry(3, kInteractiveRetryBackoff),
        isNull,
      );
    });
  });

  group('RetryInterceptor schedule selection (PERF-1)', () {
    late RetryInterceptor interceptor;

    setUp(() {
      interceptor = RetryInterceptor(dio: Dio());
    });

    test('the default path is the interactive schedule', () {
      expect(interceptor.backoff, same(kInteractiveRetryBackoff));
      final options = RequestOptions(path: '/emails');
      expect(
        interceptor.scheduleForRequest(options),
        same(kInteractiveRetryBackoff),
      );
    });

    test('kBackgroundRetryExtraKey selects the long schedule', () {
      final options = RequestOptions(
        path: '/sync/changes',
        extra: const {kBackgroundRetryExtraKey: true},
      );
      expect(interceptor.scheduleForRequest(options), same(kRetryBackoff));
    });

    test('a false background flag keeps the interactive schedule', () {
      final options = RequestOptions(
        path: '/emails',
        extra: const {kBackgroundRetryExtraKey: false},
      );
      expect(
        interceptor.scheduleForRequest(options),
        same(kInteractiveRetryBackoff),
      );
    });

    test('explicit backoff overrides the interactive default', () {
      final custom = [const Duration(milliseconds: 50)];
      final customInterceptor =
          RetryInterceptor(dio: Dio(), backoff: custom);
      expect(customInterceptor.backoff, same(custom));
      expect(
        customInterceptor.scheduleForRequest(RequestOptions(path: '/x')),
        same(custom),
      );
    });

    test('the background flag beats an explicit backoff override', () {
      final custom = [const Duration(milliseconds: 50)];
      final customInterceptor =
          RetryInterceptor(dio: Dio(), backoff: custom);
      final options = RequestOptions(
        path: '/sync/changes',
        extra: const {kBackgroundRetryExtraKey: true},
      );
      expect(
        customInterceptor.scheduleForRequest(options),
        same(kRetryBackoff),
      );
    });
  });

  group('AuthApi PKCE', () {
    test('codeChallengeS256 matches the RFC 7636 Appendix B test vector', () {
      // https://www.rfc-editor.org/rfc/rfc7636#appendix-B
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      expect(AuthApi.codeChallengeS256(verifier), expectedChallenge);
    });

    test('generateCodeVerifier length is clamped to 43..128', () {
      expect(AuthApi.generateCodeVerifier(10).length, 43);
      expect(AuthApi.generateCodeVerifier(200).length, 128);
      expect(AuthApi.generateCodeVerifier().length, 64);
    });

    test('generateCodeVerifier emits base64url without padding', () {
      final verifier = AuthApi.generateCodeVerifier();
      expect(RegExp(r'^[A-Za-z0-9\-_]+$').hasMatch(verifier), isTrue);
      expect(verifier.contains('='), isFalse);
    });

    test('generateCodeVerifier is non-deterministic', () {
      expect(AuthApi.generateCodeVerifier(),
          isNot(equals(AuthApi.generateCodeVerifier())));
    });
  });

  group('TokenSet', () {
    test('parses the snake_case OAuth2 token response', () {
      final set = TokenSet.fromJson(const {
        'access_token': 'a',
        'token_type': 'Bearer',
        'expires_in': 3600,
        'refresh_token': 'r',
        'scope': 'openid profile email',
        'id_token': 'id',
      });
      expect(set.accessToken, 'a');
      expect(set.refreshToken, 'r');
      expect(set.expiresInSeconds, 3600);
      expect(set.tokenType, 'Bearer');
      expect(set.scope, ['openid', 'profile', 'email']);
      expect(set.idToken, 'id');
      expect(set.expiresIn, const Duration(seconds: 3600));
    });
  });
}
