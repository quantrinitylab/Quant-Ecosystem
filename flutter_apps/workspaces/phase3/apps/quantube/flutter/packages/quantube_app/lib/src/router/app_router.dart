// ============================================================================
// quantube_app - GoRouter route table with the auth gate
// ============================================================================
//
// Routes: /login -> /home (real feed UI shell; data wiring awaits the
// QuanTube API spec) -> /watch/:videoId (player, W3's file).
// Plus /oauth/callback for the PKCE deep-link return.
//
// The redirect hook is the auth gate; it reads the SSO session providers
// from `quant_core` (package:quant_core/quant_core.dart) — QuanTube uses
// QuantMail SSO, so the same session is reused across apps:
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
// TODO(UNVERIFIED): /home renders the real feed UI shell ([HomeFeedScreen]),
// but the data wiring behind it ([FeedRepository] is still abstract) waits on
// the QuanTube API spec (app-foundations/quantube/openapi.yaml). The auth
// gate here does NOT change, only the provider wiring does.
// TODO(UNVERIFIED): the `quantube://oauth/callback` custom-scheme return leg
// has not been proven on a real device; see browser_launcher.dart.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quantube_core/quantube_core.dart';

import '../screens/feed/home_feed_screen.dart';
import '../screens/login_screen.dart';
// TODO(W3): player_screen.dart is W3's scope (player vertical). It must
// define EXACTLY:
//   class PlayerScreen extends ConsumerWidget {
//     const PlayerScreen({super.key, required this.videoId});
//     final String videoId;
//     ...
//   }
// in packages/quantube_app/lib/src/screens/player_screen.dart.
// The /watch/:videoId route below references it; until W3 lands the file,
// `flutter analyze`/`flutter test` will fail on this import.
import '../screens/player_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container.
///
/// The router lives exactly as long as the container: it listens to the auth
/// session via [refreshListenable], so building a fresh instance per widget
/// build would leak subscriptions. Widgets consume it through
/// `ref.watch(appRouterProvider)` (see [QuantubeApp]); tests override this
/// provider instead of touching globals.
final appRouterProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'appRouterProvider',
);

/// Builds the app router with the SSO auth gate wired in.
///
/// [ref] is the container-level ref from [appRouterProvider]. The redirect
/// closure captures it and only ever uses [Ref.read] — re-evaluation is
/// driven by [GoRouterRefreshStream] on the auth-session notifier stream,
/// never by provider watches inside the redirect.
GoRouter buildAppRouter(Ref ref) {
  // Bridge: provider transitions -> broadcast stream. `fireImmediately` is
  // false so only real transitions refresh the router. (Riverpod 2.x
  // notifier providers expose no `.stream` — same listen-bridge as the
  // phase1 quant_app router.)
  final authTransitions =
      StreamController<AsyncValue<AuthSessionState>>.broadcast();
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
      // and lands the user (→ /home on success, error surfaced on /login).
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
          AuthAuthenticated() when isLogin => '/home',
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
        path: '/home',
        name: 'home',
        builder: (BuildContext context, GoRouterState state) =>
            const HomeFeedScreen(),
      ),
      // Player route. [PlayerScreen] is W3's file (see import TODO above);
      // the video id comes from the path parameter.
      GoRoute(
        path: '/watch/:videoId',
        name: 'watch',
        builder: (BuildContext context, GoRouterState state) => PlayerScreen(
          videoId: state.pathParameters['videoId'] ?? '',
        ),
      ),
      // OAuth2 PKCE return leg. The OS hands the deep link here
      // (`quantube://oauth/callback?code=…&state=…`, or the universal-link
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
      final expectedScheme = ref.read(appConfigProvider).oauthRedirectScheme;
      final actualScheme = widget.uri.scheme;
      if (actualScheme.isNotEmpty && actualScheme != expectedScheme) {
        // Send the user to /login; the auth gate bounces authenticated
        // users on to /home from there, so nobody is stranded.
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
