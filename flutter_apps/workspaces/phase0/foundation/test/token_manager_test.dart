// TokenManager unit tests (mocktail for the storage seam).
//
// Run: `flutter test` from the package root.

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:quant_foundation/quant_foundation.dart';

class MockTokenStorage extends Mock implements TokenStorage {}

MockTokenStorage _stubbedStorage() {
  final storage = MockTokenStorage();
  when(() => storage.read(any())).thenAnswer((_) async => null);
  when(() => storage.write(any(), any())).thenAnswer((_) async {});
  when(() => storage.delete(any())).thenAnswer((_) async {});
  return storage;
}

/// Lets pending broadcast-stream events flush.
Future<void> _flushEvents() => Future<void>.delayed(Duration.zero);

void main() {
  group('TokenManager', () {
    test('hydrate loads persisted tokens and emits authenticated', () async {
      final storage = InMemoryTokenStorage();
      await storage.write(TokenKeys.accessToken, 'a1');
      await storage.write(TokenKeys.refreshToken, 'r1');

      final manager = TokenManager(storage: storage);
      final states = <AuthState>[];
      final sub = manager.onAuthStateChanged.listen(states.add);

      await manager.hydrate();
      await _flushEvents();

      expect(manager.isAuthenticated(), isTrue);
      expect(manager.getAccessToken(), 'a1');
      expect(manager.getRefreshToken(), 'r1');
      expect(manager.currentState.status, AuthStatus.authenticated);
      // BehaviorSubject replays the seeded `unknown`, then the hydrate emits
      // `authenticated`.
      expect(states.first.status, AuthStatus.unknown);
      expect(states.last.status, AuthStatus.authenticated);

      await sub.cancel();
      manager.dispose();
    });

    test('starts unauthenticated when storage is empty', () async {
      final manager = TokenManager(storage: _stubbedStorage());
      await manager.hydrate();
      expect(manager.isAuthenticated(), isFalse);
      expect(manager.currentState.status, AuthStatus.unauthenticated);
      manager.dispose();
    });

    test('setTokens persists and emits; refresh preserved when omitted',
        () async {
      final storage = _stubbedStorage();
      final manager = TokenManager(storage: storage);

      await manager.setTokens('a1', 'r1');
      // Rotation-less refresh responses omit the refresh token: the stored
      // one must survive (mirrors the TS setTokens contract).
      await manager.setTokens('a2');

      expect(manager.getAccessToken(), 'a2');
      expect(manager.getRefreshToken(), 'r1');
      verify(() => storage.write(TokenKeys.accessToken, 'a1')).called(1);
      verify(() => storage.write(TokenKeys.accessToken, 'a2')).called(1);
      verify(() => storage.write(TokenKeys.refreshToken, 'r1')).called(1);
      verifyNever(() => storage.delete(any()));
      manager.dispose();
    });

    test('clearTokens wipes memory and storage and emits unauthenticated',
        () async {
      final storage = _stubbedStorage();
      final manager = TokenManager(storage: storage);
      final states = <AuthState>[];
      final sub = manager.onAuthStateChanged.listen(states.add);

      await manager.setTokens('a1', 'r1');
      await manager.clearTokens();
      await _flushEvents();

      expect(manager.isAuthenticated(), isFalse);
      expect(manager.getAccessToken(), isNull);
      expect(manager.getRefreshToken(), isNull);
      verify(() => storage.delete(TokenKeys.accessToken)).called(1);
      verify(() => storage.delete(TokenKeys.refreshToken)).called(1);
      expect(states.last.status, AuthStatus.unauthenticated);

      await sub.cancel();
      manager.dispose();
    });

    test('getValidToken hydrates from storage on first call', () async {
      final backing = InMemoryTokenStorage();
      await backing.write(TokenKeys.accessToken, 'warm');
      final manager = TokenManager(storage: backing);

      // No explicit hydrate(): getValidToken warms the cache itself.
      expect(await manager.getValidToken(), 'warm');
      manager.dispose();
    });

    test('hydrate is idempotent', () async {
      final storage = _stubbedStorage();
      final manager = TokenManager(storage: storage);
      await manager.hydrate();
      await manager.hydrate();
      verify(() => storage.read(TokenKeys.accessToken)).called(1);
      manager.dispose();
    });
  });
}
