// ============================================================================
// quant_app - app router auth-gate tests (Phase 1, M2/W6)
// ============================================================================
//
// Exercises the M2 auth gate in `buildAppRouter`'s redirect hook with the
// REAL GoRouter (no seam to unit-test in isolation), a fake
// [AuthSessionNotifier] via [authSessionProvider.overrideWith], and the real
// route table — including the `/oauth/callback` handoff through
// [OAuthCallbackGate] and the unknown-route fallback.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/router/app_router.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_auth_session.dart';
import 'helpers/fake_inbox.dart';

typedef _RouterBundle = ({
  ProviderContainer container,
  GoRouter router,
  FakeAuthSessionNotifier auth,
});

/// Builds the real router against a container whose auth provider is the
/// given fake session state.
///
/// The inbox provider is overridden with an empty deterministic state: the
/// real [InboxListNotifier] would hit the network on first paint, which
/// router tests must never depend on. The empty state renders the M4
/// "You're all caught up" copy, which also proves the inbox screen itself
/// painted (not just the route).
_RouterBundle _buildTestRouter(AuthSessionState initial) {
  final FakeAuthSessionNotifier auth = FakeAuthSessionNotifier(initial);
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authSessionProvider.overrideWith(() => auth),
      inboxProvider.overrideWith(
        () => FakeInboxNotifier.data(const InboxListState()),
      ),
    ],
  );
  final GoRouter router = container.read(appRouterProvider);
  return (container: container, router: router, auth: auth);
}

Future<void> _pumpRouter(
  WidgetTester tester,
  GoRouter router,
  ProviderContainer container,
) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pump();
}

String _currentLocation(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.toString();

/// Two frames: lets navigation settle and any scheduled microtasks run.
Future<void> _settleNavigation(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

void main() {
  group('app router auth gate', () {
    testWidgets('redirects a signed-out user from /inbox to /login',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, :auth) =
          _buildTestRouter(const AuthInitial());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/inbox');
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/login');
      // Navigation intent: the login screen is shown, not the inbox.
      expect(find.text('QuantMail'), findsOneWidget);
      expect(
        find.text('Inbox \u2014 mail list lands here (M3)'),
        findsNothing,
      );
      expect(auth.completedOAuthUri, isNull);
    });

    testWidgets('lets a signed-out user stay on /login',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthInitial());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/login');
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/login');
      expect(find.text('QuantMail'), findsOneWidget);
    });

    testWidgets('pushes an authenticated user from /login into /inbox',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, :auth) =
          _buildTestRouter(const AuthInitial());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);
      expect(_currentLocation(router), '/login');

      // The refreshListenable fires on the session emission; the redirect
      // re-runs and pushes the signed-in user into the app.
      auth.emit(const AuthAuthenticated());
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/inbox');
      // Navigation intent: the real M4 inbox screen painted (empty state),
      // not the login page.
      expect(find.widgetWithText(AppBar, 'Inbox'), findsOneWidget);
      expect(find.text("You're all caught up"), findsOneWidget);
    });

    testWidgets('opens a thread route with its id for an authenticated user',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthAuthenticated());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/thread/abc123');
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/thread/abc123');
      expect(find.text('threadId: abc123'), findsOneWidget);
    });

    testWidgets('bounces a signed-out user from a thread route to /login',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthInitial());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/thread/abc123');
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/login');
      expect(find.text('QuantMail'), findsOneWidget);
    });

    testWidgets('bounces a failed session from /inbox to /login',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) = _buildTestRouter(
        const AuthFailure('Invalid email or password.'),
      );
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/inbox');
      await _settleNavigation(tester);

      expect(_currentLocation(router), '/login');
      // The failure message is surfaced on the login screen for retry.
      expect(find.text('Invalid email or password.'), findsOneWidget);
    });

    testWidgets('holds position while the session is loading',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthLoading());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/inbox');
      await _settleNavigation(tester);

      // No redirect: in-flight states stay parked where they are.
      expect(_currentLocation(router), '/inbox');
      expect(find.widgetWithText(AppBar, 'Inbox'), findsOneWidget);
      expect(find.text("You're all caught up"), findsOneWidget);
    });

    testWidgets('holds the consent screen on the login route',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) = _buildTestRouter(
        AuthConsentRequired(Uri.parse('https://auth.example.com/authorize')),
      );
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      expect(_currentLocation(router), '/login');
      expect(find.text('Browser me permission do'), findsOneWidget);
    });

    testWidgets('holds the TOTP screen on the login route',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthTwoFactorRequired('challenge-1'));
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      expect(_currentLocation(router), '/login');
      expect(find.text('Two-step verification'), findsOneWidget);
    });

    testWidgets(
        'consumes a pending OAuth callback and hands it to the auth notifier',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, :auth) =
          _buildTestRouter(const AuthInitial());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/oauth/callback?code=auth-code-1&state=state-1');
      // Frame 1: route builds. Frame 2: OAuthCallbackGate's post-frame
      // callback stashes the URI and triggers a redirect re-run, which
      // consumes it via completeOAuthCallback and lands on /login.
      // Frames 3-4: the handoff microtask and the /login rebuild settle.
      await tester.pump();
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(
        auth.completedOAuthUri?.toString(),
        '/oauth/callback?code=auth-code-1&state=state-1',
      );
      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(_currentLocation(router), '/login');
    });

    testWidgets('shows the error screen for unknown routes',
        (WidgetTester tester) async {
      final _RouterBundle(:container, :router, auth: _) =
          _buildTestRouter(const AuthAuthenticated());
      addTearDown(container.dispose);
      addTearDown(router.dispose);
      await _pumpRouter(tester, router, container);

      router.go('/definitely-not-a-route');
      await _settleNavigation(tester);

      expect(find.text('Page not found'), findsOneWidget);
      expect(find.textContaining('/definitely-not-a-route'), findsOneWidget);
    });
  });

  group('GoRouterRefreshStream', () {
    test('notifies listeners on every stream event and stops after dispose',
        () async {
      final StreamController<int> controller =
          StreamController<int>.broadcast();
      addTearDown(controller.close);
      final GoRouterRefreshStream refresh =
          GoRouterRefreshStream(controller.stream);

      int notifications = 0;
      refresh.addListener(() => notifications++);

      controller.add(1);
      await Future<void>.delayed(Duration.zero);
      expect(notifications, 1);

      controller.add(2);
      await Future<void>.delayed(Duration.zero);
      expect(notifications, 2);

      refresh.dispose();
      controller.add(3);
      await Future<void>.delayed(Duration.zero);
      expect(notifications, 2);
    });
  });
}
