// ============================================================================
// quant_core - unit tests for config + provider graph
// ============================================================================
//
// Tests use [InMemoryTokenStorage] (never the platform secure store) so they
// run on any host without platform channels.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  TokenManager makeTestTokenManager() =>
      TokenManager(storage: InMemoryTokenStorage());

  group('AppConfig defaults (--dart-define fallbacks)', () {
    const config = AppConfig();

    test('apiBaseUrl falls back to the placeholder URL', () {
      expect(config.apiBaseUrl, 'https://api.quantrinity.example');
    });

    test('oauth redirect matches the verified contract (AUTH_CONTRACT.md §1.1)',
        () {
      expect(config.oauthRedirectScheme, 'quantmail');
      expect(config.oauthRedirectUri, 'quantmail://oauth/callback');
    });

    test('oauth endpoint paths default to the verified /oauth/* routes', () {
      expect(config.oauthTokenPath, '/oauth/token');
      expect(config.oauthAuthorizePath, '/oauth/authorize');
    });

    test('auth timeouts have sane defaults', () {
      expect(config.requestTimeout, const Duration(seconds: 30));
      expect(config.refreshLeeway, const Duration(seconds: 120));
    });
  });

  group('core providers', () {
    test('apiClientProvider builds with an overridden AppConfig', () {
      final tokenManager = makeTestTokenManager();
      final container = ProviderContainer(
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(apiBaseUrl: 'https://test.quantmail.local'),
          ),
          tokenManagerProvider.overrideWithValue(tokenManager),
        ],
      );
      addTearDown(container.dispose);
      addTearDown(tokenManager.dispose);

      final client = container.read(apiClientProvider);

      expect(client.dio.options.baseUrl, 'https://test.quantmail.local');
      expect(identical(client.tokenManager, tokenManager), isTrue);
    });

    test('authStateProvider emits unknown before hydration', () async {
      final tokenManager = makeTestTokenManager();
      final container = ProviderContainer(
        overrides: [tokenManagerProvider.overrideWithValue(tokenManager)],
      );
      addTearDown(container.dispose);
      addTearDown(tokenManager.dispose);

      final first = await container.read(authStateProvider.future);

      expect(first.status, AuthStatus.unknown);
      expect(first.isAuthenticated, isFalse);
    });

    test('isAuthenticatedProvider flips after setTokens', () async {
      final tokenManager = makeTestTokenManager();
      final container = ProviderContainer(
        overrides: [tokenManagerProvider.overrideWithValue(tokenManager)],
      );
      addTearDown(container.dispose);
      addTearDown(tokenManager.dispose);

      // Before any tokens: stream is loading/unknown → derived flag is false.
      expect(container.read(isAuthenticatedProvider), isFalse);

      await tokenManager.setTokens('access-token', 'refresh-token');

      // Wait for the BehaviorSubject broadcast to propagate through Riverpod.
      // (`.stream` is deprecated; bridge with listen + completer, checking
      // the current value too via fireImmediately.)
      final authenticated = Completer<void>();
      container.listen<AsyncValue<AuthState>>(
        authStateProvider,
        (previous, next) {
          if ((next.valueOrNull?.isAuthenticated ?? false) &&
              !authenticated.isCompleted) {
            authenticated.complete();
          }
        },
        fireImmediately: true,
      );
      await authenticated.future;

      expect(container.read(isAuthenticatedProvider), isTrue);
    });
  });
}
