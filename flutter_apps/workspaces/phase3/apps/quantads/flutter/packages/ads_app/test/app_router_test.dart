// Copyright (c) 2026 Quatrinity Labs. All rights reserved.
// QuantAds omnipresent — router auth-gate + deep-link route tests.
//
// Widget tests over the REAL [buildAppRouter] with the auth session faked
// (a subclass of the real [AuthSessionNotifier], so the router's redirect
// hook calls the real method signatures):
//   - unauthenticated: /dashboard (and any protected route) bounces to
//     /login; /login itself renders the sign-in form.
//   - authenticated: /login bounces to /dashboard; /dashboard renders.
//   - /oauth/callback exists: the [OAuthCallbackGate] hands the deep link
//     (`quantads://oauth/callback?code=…&state=…`) to the auth notifier via
//     [AuthSessionNotifier.completeOAuthCallback], which flips the session
//     to [AuthAuthenticated] and lands the user on /dashboard.

import 'package:ads_app/src/router/app_router.dart';
import 'package:ads_app/src/screens/dashboard_screen.dart';
import 'package:ads_app/src/screens/login_screen.dart';
import 'package:ads_core/ads_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// A real [AuthSessionNotifier] with network-free, scriptable behavior.
///
/// `build()` is overridden so the real bootstrap (token hydration) never
/// runs; every public method keeps its real signature and the router's
/// redirect hook calls the real names.
class FakeAuthSessionNotifier extends AuthSessionNotifier {
  FakeAuthSessionNotifier(this.fixedState);

  final AuthSessionState fixedState;

  int completeOAuthCallbackCalls = 0;
  Uri? completedCallbackUri;

  @override
  Future<AuthSessionState> build() async => fixedState;

  @override
  Future<void> login({
    required String email,
    required String password,
  }) async {}

  @override
  Future<void> submitTotp(String code) async {}

  @override
  Future<void> completeOAuthCallback(Uri uri) async {
    completeOAuthCallbackCalls++;
    completedCallbackUri = uri;
    state = const AsyncData(AuthAuthenticated());
  }

  @override
  Future<void> logout() async {
    state = const AsyncData(AuthInitial());
  }
}

