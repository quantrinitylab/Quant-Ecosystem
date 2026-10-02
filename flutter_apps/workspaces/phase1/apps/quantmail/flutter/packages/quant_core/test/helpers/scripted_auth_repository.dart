// ============================================================================
// quant_core - test helper: scripted AuthRepository double
// ============================================================================
//
// NOT a test file (no *_test.dart suffix, so the runner ignores it).
// Provides [ScriptedAuthRepository] for provider-layer tests: every flow
// step is scriptable via public fields, and every call is observable.

import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Scripted [AuthRepository] double for provider-layer tests.
///
/// Mirrors the repository interface; each flow step is scriptable via the
/// public fields. A successful [upgradeToOAuthTokens] /
/// [completeBrowserUpgrade] stores fake tokens on the shared [TokenManager],
/// like the real repository would.
class ScriptedAuthRepository extends AuthRepository {
  /// The shared token manager (also injected via `tokenManagerProvider`).
  final TokenManager tokens;

  /// Result returned by [signInWithPassword]; defaults to success.
  LoginResult nextLoginResult = const LoginSucceeded();

  /// If set, [signInWithPassword] throws this instead of returning a result.
  Object? loginError;

  /// If set, [upgradeToOAuthTokens] throws this instead of succeeding.
  Object? upgradeError;

  /// If set, [signOut] throws this (after recording the call).
  Object? signOutError;

  /// If set, [completeBrowserUpgrade] throws this instead of succeeding.
  Object? callbackError;

  /// Records whether [signOut] was called.
  bool signedOut = false;

  /// Counts [refreshSession] calls (silent-refresh wiring observation).
  int refreshSessionCalls = 0;

  /// Callback URIs passed to [completeBrowserUpgrade], in order.
  final List<Uri> callbackUris = <Uri>[];

  ScriptedAuthRepository(this.tokens)
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
  }) async {}

  @override
  Future<void> upgradeToOAuthTokens() async {
    final error = upgradeError;
    if (error != null) throw error;
    await tokens.setTokens('fake-access-token', 'fake-refresh-token');
  }

  @override
  Future<void> completeBrowserUpgrade(Uri callbackUri) async {
    callbackUris.add(callbackUri);
    final error = callbackError;
    if (error != null) throw error;
    await tokens.setTokens('fake-access-token', 'fake-refresh-token');
  }

  @override
  AuthorizeRequest? get pendingAuthorizeRequest => null;

  @override
  Future<void> refreshSession() async {
    refreshSessionCalls++;
  }

  @override
  Future<void> signOut() async {
    signedOut = true;
    final error = signOutError;
    if (error != null) throw error;
    await tokens.clearTokens();
  }
}
