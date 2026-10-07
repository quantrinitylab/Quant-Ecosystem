// ============================================================================
// quant_app - GoRouter route table with the M2 auth gate (Phase 1 slice)
// ============================================================================
//
// Routes: /login -> /inbox -> /thread/:threadId, plus /oauth/callback for the
// PKCE deep-link return. The redirect hook is the M2 auth gate; it reads the
// W2 auth-session providers from quant_core
// (package:quant_core/quant_core.dart):
//
//   sealed class AuthSessionState {}
//   AuthInitial | AuthLoading | AuthTwoFactorRequired(challenge) |
//   AuthConsentRequired(authorizeUrl) | AuthAuthenticated | AuthFailure(message)
//   final authSessionProvider;        // AsyncNotifierProvider
//   final pendingOAuthRedirectProvider; // StateProvider<Uri?>
//
// Redirect re-evaluation is driven by [GoRouterRefreshStream] on the
// auth-session notifier's stream, not by widget rebuilds.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_core/quant_core.dart';

import '../screens/compose_screen.dart';
import '../screens/inbox_screen.dart';
import '../screens/login_screen.dart';
import '../screens/search_screen.dart';
import '../screens/thread_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container.
///
/// The router lives exactly as long as the container: it listens to the auth
/// session via [refreshListenable], so building a fresh instance per widget
/// build would leak subscriptions. Widgets consume it through
/// `ref.watch(appRouterProvider)` (see [QuantMailApp]); tests override this
/// provider instead of touching globals.
final appRouterProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'appRouterProvider',
);

/// Builds the app router with the M2 auth gate wired in.
///
/// [ref] is the container-level ref from [appRouterProvider]. The redirect
/// closure captures it and only ever uses [Ref.read] — re-evaluation is
/// driven by [GoRouterRefreshStream] on auth-session transitions bridged
/// from the provider via [Ref.listen] (Riverpod 2.x notifier providers
/// expose no `.stream`), never by provider watches inside the redirect.
GoRouter buildAppRouter(Ref ref) {
  // Bridge: provider transitions -> broadcast stream. `fireImmediately` is
  // false so only real transitions refresh the router.
  final authTransitions = StreamController<AsyncValue<AuthSessionState>>.broadcast();
  ref.onDispose(authTransitions.close);
  ref.listen<AsyncValue<AuthSessionState>>(
    authSessionProvider,
    (previous, next) => authTransitions.add(next),
  );
  final refresh = GoRouterRefreshStream(authTransitions.stream);
  // GoRouter removes its listener on dispose but does not dispose the
  // listenable itself; tie the subscription's lifetime to the provider.
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      // Deep-link handoff: the /oauth/callback builder stashed the full
      // redirect URI here. Hand it to the auth notifier fire-and-forget and
      // clear the flag; the notifier's state change re-triggers this redirect
      // and lands the user (→ /inbox on success, error surfaced on /login).
      final Uri? pendingOAuth = ref.read(pendingOAuthRedirectProvider);
      if (pendingOAuth != null) {
        Future.microtask(() {
          unawaited(
            ref
                .read(authSessionProvider.notifier)
                .completeOAuthCallback(pendingOAuth),
          );
        });
        ref.read(pendingOAuthRedirectProvider.notifier).state = null;
        return '/login';
      }

      final String location = state.matchedLocation;
      final bool isLogin = location == '/login';
      // The OAuth return route is exempt so the deep-link handoff below can
      // run. TWO paths serve the gate:
      // - `/oauth/callback` — in-app navigations and widget tests (path-only
      //   URIs; `state.uri.scheme` is empty there).
      // - `/callback` — the REAL device deep link. `quantmail://oauth/callback`
      //   parses to host=`oauth`, path=`/callback` (verified against
      //   go_router 14.8.1: route matching is path-only), so without this
      //   route the browser redirect after consent would land on the
      //   "Page not found" error screen and the M2 SSO flow could never
      //   complete on device (standing U3 blocker — root cause found
      //   2026-10-04 while implementing the C-P2-2 scheme check).
      final bool isOAuthCallback =
          location == '/oauth/callback' || location == '/callback';

      final AsyncValue<AuthSessionState> session =
          ref.read(authSessionProvider);
      return session.when(
        data: (AuthSessionState authState) => switch (authState) {
          // Signed in but parked on the login page: push into the app.
          AuthAuthenticated() when isLogin => '/inbox',
          AuthAuthenticated() => null,
          // In-flight states are owned by the login screen's own UI
          // (spinner, 2FA prompt, consent browser); never redirect them —
          // a redirect here would fight the screen's step handling.
          AuthLoading() => null,
          AuthTwoFactorRequired() => null,
          AuthConsentRequired() => null,
          // Signed out (or failed): everything except the login page and
          // the OAuth return route bounces back to /login. The callback
          // route is exempt so the deep-link handoff above can run.
          AuthInitial() || AuthFailure()
              when !isLogin && !isOAuthCallback =>
            '/login',
          AuthInitial() || AuthFailure() => null,
        },
        // Hydration still running (or the stream errored): hold position.
        // Bouncing to /login here would flash the login page on cold start.
        loading: () => null,
        error: (_, __) => null,
      );
    },
    routes: <RouteBase>[
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (BuildContext context, GoRouterState state) =>
            const LoginScreen(),
      ),
      GoRoute(
        path: '/inbox',
        name: 'inbox',
        builder: (BuildContext context, GoRouterState state) =>
            const InboxScreen(),
      ),
      GoRoute(
        path: '/thread/:threadId',
        name: 'thread',
        builder: (BuildContext context, GoRouterState state) {
          final String threadId = state.pathParameters['threadId'] ?? '';
          return ThreadScreen(threadId: threadId);
        },
      ),
      // Compose: new message or reply. Query parameters carry the reply
      // prefill (set by the thread screen's Reply action):
      //   ?threadId=<id>&inReplyTo=<messageId>&to=a@b.com,c@d.com&subject=Re: …
      // The auth gate above already covers /compose (unauthenticated
      // bounces to /login), so no extra guard here.
      GoRoute(
        path: '/compose',
        name: 'compose',
        builder: (BuildContext context, GoRouterState state) {
          final Map<String, String> query = state.uri.queryParameters;
          final String? threadId = query['threadId'];
          final String? inReplyTo = query['inReplyTo'];
          final List<EmailAddress> to = (query['to'] ?? '')
              .split(',')
              .map((String part) => part.trim())
              .where((String part) => part.isNotEmpty)
              .map((String part) => EmailAddress(email: part))
              .toList(growable: false);
          return ComposeScreen(
            threadId: threadId,
            inReplyTo: inReplyTo,
            initialTo: to,
            initialSubject: query['subject'] ?? '',
          );
        },
      ),
      // Search: full-text mail search with Gmail-style operators, quick
      // filter chips and recent searches. The auth gate above already
      // covers /search (unauthenticated bounces to /login), so no extra
      // guard here.
      GoRoute(
        path: '/search',
        name: 'search',
        builder: (BuildContext context, GoRouterState state) =>
            const SearchScreen(),
      ),
      // OAuth2 PKCE return leg. The OS hands the deep link here
      // (`quantmail://oauth/callback?code=…&state=…`, or the universal-link
      // equivalent); [OAuthCallbackGate] stashes the full URI for the
      // redirect hook and renders nothing.
      //
      // NOTE (2026-10-04): the deep link's URI parses to path `/callback`
      // (host `oauth`), NOT `/oauth/callback` — go_router matches on
      // `uri.path` only. The `/callback` route below is what the real
      // device redirect hits; `/oauth/callback` stays for in-app
      // navigations and tests.
      GoRoute(
        path: '/oauth/callback',
        name: 'oauthCallback',
        builder: (BuildContext context, GoRouterState state) =>
            OAuthCallbackGate(uri: state.uri),
      ),
      GoRoute(
        // Device deep-link landing: `quantmail://oauth/callback?...`
        // (Android intent-filter: scheme=quantmail, host=oauth).
        path: '/callback',
        name: 'oauthDeepLinkCallback',
        builder: (BuildContext context, GoRouterState state) =>
            OAuthCallbackGate(uri: state.uri),
      ),
    ],
    errorBuilder: (BuildContext context, GoRouterState state) =>
        RouterErrorScreen(uri: state.uri),
  );
}

