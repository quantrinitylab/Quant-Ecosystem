// ============================================================================
// quant_wave_core - AppConfig tests (W3, shift 1)
// ============================================================================
//
// Covers: compile-time defaults (incl. the `quantwave://` redirect scheme and
// callback URI), dart-define wiring, constructor overrides, and the
// HTTPS-only transport rule (army review finding S4).

import 'package:flutter_test/flutter_test.dart';

import 'package:quant_wave_core/src/config/app_config.dart';

void main() {
  group('AppConfig defaults', () {
    test('uses the quantwave custom-scheme OAuth defaults', () {
      const AppConfig config = AppConfig();
      expect(config.oauthRedirectScheme, 'quantwave');
      expect(config.oauthRedirectUri, 'quantwave://oauth/callback');
      expect(config.oauthTokenPath, '/oauth/token');
      expect(config.oauthAuthorizePath, '/oauth/authorize');
    });

    test('API base URL defaults to https with sane timeouts', () {
      const AppConfig config = AppConfig();
      expect(config.apiBaseUrl, startsWith('https://'));
      expect(config.requestTimeout, const Duration(seconds: 30));
      expect(config.refreshLeeway, const Duration(seconds: 120));
    });

    test('OAuth client id defaults to empty (unprovisioned)', () {
      const AppConfig config = AppConfig();
      expect(config.oauthClientId, isEmpty);
      expect(config.toString(), contains('<unprovisioned>'));
    });
  });

  group('AppConfig overrides', () {
    test('constructor values beat the dart-define fallbacks', () {
      const AppConfig config = AppConfig(
        apiBaseUrl: 'https://staging.example',
        oauthRedirectScheme: 'quantwave-staging',
        oauthClientId: 'client_123',
      );
      expect(config.apiBaseUrl, 'https://staging.example');
      expect(config.oauthRedirectScheme, 'quantwave-staging');
      expect(config.oauthClientId, 'client_123');
      expect(config.toString(), contains('<set>'));
    });

    test('defaults are wired to the QUANT_* dart-define flags', () {
      const AppConfig config = AppConfig();
      expect(
        config.oauthRedirectScheme,
        const String.fromEnvironment(
          'QUANT_OAUTH_REDIRECT_SCHEME',
          defaultValue: 'quantwave',
        ),
      );
      expect(
        config.oauthRedirectUri,
        const String.fromEnvironment(
          'QUANT_OAUTH_REDIRECT_URI',
          defaultValue: 'quantwave://oauth/callback',
        ),
      );
      expect(
        config.apiBaseUrl,
        const String.fromEnvironment(
          'QUANT_API_BASE_URL',
          defaultValue: 'https://api.quantrinity.example',
        ),
      );
      expect(
        config.requestTimeout,
        Duration(
          seconds: int.fromEnvironment(
            'QUANT_REQUEST_TIMEOUT_SECONDS',
            defaultValue: 30,
          ),
        ),
      );
    });
  });

  group('checkHttpsBaseUrl (S4: OAuth tokens must never travel over HTTP)',
      () {
    test('accepts https URLs', () {
      expect(
        () => checkHttpsBaseUrl('https://api.example.com'),
        returnsNormally,
      );
    });

    test('throws ArgumentError for plaintext http on non-loopback hosts',
        () {
      expect(
        () => checkHttpsBaseUrl('http://api.example.com'),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('allows http loopback for local dev', () {
      expect(
        () => checkHttpsBaseUrl('http://localhost:3000'),
        returnsNormally,
      );
      expect(
        () => checkHttpsBaseUrl('http://127.0.0.1:8080'),
        returnsNormally,
      );
    });

    test('rejects non-http(s) schemes and malformed URLs', () {
      expect(
        () => checkHttpsBaseUrl('ftp://api.example.com'),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => checkHttpsBaseUrl('not-a-url'),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
