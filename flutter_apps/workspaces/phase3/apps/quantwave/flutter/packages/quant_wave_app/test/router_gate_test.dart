// ============================================================================
// quant_wave_app - auth-gate router tests (W3, shift 1)
// ============================================================================
//
// Exercises the REAL `buildAppRouter` redirect closure against faked
// [AuthSessionNotifier] states (manual fakes, no mocktail yet).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:quant_wave_core/src/auth/auth_providers.dart';
import 'package:quant_wave_app/src/router/app_router.dart';

class _SignedOutNotifier extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async => const AuthInitial();
}

class _SignedInNotifier extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async => const AuthAuthenticated();
}

/// Builds the real app router against a container whose session state is
/// faked, then hosts it in the widget tree.
Future<GoRouter> _pumpRouter(
  WidgetTester tester,
  AuthSessionNotifier Function() create,
) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authSessionProvider.overrideWith(create),
    ],
  );
  addTearDown(container.dispose);
  final GoRouter router = container.read(appRouterProvider);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

String _path(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.path;

void main() {
  group('auth gate', () {
    testWidgets('unauthenticated /timeline redirects to /login',
        (WidgetTester tester) async {
      final GoRouter router = await _pumpRouter(
        tester,
        _SignedOutNotifier.new,
      );

      router.go('/timeline');
      await tester.pumpAndSettle();

      expect(_path(router), '/login');
      expect(find.text('Sign in'), findsOneWidget);
    });

    testWidgets('authenticated /login redirects to /timeline',
        (WidgetTester tester) async {
      final GoRouter router = await _pumpRouter(
        tester,
        _SignedInNotifier.new,
      );

      expect(_path(router), '/timeline');
      // /timeline now renders the tab shell (W2): AppBar title + bottom-nav
      // label both say 'Timeline'. The placeholder 'Timeline — coming soon'
      // text was removed with the pre-spec timeline slice.
      expect(find.text('Timeline'), findsWidgets);
      expect(find.text('Sign in'), findsNothing);
    });

    testWidgets('authenticated user stays on /timeline',
        (WidgetTester tester) async {
      final GoRouter router = await _pumpRouter(
        tester,
        _SignedInNotifier.new,
      );

      router.go('/timeline');
      await tester.pumpAndSettle();

      expect(_path(router), '/timeline');
    });
  });
}
