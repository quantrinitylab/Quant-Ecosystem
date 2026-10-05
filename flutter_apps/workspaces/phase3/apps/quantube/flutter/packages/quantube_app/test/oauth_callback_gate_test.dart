// ============================================================================
// quantube_app - OAuthCallbackGate scheme-check tests (Fleet Alpha, W1)
// ============================================================================
//
// C-P2-2 (defense-in-depth, zero-defect): the gate only stashes URIs that
// arrived on the configured OAuth redirect scheme (`quantube`). In-app
// navigations (`router.go('/oauth/callback?...')`) carry an EMPTY scheme and
// are accepted; any other non-empty scheme is a foreign deep link whose
// `code`/`state` must never reach the auth notifier — the user is sent to
// /login instead (the auth gate bounces authenticated users on to /home
// from there).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:quantube_core/quantube_core.dart';
import 'package:quantube_app/src/router/app_router.dart';

class _SignedOutNotifier extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async => const AuthInitial();
}

/// Records `completeOAuthCallback` hand-offs so tests can prove whether the
/// stashed URI reached the auth notifier (or was correctly withheld).
class _RecordingNotifier extends AuthSessionNotifier {
  Uri? completedOAuthUri;

  @override
  Future<AuthSessionState> build() async => const AuthInitial();

  @override
  Future<void> completeOAuthCallback(Uri uri) async {
    completedOAuthUri = uri;
  }
}

typedef _Harness = ({ProviderContainer container, GoRouter router});

/// Builds the REAL app router against a faked session (same pattern as
/// QuantWave's `test/oauth_callback_gate_test.dart`), hosting it in the
/// widget tree.
Future<_Harness> _pumpRouter(
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
  return (container: container, router: router);
}

/// Hosts [OAuthCallbackGate] directly with [uri], bypassing route matching.
/// Needed for scheme-carrying URIs (`quantube://…`, `evil://…`): they parse
/// to path `/callback` (host `oauth`), which matches no route in this app's
/// table, so the gate would never build through `router.go`. The minimal
/// router carries a `/login` route so the foreign-scheme `go('/login')`
/// branch has somewhere to land.
Future<_Harness> _pumpGateDirectly(
  WidgetTester tester,
  Uri uri,
) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authSessionProvider.overrideWith(_SignedOutNotifier.new),
      // No appConfig override: the default config already resolves the
      // `QUANTUBE_OAUTH_REDIRECT_SCHEME` (default 'quantube') scheme used
      // in the assertions below. (AppConfig is intentionally not named here
      // — quantube_core's barrel does not re-export the config type; the
      // router consumes it through appConfigProvider only.)
    ],
  );
  addTearDown(container.dispose);
  final GoRouter router = GoRouter(
    initialLocation: '/',
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState state) =>
            OAuthCallbackGate(uri: uri),
      ),
      GoRoute(
        path: '/login',
        builder: (BuildContext context, GoRouterState state) =>
            const SizedBox.shrink(),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return (container: container, router: router);
}

String _path(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.path;

void main() {
  group('OAuthCallbackGate scheme check (C-P2-2)', () {
    testWidgets(
        'foreign-scheme deep link via the router lands on /login and '
        'nothing is stashed or handed off', (WidgetTester tester) async {
      final _RecordingNotifier auth = _RecordingNotifier();
      final (container: container, router: router) =
          await _pumpRouter(tester, () => auth);

      // `evil://oauth/callback` parses to path `/callback`, which matches no
      // route: the auth gate's redirect bounces the signed-out user to
      // /login. Nothing may reach the auth notifier.
      router.go('evil://oauth/callback?code=x&state=y');
      await tester.pumpAndSettle();

      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(auth.completedOAuthUri, isNull);
      expect(_path(router), '/login');
    });

    testWidgets('the gate itself bounces a foreign-scheme URI to /login',
        (WidgetTester tester) async {
      // Direct gate-level coverage of the new branch: with the gate built
      // (as a future `/callback` device route would), a non-empty,
      // non-configured scheme must NOT be stashed.
      final (container: container, router: router) = await _pumpGateDirectly(
        tester,
        Uri.parse('evil://oauth/callback?code=x&state=y'),
      );

      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(_path(router), '/login');
    });

    testWidgets(
        'empty-scheme in-app navigation is accepted: URI stashed and '
        'handed to the auth notifier', (WidgetTester tester) async {
      final _RecordingNotifier auth = _RecordingNotifier();
      final (container: container, router: router) =
          await _pumpRouter(tester, () => auth);

      router.go('/oauth/callback?code=x&state=y');
      await tester.pumpAndSettle();

      // The gate stashed the URI and the redirect hook handed it to the
      // auth notifier; the flag is consumed and the user lands on /login.
      expect(
        auth.completedOAuthUri?.toString(),
        '/oauth/callback?code=x&state=y',
      );
      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(_path(router), '/login');
    });

    testWidgets('matching-scheme deep link is accepted: URI stashed',
        (WidgetTester tester) async {
      final (container: container, router: router) = await _pumpGateDirectly(
        tester,
        Uri.parse('quantube://oauth/callback?code=x&state=y'),
      );

      // The configured scheme passes the check: the full deep-link URI is
      // stashed and the router is NOT bounced to /login.
      expect(
        container.read(pendingOAuthRedirectProvider)?.toString(),
        'quantube://oauth/callback?code=x&state=y',
      );
      expect(_path(router), '/');
    });
  });
}
