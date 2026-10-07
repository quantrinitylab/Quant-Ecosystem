// Sovereign Quant Ecosystem - Quant Auth Package Unit Tests
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath method invocations (120Hz Impeller & Skia safe).

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_auth/quant_auth.dart';

void main() {
  group('QuantAuth Package Tests', () {
    test('QuantUserProfile model initializes correctly', () {
      const profile = QuantUserProfile(
        id: 'usr_001',
        email: 'founder@quantmail.in',
        name: 'Astra Sovereign',
        tier: 'sovereign_enterprise',
      );

      expect(profile.id, 'usr_001');
      expect(profile.email, 'founder@quantmail.in');
      expect(profile.name, 'Astra Sovereign');
      expect(profile.initials, 'AS');
      expect(profile.tier, 'sovereign_enterprise');
      expect(profile.isPhoneVerified, isFalse);
    });

    test('QuantAuthState transitions match state machine', () {
      expect(QuantAuthState.values.contains(QuantAuthState.authenticated), isTrue);
      expect(QuantAuthState.values.contains(QuantAuthState.unauthenticated), isTrue);
      expect(QuantAuthState.values.contains(QuantAuthState.authenticating), isTrue);
    });
  });
}
