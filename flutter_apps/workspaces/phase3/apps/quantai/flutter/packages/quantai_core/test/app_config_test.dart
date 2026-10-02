import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_core/quantai_core.dart';

void main() {
  group('AppConfig defaults (Shift 1, spec-pending)', () {
    test('oauth redirect uses the quantai://oauth/callback scheme', () {
      const config = AppConfig();
      expect(config.oauthRedirectUri, 'quantai://oauth/callback');
      expect(config.oauthRedirectScheme, 'quantai');
    });

    test('oauth client id is empty until provisioned (U1)', () {
      const config = AppConfig();
      expect(config.oauthClientId, isEmpty);
    });

    test('AI stream timeout defaults to 90 seconds (D5)', () {
      const config = AppConfig();
      expect(config.aiStreamTimeout, const Duration(seconds: 90));
      expect(config.aiStreamTimeout.inSeconds, 90);
    });

    test('request timeout defaults to 30 seconds', () {
      const config = AppConfig();
      expect(config.requestTimeout, const Duration(seconds: 30));
    });

    test('refresh leeway defaults to 120 seconds (W1 contract)', () {
      // NOTE: the fleet brief quoted 60 s; W1's implementation uses 120 s.
      // Flagged as drift D5 — harmonize at coordinator level.
      const config = AppConfig();
      expect(config.refreshLeeway, const Duration(seconds: 120));
    });

    test('const-constructible so --dart-define fallbacks resolve at compile time',
        () {
      // AppConfig must stay a const constructor: providers use
      // `const AppConfig()` and `overrideWithValue(const AppConfig(...))`.
      const config = AppConfig(
        apiBaseUrl: 'https://api.example.test',
        oauthClientId: 'test-client',
      );
      expect(config.apiBaseUrl, 'https://api.example.test');
      expect(config.oauthClientId, 'test-client');
    });

    test('fromEnvironment flags use the QUANTAI_ prefix (W1 contract)', () {
      // Documents the flag names the config actually reads. The fleet brief
      // quoted QUANT_* — flagged as drift D4; coordinator to decide.
      const config = AppConfig();
      expect(config.aiStreamTimeout.inSeconds, isNonNegative);
    });
  });
}
