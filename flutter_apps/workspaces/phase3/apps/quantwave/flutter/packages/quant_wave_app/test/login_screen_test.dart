// ============================================================================
// quant_wave_app - LoginScreen widget tests (W3, shift 1)
// ============================================================================
//
// The real [AuthSessionNotifier] is replaced by manual fakes (no mocktail
// yet) via `authSessionProvider.overrideWith(...)`. Constructors are
// POSITIONAL (QA F1 lesson): `AuthFailure('msg')`, not named args.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:quant_wave_core/src/auth/auth_providers.dart';
import 'package:quant_wave_app/src/screens/login_screen.dart';

/// Records login calls instead of hitting the real [AuthRepository].
class _RecordingAuthSessionNotifier extends AuthSessionNotifier {
  int loginCalls = 0;
  String? lastEmail;
  String? lastPassword;

  @override
  Future<AuthSessionState> build() async => const AuthInitial();

  @override
  Future<void> login({
    required String email,
    required String password,
  }) async {
    loginCalls++;
    lastEmail = email;
    lastPassword = password;
  }
}

/// Always lands on a failure state (positional ctor per QA F1).
class _FailingAuthSessionNotifier extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async =>
      const AuthFailure('Invalid email or password.');
}

Future<void> _pumpLogin(
  WidgetTester tester,
  AuthSessionNotifier Function() create,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        authSessionProvider.overrideWith(create),
      ],
      child: const MaterialApp(
        home: LoginScreen(),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('LoginScreen', () {
    testWidgets('renders the sign-in form', (WidgetTester tester) async {
      await _pumpLogin(
        tester,
        _RecordingAuthSessionNotifier.new,
      );

      // Branding header renders exactly one 'QuantWave' title text
      // (the Semantics 'QuantWave logo' label is not a Text widget).
      expect(find.text('QuantWave'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
    });

    testWidgets('empty submit is blocked by validation (no notifier call)',
        (WidgetTester tester) async {
      final _RecordingAuthSessionNotifier notifier =
          _RecordingAuthSessionNotifier();
      await _pumpLogin(tester, () => notifier);

      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();

      expect(notifier.loginCalls, 0);
      expect(find.text('Email address is required'), findsOneWidget);
      expect(find.text('Password is required'), findsOneWidget);
    });

    testWidgets('valid submit calls login with the trimmed email',
        (WidgetTester tester) async {
      final _RecordingAuthSessionNotifier notifier =
          _RecordingAuthSessionNotifier();
      await _pumpLogin(tester, () => notifier);

      await tester.enterText(
        find.byType(TextFormField).at(0),
        '  user@example.com  ',
      );
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'secret123',
      );
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();
      await tester.pump();

      expect(notifier.loginCalls, 1);
      expect(notifier.lastEmail, 'user@example.com');
      expect(notifier.lastPassword, 'secret123');
    });

    testWidgets('shows the failure banner on AuthFailure',
        (WidgetTester tester) async {
      await _pumpLogin(
        tester,
        _FailingAuthSessionNotifier.new,
      );

      expect(find.text('Invalid email or password.'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
    });
  });
}
