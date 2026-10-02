// ============================================================================
// quant_core - unit tests: core provider defaults (no overrides)
// ============================================================================
//
// Companion to `core_providers_test.dart` (which owns the overridden-config
// paths). This file covers the default provider builds: [appConfigProvider]
// resolving the compile-time config, [tokenManagerProvider] constructing a
// [TokenManager] with the default storage (no platform channels are touched
// until hydration), and the auth-state stream starting at `unknown`.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  group('provider defaults (no overrides)', () {
    test('appConfigProvider resolves the compile-time default config', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final config = container.read(appConfigProvider);

      expect(config.apiBaseUrl, 'https://api.quantrinity.example');
      expect(config.oauthClientId, isEmpty);
    });

    test('tokenManagerProvider builds a TokenManager with default storage',
        () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final manager = container.read(tokenManagerProvider);

      expect(manager, isA<TokenManager>());
      expect(manager.currentState.isAuthenticated, isFalse);
      // Container disposal runs ref.onDispose(manager.dispose) — must not
      // throw (covered implicitly by the tearDown).
    });

    test('authStateProvider emits unknown before hydration', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final first = await container.read(authStateProvider.future);

      expect(first.status, AuthStatus.unknown);
      expect(first.isAuthenticated, isFalse);
    });

    test('isAuthenticatedProvider is false before hydration', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(isAuthenticatedProvider), isFalse);
    });
  });
}
