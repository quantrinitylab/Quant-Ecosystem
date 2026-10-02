// ============================================================================
// quant_core - unit tests: silentRefreshProvider wiring
// ============================================================================
//
// `SilentRefreshScheduler` itself is covered with a fake timer in
// `oauth_refresh_test.dart`. This file covers the Riverpod wiring in
// [silentRefreshProvider]:
//   - reading it keeps W2's [authSessionProvider] instantiated
//   - arming does NOT refresh eagerly (the 900 s − leeway timer fires at
//     expiry, not on arm — the provider uses the real timer factory, so the
//     test only observes that nothing fires early)
//   - authenticated → unauthenticated emissions and container disposal do
//     not throw and cancel the timer/subscription (no leaks)
//
// The fire() branches (success / AuthSignedOutException / transient catch)
// are NOT reachable here: the provider hard-codes the real [Timer] factory
// and the 900 s verified TTL, so no test can trigger a fire without waiting.
// That is a deliberate seam gap — see the shift report.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'helpers/scripted_auth_repository.dart';

void main() {
  late TokenManager tokens;
  late ScriptedAuthRepository repo;

  ProviderContainer makeContainer() {
    return ProviderContainer(
      overrides: [
        appConfigProvider.overrideWithValue(
          const AppConfig(
            apiBaseUrl: 'https://api.test.local',
            oauthClientId: 'test-client',
            webOrigin: 'https://web.test.local',
          ),
        ),
        tokenManagerProvider.overrideWithValue(tokens),
        authRepositoryProvider.overrideWithValue(repo),
      ],
    );
  }

  setUp(() {
    tokens = TokenManager(storage: InMemoryTokenStorage());
    repo = ScriptedAuthRepository(tokens);
    addTearDown(tokens.dispose);
  });

  test('reading the provider keeps the W2 session provider instantiated',
      () async {
    final container = makeContainer();
    addTearDown(container.dispose);

    // Read for its side effect only; the provider itself has no value.
    container.read(silentRefreshProvider);

    final state = await container.read(authSessionProvider.future);

    expect(state, isA<AuthInitial>());
    expect(container.read(isSessionAuthenticatedProvider), isFalse);
  });

  test('arming does not refresh eagerly: refreshSession only fires at expiry',
      () async {
    final container = makeContainer();
    addTearDown(container.dispose);
    container.read(silentRefreshProvider);
    await container.read(authSessionProvider.future);

    // The authenticated emission arms the scheduler (real ~780 s timer);
    // nothing may fire synchronously or on the following event-loop turns.
    await tokens.setTokens('a', 'r');
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(repo.refreshSessionCalls, 0);
  });

  test(
      'survives authenticated → unauthenticated emissions and dispose '
      'without throwing', () async {
    final container = makeContainer();
    container.read(silentRefreshProvider);
    await container.read(authSessionProvider.future);

    await tokens.setTokens('a', 'r'); // arms the scheduler
    await tokens.clearTokens(); // disarms it
    await tokens.setTokens('a2', 'r2'); // re-arms

    container.dispose(); // cancels the timer + the stream subscription

    // Emitting after dispose must not reach the cancelled subscription.
    await tokens.setTokens('a3', 'r3');
    expect(repo.refreshSessionCalls, 0);
  });
}
