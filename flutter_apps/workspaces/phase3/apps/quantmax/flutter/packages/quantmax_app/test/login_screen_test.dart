// ============================================================================
// quantmax_app - LoginScreen widget tests (Phase 3b, Shift 1)
// ============================================================================
//
// Exercises every [AuthSessionState] of the login screen with a fake
// [QuantMaxAuthSessionNotifier] (via [authStateProvider.overrideWith]) and a
// fake [BrowserAuthLauncher] (via [browserLauncherProvider.overrideWithValue]).
//
// QA lesson F1: state constructors are POSITIONAL — `AuthFailure('msg')`,
// `AuthConsentRequired(uri)`. No named args.
//
// Unexecuted here (no Flutter SDK in this env); run on an SDK machine with
// `flutter test`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantmax_core/quantmax_core.dart';
import 'package:quantmax_app/src/auth/browser_launcher.dart';
import 'package:quantmax_app/src/screens/login_screen.dart';
import 'package:quantmax_app/src/widgets/auth_fields.dart';

import 'helpers/fake_auth_state.dart';

/// Test double for [BrowserAuthLauncher]: records opened URLs.
class FakeBrowserLauncher extends BrowserAuthLauncher {
  final List<Uri> opened = <Uri>[];

  @override
  Future<bool> openAuthorizeUrl(Uri url) async {
    opened.add(url);
    return true;
  }
}

/// Test double that reports the browser launch as failed.
class FailingBrowserLauncher extends BrowserAuthLauncher {
  @override
  Future<bool> openAuthorizeUrl(Uri url) async => false;
}

Widget _harness({
  required FakeAuthStateNotifier auth,
  BrowserAuthLauncher? launcher,
}) {
  return ProviderScope(
    overrides: <Override>[
      authStateProvider.overrideWith(() => auth),
      if (launcher != null)
        browserLauncherProvider.overrideWithValue(launcher),
    ],
    child: const MaterialApp(home: LoginScreen()),
  );
}

Future<void> _pumpLogin(
  WidgetTester tester, {
  AuthSessionState? initial,
  BrowserAuthLauncher? launcher,
}) async {
  await tester.pumpWidget(
    _harness(
      auth: FakeAuthStateNotifier(initial),
      launcher: launcher,
    ),
  );
  await tester.pump();
}

void main() {
  group('LoginScreen', () {
    testWidgets('renders the SSO hero in the initial state',
        (WidgetTester tester) async {
      await _pumpLogin(tester);

      expect(find.text('QuantMax'), findsOneWidget);
      expect(find.text('Short videos. Endless discovery.'), findsOneWidget);
      expect(
        find.widgetWithText(ElevatedButton, 'Continue with QuantMail'),
        findsOneWidget,
      );
    });

    testWidgets('tapping the SSO button starts the QuantMail flow',
        (WidgetTester tester) async {
      final FakeAuthStateNotifier auth = FakeAuthStateNotifier();
      await tester.pumpWidget(_harness(auth: auth));
      await tester.pump();

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Continue with QuantMail'),
      );
      await tester.pump();

      expect(auth.ssoStarted, isTrue);
    });

    testWidgets('shows an error banner on AuthFailure (positional ctor)',
        (WidgetTester tester) async {
      await _pumpLogin(
        tester,
        // POSITIONAL constructor — QA lesson F1.
        initial: const AuthFailure('Session expired — sign in again.'),
      );

      expect(find.text('Session expired — sign in again.'), findsOneWidget);
      // The form is still there so the user can retry.
      expect(
        find.widgetWithText(ElevatedButton, 'Continue with QuantMail'),
        findsOneWidget,
      );
    });

    testWidgets('spins the button while AuthLoading',
        (WidgetTester tester) async {
      await _pumpLogin(tester, initial: const AuthLoading());

      expect(find.byType(CircularProgressIndicator), findsWidgets);
      // Button is disabled while the flow is in flight.
      final ContinueWithQuantMailButton button = tester
          .widget<ContinueWithQuantMailButton>(
        find.byType(ContinueWithQuantMailButton),
      );
      expect(button.onPressed, isNull);
      expect(button.loading, isTrue);
    });

    testWidgets('opens the authorize URL in the browser for consent',
        (WidgetTester tester) async {
      final Uri url =
          Uri.parse('https://accounts.example.com/o/authorize?x=1');
      final FakeBrowserLauncher launcher = FakeBrowserLauncher();
      final FakeAuthStateNotifier auth = FakeAuthStateNotifier();
      await tester.pumpWidget(_harness(auth: auth, launcher: launcher));
      await tester.pump();

      // POSITIONAL constructor — QA lesson F1.
      auth.emit(AuthConsentRequired(url));
      await tester.pump();

      expect(find.text('Browser me permission do'), findsOneWidget);
      expect(
        find.widgetWithText(ElevatedButton, 'Continue in browser'),
        findsOneWidget,
      );

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Continue in browser'),
      );
      await tester.pump();

      expect(launcher.opened, <Uri>[url]);
    });

    testWidgets('shows a snackbar when the browser fails to open',
        (WidgetTester tester) async {
      final Uri url =
          Uri.parse('https://accounts.example.com/o/authorize?x=1');
      final FakeAuthStateNotifier auth = FakeAuthStateNotifier();
      await tester.pumpWidget(
        _harness(auth: auth, launcher: FailingBrowserLauncher()),
      );
      await tester.pump();

      auth.emit(AuthConsentRequired(url));
      await tester.pump();

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Continue in browser'),
      );
      await tester.pump();

      expect(find.text('Browser nahi khul paya — dobara try karo.'),
          findsOneWidget);
    });

    testWidgets('renders nothing when authenticated',
        (WidgetTester tester) async {
      await _pumpLogin(tester, initial: const AuthAuthenticated());

      expect(find.text('Continue with QuantMail'), findsNothing);
      expect(find.text('QuantMax'), findsNothing);
      expect(find.byType(SizedBox), findsWidgets);
    });

    testWidgets('shows a fallback with retry when the provider errors',
        (WidgetTester tester) async {
      final FakeAuthStateNotifier auth = FakeAuthStateNotifier()
        ..throwOnBuild = true;
      await tester.pumpWidget(_harness(auth: auth));
      await tester.pump();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(
        find.widgetWithText(OutlinedButton, 'Retry'),
        findsOneWidget,
      );

      // Retry invalidates the provider; the fake still fails, so the
      // fallback re-renders (no crash, no spinner stuck).
      await tester.tap(find.widgetWithText(OutlinedButton, 'Retry'));
      await tester.pump();
      expect(find.text('Something went wrong'), findsOneWidget);
    });
  });

  group('auth form validators', () {
    test('AuthEmailField.validate', () {
      expect(AuthEmailField.validate(null), 'Email address is required');
      expect(AuthEmailField.validate('no-at-sign'), 'Enter a valid email address');
      expect(AuthEmailField.validate('user@example.com'), isNull);
      expect(AuthEmailField.validate('  user@example.com  '), isNull);
    });

    test('AuthPasswordField.validate', () {
      expect(AuthPasswordField.validate(null), 'Password is required');
      expect(AuthPasswordField.validate(''), 'Password is required');
      expect(AuthPasswordField.validate('s3cret'), isNull);
    });
  });
}
