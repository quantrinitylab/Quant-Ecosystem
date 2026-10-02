// ============================================================================
// quant_core - unit tests for auth providers + session state (Phase 1 M2)
// ============================================================================
//
// Tests drive [AuthSessionNotifier] through a [FakeAuthRepository] (a scripted
// subclass of W1's [AuthRepository] interface) backed by [InMemoryTokenStorage],
// so no network or platform secure store is involved.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Scripted [AuthRepository] double for the session-notifier tests.
///
/// Mirrors W1's exact interface; each flow step is scriptable via the public
/// fields. A successful [upgradeToOAuthTokens] stores fake tokens on the
/// shared [TokenManager], like the real repository would.
class FakeAuthRepository extends AuthRepository {
  /// The shared token manager (also injected via `tokenManagerProvider`).
  final TokenManager tokens;

  /// Result returned by [signInWithPassword]; defaults to success.
  LoginResult nextLoginResult = const LoginSucceeded();

  /// If set, [signInWithPassword] throws this instead of returning a result.
  Object? loginError;

  /// If set, [upgradeToOAuthTokens] throws this instead of succeeding.
  Object? upgradeError;

  /// Records whether [signOut] was called.
  bool signedOut = false;

  /// The code [verifyTwoFactor] accepts; anything else throws.
  String acceptedTotpCode = '123456';

  FakeAuthRepository(this.tokens)
      : super(
          authApi: AuthApi(baseUrl: 'https://auth.test.local'),
          tokenManager: tokens,
          apiBaseUrl: 'https://api.test.local',
          webOrigin: 'https://web.test.local',
          oauthClientId: 'test-client',
        );

  @override
  Future<LoginResult> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final error = loginError;
    if (error != null) throw error;
    return nextLoginResult;
  }

  @override
  Future<void> verifyTwoFactor({
    required String challenge,
    required String code,
  }) async {
    if (code != acceptedTotpCode) {
      throw const AuthException('Invalid code', code: 'invalid_totp');
    }
  }

  @override
  Future<void> upgradeToOAuthTokens() async {
    final error = upgradeError;
    if (error != null) throw error;
    await tokens.setTokens('fake-access-token', 'fake-refresh-token');
  }

  @override
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    await tokens.setTokens('fake-access-token', 'fake-refresh-token');
  }

  @override
  AuthorizeRequest? get pendingAuthorizeRequest => null;

  @override
  Future<void> refreshSession() async {}

  @override
  Future<void> signOut() async {
    signedOut = true;
    await tokens.clearTokens();
  }
}

void main() {
  late TokenManager tokens;
  late FakeAuthRepository fake;
  late ProviderContainer container;
  late AuthSessionNotifier notifier;

  setUp(() async {
    tokens = TokenManager(storage: InMemoryTokenStorage());
    fake = FakeAuthRepository(tokens);
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

  group('initial session state', () {
    test('starts at AuthInitial with no stored tokens', () {
      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthInitial>(),
      );
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
      expect(container.read(pendingOAuthRedirectProvider), isNull);
    });
  });

  group('login', () {
    test('success path → AuthAuthenticated', () async {
      await notifier.login(email: 'user@quant.test', password: 'secret');

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthAuthenticated>(),
      );
      expect(container.read(isSessionAuthenticatedProvider), isTrue);
    });

    test('failure path → AuthFailure with the repository message', () async {
      fake.loginError = const AuthException(
        'Invalid email or password',
        code: 'invalid_credentials',
      );

      await notifier.login(email: 'user@quant.test', password: 'wrong');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect(
        (state as AuthFailure).message,
        'Invalid email or password',
      );
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
    });

    test('2FA path: challenge → submitTotp → AuthAuthenticated', () async {
      fake.nextLoginResult = const LoginTwoFactorRequired('challenge-123');

      await notifier.login(email: 'user@quant.test', password: 'secret');

      var state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthTwoFactorRequired>());
      expect((state as AuthTwoFactorRequired).challenge, 'challenge-123');
      expect(container.read(isSessionAuthenticatedProvider), isFalse);

      await notifier.submitTotp('123456');

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthAuthenticated>(),
      );
      expect(container.read(isSessionAuthenticatedProvider), isTrue);
    });

    test('wrong TOTP code → AuthFailure', () async {
      fake.nextLoginResult = const LoginTwoFactorRequired('challenge-123');

      await notifier.login(email: 'user@quant.test', password: 'secret');
      await notifier.submitTotp('000000');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthFailure>());
      expect((state as AuthFailure).message, 'Invalid code');
    });

    test('submitTotp without a pending challenge → AuthFailure', () async {
      await notifier.submitTotp('123456');

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthFailure>(),
      );
    });

    test('consent required during upgrade → AuthConsentRequired', () async {
      final authorizeUrl = Uri.parse(
        'https://api.test.local/oauth/authorize?client_id=test-client',
      );
      fake.upgradeError = ConsentRequiredException(
        AuthorizeRequest(
          url: authorizeUrl,
          codeVerifier: 'verifier',
          state: 'state',
        ),
      );

      await notifier.login(email: 'user@quant.test', password: 'secret');

      final state = container.read(authSessionProvider).valueOrNull;
      expect(state, isA<AuthConsentRequired>());
      expect((state as AuthConsentRequired).authorizeUrl, authorizeUrl);
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
    });
  });

  group('oauth callback', () {
    test('completeOAuthCallback → AuthAuthenticated', () async {
      await notifier.completeOAuthCallback(
        Uri.parse('quantmail://oauth/callback?code=abc&state=xyz'),
      );

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthAuthenticated>(),
      );
    });
  });

  group('logout', () {
    test('logout path → AuthInitial and repository signed out', () async {
      await notifier.login(email: 'user@quant.test', password: 'secret');
      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthAuthenticated>(),
      );

      await notifier.logout();

      expect(
        container.read(authSessionProvider).valueOrNull,
        isA<AuthInitial>(),
      );
      expect(fake.signedOut, isTrue);
      expect(container.read(isSessionAuthenticatedProvider), isFalse);
    });
  });
}