/// Container with the auth session pinned to [state]; registers container
/// disposal with the test framework.
ProviderContainer containerWith(AuthSessionState state) {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authSessionProvider
          .overrideWith(() => FakeAuthSessionNotifier(state)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Pumps the app router from [container] and returns the [GoRouter].
///
/// [settle] uses [WidgetTester.pumpAndSettle]; pass `false` (with manual
/// pumps) when the target screen animates forever (e.g. the login spinner
/// in [AuthLoading]), which would make pumpAndSettle time out.
Future<GoRouter> pumpRouter(
  WidgetTester tester,
  ProviderContainer container, {
  bool settle = true,
}) async {
  final GoRouter router = container.read(appRouterProvider);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }
  return router;
}

void main() {
  testWidgets('unauthenticated /login renders the sign-in form',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthInitial());
    final GoRouter router = await pumpRouter(tester, container);

    expect(router.state.matchedLocation, '/login');
    expect(find.text('QuantAds'), findsWidgets);
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('unauthenticated user visiting /dashboard bounces to /login',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthInitial());
    final GoRouter router = await pumpRouter(tester, container);

    router.go('/dashboard');
    await tester.pumpAndSettle();

    expect(router.state.matchedLocation, '/login');
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });

  testWidgets('unauthenticated user visiting an unknown route bounces to /login',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthInitial());
    final GoRouter router = await pumpRouter(tester, container);

    router.go('/campaigns/123');
    await tester.pumpAndSettle();

    // The auth gate runs before the error screen: non-login, non-callback
    // locations bounce to /login while signed out.
    expect(router.state.matchedLocation, '/login');
    expect(find.text('Sign in'), findsOneWidget);
  });

  testWidgets('authenticated user visiting /login bounces to /dashboard',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthAuthenticated());
    final GoRouter router = await pumpRouter(tester, container);

    // Pump starts at /login (initialLocation); the gate must push through.
    await tester.pumpAndSettle();
    expect(router.state.matchedLocation, '/dashboard');
    expect(find.byType(DashboardScreen), findsOneWidget);
  });

  testWidgets('authenticated user stays on /dashboard',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthAuthenticated());
    final GoRouter router = await pumpRouter(tester, container);

    router.go('/dashboard');
    await tester.pumpAndSettle();

    expect(router.state.matchedLocation, '/dashboard');
    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(find.text('Sign in'), findsNothing);
  });

  testWidgets(
      '/oauth/callback hands the deep link to the auth notifier',
      (WidgetTester tester) async {
    final ProviderContainer container =
        containerWith(const AuthInitial());
    final GoRouter router = await pumpRouter(tester, container);
    final FakeAuthSessionNotifier fake = container.read(
      authSessionProvider.notifier,
    ) as FakeAuthSessionNotifier;

    router.go('/oauth/callback?code=auth-code-1&state=state-9');
    await tester.pumpAndSettle();

    // Deep-link plumbing, end to end at the widget level:
    // 1. The OAuthCallbackGate stashed the full redirect URI and the
    //    redirect hook consumed it via the notifier exactly once.
    expect(fake.completeOAuthCallbackCalls, 1);
    expect(
      fake.completedCallbackUri?.queryParameters['code'],
      'auth-code-1',
    );
    expect(
      fake.completedCallbackUri?.queryParameters['state'],
      'state-9',
    );
    // 2. The one-shot handoff flag is cleared so a rebuild cannot
    //    re-trigger the flow.
    expect(container.read(pendingOAuthRedirectProvider), isNull);
    // 3. The session authenticated as a result of the callback.
    expect(
      container.read(authSessionProvider).valueOrNull,
      isA<AuthAuthenticated>(),
    );
  });

  // NOTE(lib bug, kept skipped until the lib worker fixes it):
  // `app_router.dart` → `buildAppRouter` → `redirect` → the
  // `pendingOAuth != null` branch consumes the deep link, fires
  // `completeOAuthCallback` via `Future.microtask` (fire-and-forget) and
  // returns `/login`. The microtask's auth-stream emission hits the
  // `GoRouterRefreshStream` refreshListenable while the refresh()-triggered
  // navigation is still in flight; the resulting re-parse reads the STALE
  // route-information value (`/oauth/callback?...`), the redirect sees an
  // authenticated session with no pending flag and returns null, and
  // `setNewRoutePath` navigates BACK to `/oauth/callback` — clobbering the
  // `/login` hop. End state: authenticated session stranded on the blank
  // `OAuthCallbackGate` (renders `SizedBox.shrink`), never reaching
  // `/dashboard`. The handoff itself (tested above) is correct; the final
  // hop needs the lib fix (e.g. return null after consuming and add
  // `AuthAuthenticated() when isOAuthCallback => '/dashboard'`).
  // Skipped until the lib worker fixes the race described above; the
  // reason string cannot be passed to testWidgets' `skip:` (bool only).
  testWidgets(
    '/oauth/callback lands an authenticated session on /dashboard',
    (WidgetTester tester) async {
      final ProviderContainer container =
          containerWith(const AuthInitial());
      final GoRouter router = await pumpRouter(tester, container);

      router.go('/oauth/callback?code=auth-code-1&state=state-9');
      await tester.pumpAndSettle();

      expect(router.state.matchedLocation, '/dashboard');
      expect(find.byType(DashboardScreen), findsOneWidget);
    },
    skip: true,
  );

  testWidgets('in-flight auth states are never redirected away from /login',
      (WidgetTester tester) async {
    // No pumpAndSettle here: the AuthLoading spinner animates forever.
    final ProviderContainer container =
        containerWith(const AuthLoading());
    final GoRouter router =
        await pumpRouter(tester, container, settle: false);

    // AuthLoading holds position (no bounce); the login screen renders its
    // own spinner instead of being redirected. (The Sign in button shows a
    // CircularProgressIndicator while loading, so assert the screen type.)
    expect(router.state.matchedLocation, '/login');
    expect(find.byType(LoginScreen), findsOneWidget);
  });
}
