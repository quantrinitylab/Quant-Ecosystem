// ============================================================================
// quant_core - https-guard tests for the login transport (Phase 1 M2)
// ============================================================================
//
// Zero-defect security shift 2026-10-04 (P1): `AuthRepository` built its
// bare `_loginDio` with no https guard — a misconfigured
// `QUANT_API_BASE_URL=http://…` would send the user's plaintext password
// over cleartext HTTP on `POST /auth/login`. The constructor now calls the
// shared [requireHttpsBaseUrl] (from quant_foundation) before building the
// Dio, failing loudly in every build mode.
//
// No network, no platform channels. The injected-`loginDio` seam still
// bypasses the guard (callers that inject their own Dio own its config).
// ============================================================================

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

AuthRepository _repository({required String apiBaseUrl}) => AuthRepository(
      authApi: AuthApi(baseUrl: 'https://auth.test.local'),
      tokenManager: TokenManager(storage: InMemoryTokenStorage()),
      apiBaseUrl: apiBaseUrl,
      webOrigin: 'https://web.test.local',
      oauthClientId: 'test-client',
    );

void main() {
  group('AuthRepository login-transport https guard', () {
    test('throws ArgumentError on non-loopback http base URL', () {
      expect(
        () => _repository(apiBaseUrl: 'http://api.quantrinity.in'),
        throwsArgumentError,
      );
      expect(
        () => _repository(apiBaseUrl: 'http://192.168.1.10:3000'),
        throwsArgumentError,
      );
    });

    test('rejects missing scheme', () {
      expect(
        () => _repository(apiBaseUrl: 'api.quantrinity.in'),
        throwsArgumentError,
      );
    });

    test('accepts https and loopback http base URLs', () {
      _repository(apiBaseUrl: 'https://api.quantrinity.in');
      _repository(apiBaseUrl: 'http://localhost:8080');
      _repository(apiBaseUrl: 'http://127.0.0.1:3000');
    });

    test('injected loginDio seam still bypasses the guard', () {
      // Callers injecting their own Dio own its transport config; the
      // guard applies only to the Dio the repository builds itself.
      final stub = Dio(BaseOptions(baseUrl: 'http://anything.test'));
      AuthRepository(
        authApi: AuthApi(baseUrl: 'https://auth.test.local'),
        tokenManager: TokenManager(storage: InMemoryTokenStorage()),
        apiBaseUrl: 'http://anything.test',
        webOrigin: 'https://web.test.local',
        oauthClientId: 'test-client',
        loginDio: stub,
      );
    });
  });
}
