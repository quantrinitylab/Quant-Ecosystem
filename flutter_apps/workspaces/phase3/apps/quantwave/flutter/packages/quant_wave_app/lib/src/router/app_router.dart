// ============================================================================
// quant_wave_app - GoRouter route table with the auth gate (Phase 3, shift 1)
// ============================================================================
//
// Routes: /login -> /timeline (tab shell; tab bodies are placeholders
// until the QuantWave API spec exists), plus /oauth/callback for the PKCE
// deep-link return. The redirect hook is the auth gate; it reads the auth
// session providers from quant_wave_core
// (package:quant_wave_core/quant_wave_core.dart):
//
//   sealed class AuthSessionState {}
//   AuthInitial | AuthLoading | AuthTwoFactorRequired(challenge) |
//   AuthConsentRequired(authorizeUrl) | AuthAuthenticated | AuthFailure(message)
//   final authSessionProvider;        // AsyncNotifierProvider
//   final pendingOAuthRedirectProvider; // StateProvider<Uri?>
//
// Redirect re-evaluation is driven by [GoRouterRefreshStream] on the
// auth-session notifier's stream, not by widget rebuilds.
//
// The timeline route is the post-login tab shell (see
// screens/timeline_screen.dart) — real timeline/thread/compose UI lands in
// later shifts, once the QuantWave API spec exists under
// app-foundations/quantwave/.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_wave_core/quant_wave_core.dart';

import '../screens/login_screen.dart';
import '../screens/timeline_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container.
///
/// The router lives exactly as long as the container: it listens to the auth
/// session via [refreshListenable], so building a fresh instance per widget
/// build would leak subscriptions. Widgets consume it through
/// `ref.watch(appRouterProvider)` (see `src/app.dart`); tests override this
/// provider instead of touching globals.
final appRouterProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'appRouterProvider',
);

/// Builds the app router with the auth gate wired in.
///
/// [ref] is the container-level ref from [appRouterProvider]. The redirect
/// closure captures it and only ever uses [Ref.read] — re-evaluation is
/// driven by [GoRouterRefreshStream] on auth-session state transitions,
/// never by provider watches inside the redirect.
GoRouter buildAppRouter(Ref ref) {
  final refresh = GoRouterRefreshStream();
  // Bridge auth-session transitions into the router: `ref.listen` does not
  // fire for the initial value, so the first redirect evaluation still
  // happens synchronously at GoRouter construction.
  final subscription = ref.listen<AsyncValue<AuthSessionState>>(
    authSessionProvider,
    (_, __) => refresh.emit(),
  );
  // GoRouter removes its listener on dispose but does not dispose the
  // listenable itself; tie the subscription's lifetime to the provider.
  ref.onDispose(() {
    subscription.close();
    refresh.dispose();
  });

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      // Deep-link handoff: the /oauth/callback builder stashed the full
      // redirect URI here. Hand it to the auth notifier fire-and-forget and
      // clear the flag; the notifier's state change re-triggers this redirect
      // and lands the user (→ /timeline on success, error surfaced on /login).
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
      final bool isOAuthCallback = location == '/oauth/callback';

      final AsyncValue<AuthSessionState> session =
          ref.read(authSessionProvider);
      return session.when(
        data: (AuthSessionState authState) => switch (authState) {
          // Signed in but parked on the login page: push into the app.
          AuthAuthenticated() when isLogin => '/timeline',
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
      // Post-login tab shell (Timeline / Notifications / Messages /
      // Profile). Tab bodies are placeholders (TODO(UNVERIFIED) in
      // screens/tabs/app_tabs.dart) until the QuantWave API spec exists.
      GoRoute(
        path: '/timeline',
        name: 'timeline',
        builder: (BuildContext context, GoRouterState state) =>
            const TimelineScreen(),
      ),
      // OAuth2 PKCE return leg. The OS hands the deep link here
      // (`quantwave://oauth/callback?code=…&state=…`, or the universal-link
      // equivalent); [OAuthCallbackGate] stashes the full URI for the
      // redirect hook and renders nothing.
      GoRoute(
        path: '/oauth/callback',
        name: 'oauthCallback',
        builder: (BuildContext context, GoRouterState state) =>
            OAuthCallbackGate(uri: state.uri),
      ),
    ],
    errorBuilder: (BuildContext context, GoRouterState state) =>
        RouterErrorScreen(uri: state.uri),
  );
}

/// Bridges auth-session state transitions into go_router's
/// [ChangeNotifier]-based `refreshListenable` contract.
///
/// Each call to [emit] (one per [AuthSessionState] transition, wired in
/// [buildAppRouter] via `ref.listen`) re-runs [GoRouter]'s redirect so the
/// auth gate reacts without widget rebuilds. Owned by [appRouterProvider],
/// which closes the subscription and disposes this on provider teardown.
class GoRouterRefreshStream extends ChangeNotifier {
  /// Creates the bridge; [emit] must be invoked on each auth state change.
  GoRouterRefreshStream();

  /// Notifies go_router listeners that a redirect re-evaluation is due.
  void emit() => notifyListeners();
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
        // users on to /timeline from there, so nobody is stranded.
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
