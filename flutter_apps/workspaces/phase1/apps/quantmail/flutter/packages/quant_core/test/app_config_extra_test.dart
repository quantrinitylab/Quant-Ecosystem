// ============================================================================
// quant_core - unit tests: AppConfig defaults + toString masking
// ============================================================================
//
// Covers what `core_providers_test.dart` left out: the remaining
// `--dart-define` fallbacks (`oauthClientId`, `webOrigin`) and the
// secret-hygiene contract of [AppConfig.toString] (a provisioned client id
// must never leak into logs).

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';

void main() {
  group('AppConfig defaults', () {
    test('oauthClientId defaults to empty (unprovisioned)', () {
      expect(const AppConfig().oauthClientId, isEmpty);
    });

    test('webOrigin defaults to the production web origin', () {
      expect(
        const AppConfig().webOrigin,
        'https://quantmail.quantrinity.in',
      );
    });
  });

  group('AppConfig.toString', () {
    test('masks an unprovisioned client id as <unprovisioned>', () {
      final text = const AppConfig().toString();

      expect(text, contains('apiBaseUrl: https://api.quantrinity.example'));
      expect(text, contains('<unprovisioned>'));
    });

    test('masks a provisioned client id as <set> without leaking it', () {
      const clientId = 'provisioned-client-id-123';
      final text = const AppConfig(oauthClientId: clientId).toString();

      expect(text, contains('<set>'));
      expect(text, isNot(contains(clientId)));
    });
  });
}
