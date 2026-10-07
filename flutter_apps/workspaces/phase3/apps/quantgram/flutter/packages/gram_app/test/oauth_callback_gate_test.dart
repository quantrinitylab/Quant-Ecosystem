// ============================================================================
// gram_app - OAuthCallbackGate scheme-check tests (Fleet Alpha, W1)
// ============================================================================
//
// C-P2-2 (defense-in-depth, zero-defect): the gate only stashes URIs that
// arrived on the configured OAuth redirect scheme (`quantgram`). In-app
// navigations (`router.go('/oauth/callback?...')`) carry an EMPTY scheme and
// are accepted; any other non-empty scheme is a foreign deep link whose
// `code`/`state` must never reach the auth notifier — the user is sent to
// /login instead (the auth gate bounces authenticated users on to /home
// from there).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:gram_core/gram_core.dart';
import 'package:gram_app/src/providers/app_providers.dart';
import 'package:gram_app/src/router/app_router.dart';

class _SignedOutNotifier extends AuthSessionNotifier {
  @override
  Future<AuthSessionState> build() async => const AuthInitial();
}

/// Records `completeOAuthCallback` hand-offs so tests can prove whether the
/// stashed URI reached the auth notifier (or was correctly withheld).
///
/// Mirrors the real notifier's `pendingOAuthRedirectProvider` self-consume
/// listen (gram_core W3-sync pattern): the stash is reset and handed to
/// `completeOAuthCallback` — here recorded instead of wired to the SSO
/// repository.
class _RecordingNotifier extends AuthSessionNotifier {
  Uri? completedOAuthUri;

  @override
  Future<AuthSessionState> build() async {
    ref.listen<Uri?>(pendingOAuthRedirectProvider, (previous, next) {
      final uri = next;
      if (uri == null) return;
      ref.read(pendingOAuthRedirectProvider.notifier).state = null;
      unawaited(completeOAuthCallback(uri));
    });
    return const AuthInitial();
  }

  @override
  Future<void> completeOAuthCallback(Uri uri) async {
    completedOAuthUri = uri;
  }
}

typedef _Harness = ({ProviderContainer container, GoRouter router});

/// Builds the REAL app router (via [routerProvider]) against a faked
/// session, hosting it in the widget tree.
///
/// NOTE: `/splash` hosts an endlessly-spinning [CircularProgressIndicator],
/// so `pumpAndSettle` never returns here — bounded pumps only.
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
  final GoRouter router = container.read(routerProvider);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 200));
  return (container: container, router: router);
}

/// Bounded settle for the two router-level tests: runs a frame (post-frame
/// callbacks + redirect re-evaluation) without waiting for the splash
/// spinner to stop.
Future<void> _settleRouter(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
}

/// Hosts [OAuthCallbackGate] directly with [uri], bypassing route matching.
/// Needed for scheme-carrying URIs (`quantgram://…`, `evil://…`): they parse
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
      appConfigProvider.overrideWithValue(
        const AppConfig(oauthRedirectScheme: 'quantgram'),
      ),
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
      await _settleRouter(tester);

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
      await _settleRouter(tester);

      // The gate stashed the URI and the notifier's self-consume listen
      // handed it to `completeOAuthCallback`; the flag is reset and the
      // user holds on /oauth/callback until the session transitions.
      expect(
        auth.completedOAuthUri?.toString(),
        '/oauth/callback?code=x&state=y',
      );
      expect(container.read(pendingOAuthRedirectProvider), isNull);
      expect(_path(router), '/oauth/callback');
    });

    testWidgets('matching-scheme deep link is accepted: URI stashed',
        (WidgetTester tester) async {
      final (container: container, router: router) = await _pumpGateDirectly(
        tester,
        Uri.parse('quantgram://oauth/callback?code=x&state=y'),
      );

      // The configured scheme passes the check: the full deep-link URI is
      // stashed and the router is NOT bounced to /login.
      expect(
        container.read(pendingOAuthRedirectProvider)?.toString(),
        'quantgram://oauth/callback?code=x&state=y',
      );
      expect(_path(router), '/');
    });
  });
}
