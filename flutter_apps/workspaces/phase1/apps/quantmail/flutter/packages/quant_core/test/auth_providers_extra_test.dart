// ============================================================================
// quant_core - unit tests: auth providers, uncovered branches
// ============================================================================
//
// Companion to `auth_providers_test.dart` (which owns the main login / 2FA /
// consent / logout flows). This file covers the remaining branches:
//   - `login` upgrade-error mapping: plain [AuthException], [AuthSignedOutException],
//     and unexpected errors
//   - `completeOAuthCallback` failure path
//   - the [pendingOAuthRedirectProvider] listener (consume-once semantics)
//   - `logout` when the repository sign-out throws (still ends on AuthInitial)
//   - `build` hydration with a stored session → [AuthAuthenticated]
//   - [isSessionAuthenticatedProvider] while hydration is still loading
//   - [authRepositoryProvider] wiring (config values, shared [AuthApi])
//
// Tests drive [AuthSessionNotifier] through [ScriptedAuthRepository]
// (`test/helpers/scripted_auth_repository.dart`) backed by
// [InMemoryTokenStorage]: no network, no platform secure store.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'helpers/scripted_auth_repository.dart';

void main() {
  late TokenManager tokens;
  late ScriptedAuthRepository fake;
  late ProviderContainer container;
  late AuthSessionNotifier notifier;

  setUp(() async {
    tokens = TokenManager(storage: InMemoryTokenStorage());
    fake = ScriptedAuthRepository(tokens);
    container = ProviderContainer(
      overrides: [
        appConfigProvider.overrideWithValue(
          const AppConfig(
            apiBaseUrl: 'https://api.test.local',
            oauthClientId: 'test-client',
            webOrigin: 'https://web.test.local',
          ),
        ),
        tokenManagerProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWithValue(fake),
      ],
    );
    addTearDown(container.dispose);
    addTearDown(tokens.dispose);

    // Wait out the notifier's initial build (hydrate) so later state
    // transitions are not overwritten by the in-flight build.
    await container.read(authSessionProvider.future);
    notifier = container.read(authSessionProvider.notifier);
  });

  group('login upgrade error mapping', () {
    test('an upgrade AuthException becomes AuthFailure with its message',
        () async {
      fake.upgradeError =
          const AuthException('backend exploded', code: 'boom');

      await notifier.login(email: 'user@quant.test', password: 'secret');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect((state as AuthFailure).message, 'backend exploded');
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
    });

    test(
        'an upgrade AuthSignedOutException becomes the revoked-session message',
        () async {
      fake.upgradeError = const AuthSignedOutException();

      await notifier.login(email: 'user@quant.test', password: 'secret');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect(
        (state as AuthFailure).message,
        'Your session was revoked. Please sign in again.',
      );
    });

    test('an unexpected upgrade error becomes the generic AuthFailure message',
        () async {
      fake.upgradeError = StateError('kaboom');

      await notifier.login(email: 'user@quant.test', password: 'secret');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect(
        (state as AuthFailure).message,
        startsWith('Unexpected error:'),
      );
    });
  });

  group('oauth callback', () {
    test('a repository failure becomes AuthFailure', () async {
      fake.callbackError = const AuthException('bad callback', code: 'bad');

      await notifier.completeOAuthCallback(
        Uri.parse('quantmail://oauth/callback?code=c&state=s'),
      );

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect((state as AuthFailure).message, 'bad callback');
    });

    test('the pendingOAuthRedirectProvider listener consumes the URI once',
        () async {
      final uri = Uri.parse('quantmail://oauth/callback?code=abc&state=xyz');

      // Riverpod 2.x notifier providers expose no `.stream`; bridge the
      // transition with container.listen + a completer (same semantics as
      // the old `stream.firstWhere`).
      final authenticated = Completer<void>();
      container.listen<AsyncValue<AuthSessionState>>(
        authSessionProvider,
        (previous, next) {
          if (next.valueOrNull is AuthAuthenticated &&
              !authenticated.isCompleted) {
            authenticated.complete();
          }
        },
      );

      container.read(pendingOAuthRedirectProvider.notifier).state = uri;

      await authenticated.future;

      // Reset first so a rebuild cannot re-trigger the upgrade.
      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(fake.callbackUris, <Uri>[uri]);
      expect(container.read(isSessionAuthenticatedProvider), isTrue);
    });
  });

  group('logout', () {
    test('still ends on AuthInitial when the repository signOut throws',
        () async {
      await notifier.login(email: 'user@quant.test', password: 'secret');
      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthAuthenticated>(),
      );

      fake.signOutError = Exception('revoke failed');
      await notifier.logout();

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthInitial>(),
      );
      expect(fake.signedOut, isTrue);
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
    });
  });

  group('session hydration', () {
    test('a stored session hydrates to AuthAuthenticated on build', () async {
      final stored = TokenManager(storage: InMemoryTokenStorage());
      addTearDown(stored.dispose);
      await stored.setTokens('stored-access', 'stored-refresh');

      final hydrated = ProviderContainer(
        overrides: [
          tokenManagerProvider.overrideWithValue(stored),
          authRepositoryProvider.overrideWithValue(
            ScriptedAuthRepository(stored),
          ),
        ],
      );
      addTearDown(hydrated.dispose);

      final state = await hydrated.read(authSessionProvider.future);

      expect(state, isA<AuthAuthenticated>());
      expect(hydrated.read(isSessionAuthenticatedProvider), isTrue);
    });

    test('isSessionAuthenticatedProvider is false while hydration is loading',
        () async {
      final fresh = ProviderContainer();
      addTearDown(fresh.dispose);

      // Read before the async build completes: still loading → false.
      expect(fresh.read(isSessionAuthenticatedProvider), isFalse);

      // Let the (platform-less) hydration settle; the flag stays false.
      await fresh
          .read(authSessionProvider.future)
          .then((_) {}, onError: (_) {});
      expect(fresh.read(isSessionAuthenticatedProvider), isFalse);
    });
  });

  group('authRepositoryProvider wiring', () {
    test('is built from appConfigProvider values and shares the authApi', () {
      final wiredTokens = TokenManager(storage: InMemoryTokenStorage());
      final wired = ProviderContainer(
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(
              apiBaseUrl: 'https://wired.test.local',
              oauthClientId: 'wired-client',
              webOrigin: 'https://wired.test.local',
            ),
          ),
          tokenManagerProvider.overrideWithValue(wiredTokens),
        ],
      );
      addTearDown(wired.dispose);
      addTearDown(wiredTokens.dispose);

      final repo = wired.read(authRepositoryProvider);

      expect(repo.apiBaseUrl, 'https://wired.test.local');
      expect(repo.oauthClientId, 'wired-client');
      expect(repo.webOrigin, 'https://wired.test.local');
      expect(repo.redirectUri, AuthRepository.defaultRedirectUri);
      expect(identical(repo.tokenManager, wiredTokens), isTrue);
      expect(identical(repo.authApi, wired.read(authApiProvider)), isTrue);
    });
  });
}
