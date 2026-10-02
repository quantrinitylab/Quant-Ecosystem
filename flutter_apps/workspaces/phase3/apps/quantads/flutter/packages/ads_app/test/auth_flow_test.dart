// Copyright (c) 2026 Quatrinity Labs. All rights reserved.
// QuantAds omnipresent — auth session notifier flow tests.
//
// Drives the REAL [AuthSessionNotifier] against a scriptable fake
// [AuthRepository] and an in-memory token store (no network, no secure
// storage, no platform channels):
//   - password login: success → OAuth upgrade → [AuthAuthenticated]
//   - password login with 2FA → [AuthTwoFactorRequired] → submit TOTP →
//     [AuthAuthenticated]
//   - TOTP submit with no pending challenge → [AuthFailure]
//   - consent required → [AuthConsentRequired] carrying the authorize URL
//   - login failure → [AuthFailure] with the backend message
//   - logout → [AuthInitial] with tokens cleared
//   - [pendingOAuthRedirectProvider] deep-link handoff consumed by the
//     notifier (provider-level deep-link plumbing)
//   - unprovisioned OAuth client id fails loudly on the REAL repository
//
// TODO(UNVERIFIED): the OAuth2 `client_id` is UNPROVISIONED (U1) and the
// production API base URL is unconfirmed — fixtures use reserved `.example`
// hosts and a throwaway client id. No real credentials anywhere.

import 'package:ads_core/ads_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Scriptable fake of [AuthRepository]: never touches the network.
class FakeAuthRepository extends AuthRepository {
  FakeAuthRepository()
      : this.withManager(TokenManager(storage: InMemoryTokenStorage()));

  FakeAuthRepository.withManager(TokenManager manager)
      : super(
          authApi: AuthApi(baseUrl: 'https://ads-api-test.example'),
          tokenManager: manager,
          apiBaseUrl: 'https://ads-api-test.example',
          webOrigin: 'https://quantads-test.example',
          oauthClientId: 'test-client-id-unprovisioned',
        );

  /// What [signInWithPassword] returns (when [signInError] is null).
  LoginResult signInResult = const LoginSucceeded();

  /// When non-null, [signInWithPassword] throws this instead.
  Object? signInError;

  /// When non-null, [upgradeToOAuthTokens] throws this instead.
  Object? upgradeError;

  /// The challenge [verifyTwoFactor] accepts; anything else throws.
  String acceptedChallenge = 'challenge-1';

  bool upgradeCalled = false;
  bool browserUpgradeCalled = false;
  Uri? browserUpgradeUri;
  bool signedOut = false;
  String? lastEmail;
  String? lastPassword;

  @override
  Future<LoginResult> signInWithPassword({
    required String email,
    required String password,
  }) async {
    lastEmail = email;
    lastPassword = password;
    final Object? error = signInError;
    if (error != null) throw error;
    return signInResult;
  }

  @override
  Future<void> verifyTwoFactor({
    required String challenge,
    required String code,
  }) async {
    if (challenge != acceptedChallenge) {
      throw const AuthException('wrong challenge', code: 'bad_challenge');
    }
    await tokenManager.setTokens('2fa-access', '2fa-refresh');
  }

  @override
  Future<void> upgradeToOAuthTokens() async {
    upgradeCalled = true;
    final Object? error = upgradeError;
    if (error != null) throw error;
    await tokenManager.setTokens('oauth-access', 'oauth-refresh');
  }

  @override
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    browserUpgradeCalled = true;
    browserUpgradeUri = callbackUri;
    await tokenManager.setTokens('oauth-access', 'oauth-refresh');
  }

  @override
  Future<void> signOut() async {
    signedOut = true;
    await tokenManager.clearTokens();
  }
}