/// Bridges a stream into go_router's [ChangeNotifier]-based
/// `refreshListenable` contract.
///
/// The auth-session notifier emits on every [AuthSessionState] transition
/// (initial → loading → authenticated / failure / …); each emission calls
/// [GoRouter]'s redirect again so the auth gate reacts without widget
/// rebuilds. Owned by [appRouterProvider], which disposes it.
class GoRouterRefreshStream extends ChangeNotifier {
  /// Subscribes to [stream] and notifies listeners on every event.
  GoRouterRefreshStream(Stream<dynamic> stream) {
    _subscription = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

/// Invisible landing for the OAuth2 deep-link return (`/oauth/callback`).
///
/// On the next frame the full redirect [uri] (query carries `code`/`state`,
/// or `error` on denial) is stashed into [pendingOAuthRedirectProvider] and
/// the router is asked to re-run its redirect, which consumes the URI via
/// the auth notifier's `completeOAuthCallback`. Renders nothing.
///
/// The one-shot guard prevents a double handoff if the widget ever builds
/// twice before the frame callback runs.
class OAuthCallbackGate extends ConsumerStatefulWidget {
  const OAuthCallbackGate({super.key, required this.uri});

  final Uri uri;

  @override
  ConsumerState<OAuthCallbackGate> createState() => _OAuthCallbackGateState();
}

class _OAuthCallbackGateState extends ConsumerState<OAuthCallbackGate> {
  bool _handedOff = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _handedOff) return;
      _handedOff = true;
      // C-P2-2 (defense-in-depth, zero-defect): only stash URIs that
      // arrived on the configured OAuth redirect scheme. In-app
      // navigations (`router.go('/oauth/callback?...')`, widget tests)
      // carry an EMPTY scheme and are accepted; any other non-empty
      // scheme is a foreign deep link the OS should never have routed
      // here — its `code`/`state` must not reach the auth notifier.
      // (Mitigations already in place: the OS only routes the claimed
      // scheme, `completeOAuthCallback` verifies `state` against the
      // pending authorize request.)
      final expectedScheme = ref.read(appConfigProvider).oauthRedirectScheme;
      final actualScheme = widget.uri.scheme;
      if (actualScheme.isNotEmpty && actualScheme != expectedScheme) {
        // Send the user to /login; the auth gate bounces authenticated
        // users on to /inbox from there, so nobody is stranded.
        GoRouter.of(context).go('/login');
        return;
      }
      ref.read(pendingOAuthRedirectProvider.notifier).state = widget.uri;
      // The refreshListenable only fires on auth-session emissions and the
      // pending flag itself is not watched, so trigger re-evaluation here.
      GoRouter.of(context).refresh();
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// Fallback shown for unknown / malformed locations.
class RouterErrorScreen extends StatelessWidget {
  const RouterErrorScreen({super.key, required this.uri});

  final Uri uri;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(
                Icons.error_outline,
                size: 48,
                color: scheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                'Page not found',
                style: textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                uri.toString(),
                style: textTheme.bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
