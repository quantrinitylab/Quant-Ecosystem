// ============================================================================
// quant_app - shared widget-test doubles (Phase 1, M2+)
// ============================================================================
//
// Test-only helpers. No app code lives here.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_core/quant_core.dart';

/// Test double for [AuthSessionNotifier]: starts in [initial], records calls,
/// and can be driven into any state with [emit].
///
/// NOTE: the sealed [AuthSessionState] subclasses take POSITIONAL arguments
/// (see package:quant_core's `auth_providers.dart`), e.g.
/// `AuthTwoFactorRequired('challenge')`, `AuthFailure('message')`.
class FakeAuthSessionNotifier extends AuthSessionNotifier {
  FakeAuthSessionNotifier([AuthSessionState? initial])
      : _current = initial ?? const AuthInitial();

  AuthSessionState _current;

  /// The URI handed to [completeOAuthCallback], if any.
  Uri? completedOAuthUri;

  @override
  Future<AuthSessionState> build() async => _current;

  /// Drives the provider into [next] (test-only helper).
  void emit(AuthSessionState next) {
    _current = next;
    state = AsyncData<AuthSessionState>(next);
  }

  @override
  Future<void> completeOAuthCallback(Uri uri) async {
    completedOAuthUri = uri;
  }
}
