// ============================================================================
// quantmax_app - test-only auth doubles (Phase 3b, Shift 1)
// ============================================================================
//
// Test-only helpers. No app code lives here.
//
// Drives the REAL contract from `package:quantmax_core/quantmax_core.dart`
// ([QuantMaxAuthSessionNotifier] / [AuthSessionState]).
//
// NOTE: the sealed [AuthSessionState] subclasses take POSITIONAL arguments
// (QA lesson F1), e.g. `AuthFailure('message')`, `AuthConsentRequired(uri)`.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

/// Test double for [QuantMaxAuthSessionNotifier]: starts in [initial],
/// records calls, and can be driven into any state with [emit].
class FakeAuthStateNotifier extends QuantMaxAuthSessionNotifier {
  FakeAuthStateNotifier([AuthSessionState? initial])
      : _current = initial ?? const AuthInitial();

  AuthSessionState _current;

  /// When true, [build] throws to exercise the provider error branch.
  bool throwOnBuild = false;

  /// Whether the SSO entry point was called.
  bool ssoStarted = false;

  /// The URI handed to [completeOAuthCallback], if any.
  Uri? completedOAuthUri;

  @override
  Future<AuthSessionState> build() async {
    if (throwOnBuild) {
      throw StateError('auth bootstrap failed');
    }
    return _current;
  }

  /// Drives the provider into [next] (test-only helper).
  void emit(AuthSessionState next) {
    _current = next;
    state = AsyncData<AuthSessionState>(next);
  }

  @override
  Future<void> startBrowserSignIn() async {
    ssoStarted = true;
  }

  @override
  Future<void> completeOAuthCallback(Uri uri) async {
    completedOAuthUri = uri;
  }
}
