// ============================================================================
// quantcooks_app - LoginScreen widget test
// ============================================================================
//
// Contract: `cooksAuthSessionProvider` (an AsyncNotifierProvider over
// [CooksAuthSessionNotifier]) drives `LoginScreen`. We override it with a
// stub notifier emitting real sealed states — positional ctors only
// (QA F1 lesson: never named args):
//
//   CooksAuthInitial()                       -> SSO button
//   CooksAuthConsentRequired(authorizeUrl)    -> consent handoff card
//
// The stub only overrides build() + startSsoLogin(); the real
// `_startSso` tap path (button -> notifier method) is what we verify.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantcooks_core/quantcooks_core.dart';

import 'package:quantcooks_app/src/screens/login_screen.dart';

/// Stub session notifier: tracks [startSsoLogin] calls and lets the test
/// push sealed session states. Never touches the repository layer.
class StubAuthSessionNotifier extends CooksAuthSessionNotifier {
  StubAuthSessionNotifier(this._current);

  CooksAuthSessionState _current;

  bool startSsoLoginCalled = false;

  @override
  Future<CooksAuthSessionState> build() async => _current;

  @override
  Future<void> startSsoLogin() async {
    startSsoLoginCalled = true;
  }

  /// Emits a new sealed session state to the screen.
  void emit(CooksAuthSessionState next) {
    _current = next;
    state = AsyncData(next);
  }
}

Future<void> _pumpLoginScreen(
  WidgetTester tester,
  StubAuthSessionNotifier stub,
) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        cooksAuthSessionProvider.overrideWith(() => stub),
      ],
      child: const MaterialApp(
        home: LoginScreen(),
      ),
    ),
  );
}

void main() {
  group('LoginScreen', () {
    testWidgets('renders the SSO button in the initial state',
        (WidgetTester tester) async {
      final StubAuthSessionNotifier stub =
          StubAuthSessionNotifier(const CooksAuthInitial());

      await _pumpLoginScreen(tester, stub);
      await tester.pump(); // flush the async notifier build

      expect(find.text('Sign in with Quant'), findsOneWidget);
      expect(find.text('Continue in browser'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('tapping SSO calls notifier.startSsoLogin',
        (WidgetTester tester) async {
      final StubAuthSessionNotifier stub =
          StubAuthSessionNotifier(const CooksAuthInitial());

      await _pumpLoginScreen(tester, stub);
      await tester.pump();

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Sign in with Quant'),
      );
      await tester.pump();

      expect(stub.startSsoLoginCalled, isTrue);
    });

    testWidgets('consent state shows the browser handoff view',
        (WidgetTester tester) async {
      final StubAuthSessionNotifier stub =
          StubAuthSessionNotifier(const CooksAuthInitial());

      await _pumpLoginScreen(tester, stub);
      await tester.pump();

      stub.emit(
        CooksAuthConsentRequired(
          Uri.parse('https://example.test/consent'),
        ),
      );
      await tester.pump();

      expect(find.text('Browser me permission do'), findsOneWidget);
      expect(find.text('Continue in browser'), findsOneWidget);
      // The SSO sign-in button is replaced by the consent handoff.
      expect(find.text('Sign in with Quant'), findsNothing);
    });
  });
}
