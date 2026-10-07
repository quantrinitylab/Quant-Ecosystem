// Smoke tests for [AppConfig]: https-only guard (S4) + documented defaults.
//
// These run without any backend: the config is `--dart-define` backed with
// compile-time fallbacks, so plain `flutter test` exercises the defaults.

import 'package:chat_core/chat_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AppConfig defaults', () {
    test('defaults use https base URLs', () {
      final config = AppConfig();
      expect(config.ssoBaseUrl.startsWith('https://'), isTrue);
      expect(config.apiBaseUrl.startsWith('https://'), isTrue);
      expect(config.webOrigin.startsWith('https://'), isTrue);
    });

    test('default timeout and leeway are positive', () {
      final config = AppConfig();
      expect(config.requestTimeout.inSeconds, 30);
      expect(config.refreshLeeway.inSeconds, 120);
    });

    test('placeholder SSO host reports hasSso == false and isConfigured == false', () {
      final config = AppConfig();
      expect(config.hasSso, isFalse);
      expect(config.isConfigured, isFalse);
    });

    test('custom https config passes the assert guard', () {
      final config = AppConfig(
        ssoBaseUrl: 'https://sso.quantrinity.in',
        apiBaseUrl: 'https://chatapi.quantrinity.in',
      );
      expect(config.ssoBaseUrl, 'https://sso.quantrinity.in');
      expect(config.apiBaseUrl, 'https://chatapi.quantrinity.in');
      expect(config.hasSso, isTrue);
    });
  });

  group('AppConfig https guard (S4)', () {
    test('http SSO base URL is rejected loudly', () {
      expect(
        () => AppConfig(ssoBaseUrl: 'http://sso.quantrinity.in'),
        throwsA(isA<AssertionError>()),
      );
    });

    test('http API base URL is rejected loudly', () {
      expect(
        () => AppConfig(apiBaseUrl: 'http://chatapi.quantrinity.in'),
        throwsA(isA<AssertionError>()),
      );
    });
  });
}
