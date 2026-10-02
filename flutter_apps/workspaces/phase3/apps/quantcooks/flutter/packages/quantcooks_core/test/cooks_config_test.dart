// ============================================================================
// quantcooks_core - CooksConfig defaults test
// ============================================================================
//
// Verifies the compile-time configuration defaults in
// `src/config/cooks_config.dart`:
//  - the OAuth client id is the UNREGISTERED placeholder until a real
//    client_id is supplied (e.g. via --dart-define=QUANT_COOKS_OAUTH_CLIENT_ID)
//  - the default redirect URI matches the registered custom scheme
//  - the refresh leeway default is 120 s

import 'package:flutter_test/flutter_test.dart';
import 'package:quantcooks_core/quantcooks_core.dart';

void main() {
  group('CooksConfig defaults', () {
    test('default client id is the unregistered placeholder', () {
      const CooksConfig config = CooksConfig();
      expect(config.oauthClientId, CooksConfig.unregisteredClientId);
    });

    test('isClientProvisioned is false until a real client id is supplied',
        () {
      const CooksConfig config = CooksConfig();
      expect(config.isClientProvisioned, isFalse);
    });

    test('isClientProvisioned is true when oauthClientId is replaced', () {
      // Simulates --dart-define=QUANT_COOKS_OAUTH_CLIENT_ID=client_...
      const CooksConfig config =
          CooksConfig(oauthClientId: 'client_abc123');
      expect(config.oauthClientId, isNot(CooksConfig.unregisteredClientId));
      expect(config.isClientProvisioned, isTrue);
    });

    test('defaultRedirectUri matches the registered custom-scheme URI', () {
      expect(
        CooksConfig.defaultRedirectUri,
        'quantcooks://oauth/callback',
      );
      const CooksConfig config = CooksConfig();
      expect(config.oauthRedirectUri, CooksConfig.defaultRedirectUri);
    });

    test('refreshLeeway defaults to 120 seconds', () {
      const CooksConfig config = CooksConfig();
      expect(config.refreshLeeway, const Duration(seconds: 120));
    });
  });
}