/// Builds a container with the fake repository + its token manager wired in.
ProviderContainer containerWith(FakeAuthRepository repo) {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authRepositoryProvider.overrideWithValue(repo),
      tokenManagerProvider.overrideWithValue(repo.tokenManager),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Waits until the session reaches a state matching [matches] (the
/// [pendingOAuthRedirectProvider] listener completes asynchronously and
/// fire-and-forget, so a poll loop is required).
Future<void> waitForSession(
  ProviderContainer container,
  bool Function(AuthSessionState? state) matches,
) async {
  for (int i = 0; i < 100; i++) {
    if (matches(container.read(authSessionProvider).valueOrNull)) return;
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  fail(
    'timed out waiting for session state '
    '(last: ${container.read(authSessionProvider).valueOrNull})',
  );
}

void main() {
  test('starts unauthenticated when no tokens are stored', () async {
    final ProviderContainer container = containerWith(FakeAuthRepository());

    final AuthSessionState state =
        await container.read(authSessionProvider.future);

    expect(state, isA<AuthInitial>());
  });

  test('login success upgrades to OAuth tokens and authenticates', () async {
    final FakeAuthRepository repo = FakeAuthRepository();
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    await container.read(authSessionProvider.notifier).login(
          email: 'ads@quatrinity.in',
          password: 's3cret',
        );

    expect(repo.lastEmail, 'ads@quatrinity.in');
    expect(repo.lastPassword, 's3cret');
    expect(repo.upgradeCalled, isTrue);
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthAuthenticated>(),
    );
    expect(repo.tokenManager.isAuthenticated(), isTrue);
  });

  test('login with 2FA required completes after TOTP submit', () async {
    final FakeAuthRepository repo = FakeAuthRepository()
      ..signInResult = const LoginTwoFactorRequired('challenge-1');
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    await container
        .read(authSessionProvider.notifier)
        .login(email: 'ads@quatrinity.in', password: 's3cret');
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthTwoFactorRequired>()
          .having((s) => s.challenge, 'challenge', 'challenge-1'),
    );
    expect(repo.upgradeCalled, isFalse);

    await container.read(authSessionProvider.notifier).submitTotp('123456');

    expect(repo.upgradeCalled, isTrue);
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthAuthenticated>(),
    );
  });

  test('submitTotp with no pending challenge lands on AuthFailure', () async {
    final ProviderContainer container = containerWith(FakeAuthRepository());
    await container.read(authSessionProvider.future);

    await container.read(authSessionProvider.notifier).submitTotp('123456');

    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthFailure>()
          .having((s) => s.message, 'message', contains('No two-factor')),
    );
  });

  test('consent required surfaces AuthConsentRequired with the authorize URL',
      () async {
    final AuthorizeRequest consentRequest =
        AuthApi(baseUrl: 'https://ads-api-test.example').buildAuthorizeUrl(
      clientId: 'test-client-id-unprovisioned',
      redirectUri: 'quantads://oauth/callback',
    );
    final FakeAuthRepository repo = FakeAuthRepository()
      ..upgradeError = ConsentRequiredException(consentRequest);
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    await container
        .read(authSessionProvider.notifier)
        .login(email: 'ads@quatrinity.in', password: 's3cret');

    final AuthSessionState? state =
        container.read(authSessionProvider).valueOrNull;
    expect(
      state,
      isA<AuthConsentRequired>()
          .having((s) => s.authorizeUrl, 'authorizeUrl', consentRequest.url),
    );
    // The consent URL targets the QuantAds custom scheme on return.
    final Uri redirectBack = Uri.parse(
      (state! as AuthConsentRequired)
          .authorizeUrl
          .queryParameters['redirect_uri']!,
    );
    expect(redirectBack.scheme, 'quantads');
    expect(redirectBack.toString(), 'quantads://oauth/callback');
  });

  test('login failure lands on AuthFailure with the backend message', () async {
    final FakeAuthRepository repo = FakeAuthRepository()
      ..signInError = const AuthException(
        'Invalid email or password',
        code: 'invalid_credentials',
      );
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    await container
        .read(authSessionProvider.notifier)
        .login(email: 'ads@quatrinity.in', password: 'wrong');

    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthFailure>()
          .having((s) => s.message, 'message', 'Invalid email or password'),
    );
  });

  test('logout ends the session and clears tokens', () async {
    final FakeAuthRepository repo = FakeAuthRepository();
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);
    await container.read(authSessionProvider.notifier).login(
          email: 'ads@quatrinity.in',
          password: 's3cret',
        );
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthAuthenticated>(),
    );

    await container.read(authSessionProvider.notifier).logout();

    expect(repo.signedOut, isTrue);
    expect(repo.tokenManager.isAuthenticated(), isFalse);
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthInitial>(),
    );
  });

  test('completeOAuthCallback finishes the browser upgrade', () async {
    final FakeAuthRepository repo = FakeAuthRepository();
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    final Uri callback = Uri.parse(
      'quantads://oauth/callback?code=auth-code-1&state=state-9',
    );
    await container
        .read(authSessionProvider.notifier)
        .completeOAuthCallback(callback);

    expect(repo.browserUpgradeCalled, isTrue);
    expect(repo.browserUpgradeUri, callback);
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthAuthenticated>(),
    );
  });

  test('pendingOAuthRedirectProvider deep link is consumed by the notifier',
      () async {
    final FakeAuthRepository repo = FakeAuthRepository();
    final ProviderContainer container = containerWith(repo);
    await container.read(authSessionProvider.future);

    final Uri callback = Uri.parse(
      'quantads://oauth/callback?code=auth-code-2&state=state-7',
    );
    container.read(pendingOAuthRedirectProvider.notifier).state = callback;

    // The notifier's build() listener consumes the URI fire-and-forget.
    await waitForSession(
      container,
      (AuthSessionState? s) => s is AuthAuthenticated,
    );

    expect(repo.browserUpgradeCalled, isTrue);
    expect(repo.browserUpgradeUri, callback);
    // The flag is reset so the handoff cannot re-trigger.
    expect(container.read(pendingOAuthRedirectProvider), isNull);
  });

  test('real repository fails loudly on an unprovisioned OAuth client id',
      () async {
    final TokenManager manager =
        TokenManager(storage: InMemoryTokenStorage());
    final AuthRepository repo = AuthRepository(
      authApi: AuthApi(baseUrl: 'https://ads-api-test.example'),
      tokenManager: manager,
      apiBaseUrl: 'https://ads-api-test.example',
      webOrigin: 'https://quantads-test.example',
      // TODO(UNVERIFIED): U1 — the `quantads-flutter` client is not yet
      // provisioned; an empty client id must fail loudly, never silently.
      oauthClientId: '',
    );

    await expectLater(
      repo.upgradeToOAuthTokens(),
      throwsA(
        isA<AuthException>().having(
          (e) => e.code,
          'code',
          'client_not_provisioned',
        ),
      ),
    );
  });
}
