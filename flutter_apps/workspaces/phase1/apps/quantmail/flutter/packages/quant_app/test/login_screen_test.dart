// ============================================================================
// quant_app - LoginScreen widget tests (Phase 1, M2)
// ============================================================================
//
// Exercises every [AuthSessionState] of the login screen with a fake
// [AuthSessionNotifier] (via [authSessionProvider.overrideWith]) and a fake
// [BrowserAuthLauncher] (via [browserLauncherProvider.overrideWithValue]).
//
// Uses W2's auth contract from package:quant_core and W4's
// browserLauncherProvider exactly as specified; the tests compile once both
// land in the workspace.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/auth/browser_launcher.dart';
import 'package:quant_app/src/screens/login_screen.dart';
import 'package:quant_app/src/widgets/auth_fields.dart';
import 'package:quant_core/quant_core.dart';

/// Test double for [AuthSessionNotifier]: starts in [initial], records calls,
/// and can be driven into any state with [emit].
class FakeAuthSessionNotifier extends AuthSessionNotifier {
  FakeAuthSessionNotifier([AuthSessionState? initial])
      : _current = initial ?? AuthInitial();

  AuthSessionState _current;

  /// When true, [build] throws to exercise the provider error branch.
  bool throwOnBuild = false;

  String? lastEmail;
  String? lastPassword;
  String? lastTotp;
  bool loggedOut = false;

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
  Future<void> login({
    required String email,
    required String password,
  }) async {
    lastEmail = email;
    lastPassword = password;
  }

  @override
  Future<void> submitTotp(String code) async {
    lastTotp = code;
  }

  @override
  Future<void> logout() async {
    loggedOut = true;
  }
}

/// Test double for [BrowserAuthLauncher]: records opened URLs.
class FakeBrowserLauncher extends BrowserAuthLauncher {
  final List<Uri> opened = <Uri>[];

  @override
  Future<bool> openAuthorizeUrl(Uri url) async {
    opened.add(url);
    return true;
  }
}

Widget _harness({
  required FakeAuthSessionNotifier auth,
  FakeBrowserLauncher? launcher,
}) {
  return ProviderScope(
    overrides: <Override>[
      authSessionProvider.overrideWith(() => auth),
      if (launcher != null)
        browserLauncherProvider.overrideWithValue(launcher),
    ],
    child: const MaterialApp(home: LoginScreen()),
  );
}

Future<void> _pumpLogin(
  WidgetTester tester, {
  AuthSessionState? initial,
  FakeBrowserLauncher? launcher,
}) async {
  await tester.pumpWidget(
    _harness(
      auth: FakeAuthSessionNotifier(initial),
      launcher: launcher,
    ),
  );
  await tester.pump();
}

void main() {
  group('LoginScreen', () {
    testWidgets('renders the sign-in form in the initial state',
        (WidgetTester tester) async {
      await _pumpLogin(tester);

      expect(find.text('QuantMail'), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(
        find.widgetWithText(ElevatedButton, 'Sign in'),
        findsOneWidget,
      );
    });

    testWidgets('validates email and password before signing in',
        (WidgetTester tester) async {
      final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier();
      await tester.pumpWidget(_harness(auth: auth));
      await tester.pump();

      // Empty form: both validators fire, no login attempt.
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();
      expect(find.text('Email address is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
      expect(auth.lastEmail, isNull);

      // Invalid email: blocked before login.
      await tester.enterText(
        find.byType(TextFormField).first,
        'not-an-email',
      );
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(auth.lastEmail, isNull);

      // Valid input: login is called with trimmed values.
      await tester.enterText(
        find.byType(TextFormField).first,
        '  user@example.com  ',
      );
      await tester.enterText(
        find.byType(TextFormField).at(1),
        's3cret',
      );
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();
      expect(auth.lastEmail, 'user@example.com');
      expect(auth.lastPassword, 's3cret');
    });

    testWidgets('shows an error banner on AuthFailure',
        (WidgetTester tester) async {
      await _pumpLogin(
        tester,
        initial: AuthFailure('Invalid email or password.'),
      );

      expect(find.text('Invalid email or password.'), findsOneWidget);
      // The form is still there so the user can retry.
      expect(
        find.widgetWithText(ElevatedButton, 'Sign in'),
        findsOneWidget,
      );
    });

    testWidgets('disables the form and spins while AuthLoading',
        (WidgetTester tester) async {
      await _pumpLogin(tester, initial: AuthLoading());

      final Finder signIn = find.widgetWithText(ElevatedButton, 'Sign in');
      expect(signIn, findsNothing);
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      expect(
        tester.widget<AuthEmailField>(find.byType(AuthEmailField)).enabled,
        isFalse,
      );
      // Button is disabled.
      final ElevatedButton button =
          tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('shows the TOTP screen on AuthTwoFactorRequired',
        (WidgetTester tester) async {
      final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier();
      await tester.pumpWidget(_harness(auth: auth));
      await tester.pump();

      auth.emit(AuthTwoFactorRequired('challenge-123'));
      await tester.pump();

      expect(find.text('Two-step verification'), findsOneWidget);
      expect(
        find.widgetWithText(ElevatedButton, 'Verify'),
        findsOneWidget,
      );

      // Short code: validation error, no submit.
      await tester.enterText(find.byType(TextFormField), '123');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Verify'));
      await tester.pump();
      expect(find.text('Code must be 6 digits'), findsOneWidget);
      expect(auth.lastTotp, isNull);

      // Valid code: submitted to the notifier.
      await tester.enterText(find.byType(TextFormField), '654321');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Verify'));
      await tester.pump();
      expect(auth.lastTotp, '654321');
    });

    testWidgets('Back returns from TOTP to the sign-in form',
        (WidgetTester tester) async {
      final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier();
      await tester.pumpWidget(_harness(auth: auth));
      await tester.pump();

      auth.emit(AuthTwoFactorRequired('challenge-123'));
      await tester.pump();
      expect(
        find.widgetWithText(ElevatedButton, 'Verify'),
        findsOneWidget,
      );

      await tester.tap(find.widgetWithText(TextButton, 'Back'));
      await tester.pump();

      expect(
        find.widgetWithText(ElevatedButton, 'Sign in'),
        findsOneWidget,
      );
      expect(auth.lastTotp, isNull);
    });

    testWidgets('opens the authorize URL in the browser for consent',
        (WidgetTester tester) async {
      final Uri url =
          Uri.parse('https://accounts.example.com/o/authorize?x=1');
      final FakeBrowserLauncher launcher = FakeBrowserLauncher();
      final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier();
      await tester.pumpWidget(_harness(auth: auth, launcher: launcher));
      await tester.pump();

      auth.emit(AuthConsentRequired(url));
      await tester.pump();

      expect(find.text('Browser me permission do'), findsOneWidget);
      expect(
        find.textContaining('Pehli baar browser me permission'),
        findsOneWidget,
      );
      expect(
        find.text('Approve karne ke baad app par wapas aa jao.'),
        findsOneWidget,
      );

      await tester.tap(
        find.widgetWithText(ElevatedButton, 'Continue in browser'),
      );
      await tester.pump();

      expect(launcher.opened, <Uri>[url]);
    });

    testWidgets('renders nothing when authenticated',
        (WidgetTester tester) async {
      await _pumpLogin(tester, initial: AuthAuthenticated());

      expect(find.text('Sign in'), findsNothing);
      expect(find.text('QuantMail'), findsNothing);
      expect(find.byType(SizedBox), findsWidgets);
    });

    testWidgets('shows a fallback with retry when the provider errors',
        (WidgetTester tester) async {
      final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier()
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
}
