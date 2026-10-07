// ============================================================================
// quantmax_app - GoRouter route table with the auth gate (Shift 1)
// ============================================================================
//
// Routes:
//   /login           -> LoginScreen (W4: OAuth2+PKCE "Continue with QuantMail")
//   /                -> FeedScreen (Shift 2: vertical video feed UI shell;
//                       data W2 ke LocalSampleFeedRepository se — explicitly
//                       sample; real feed app-foundations/quantmax spec ke baad)
//   /oauth2redirect  -> OAuthCallbackGate: the OS hands the PKCE deep link
//                       (`com.quantrinity.quantmax:/oauth2redirect?code=…`)
//                       here; the full URI is stashed for the auth notifier.
//
// Auth gate: the redirect hook watches [authStateProvider] from
// `package:quantmax_core/quantmax_core.dart` (real contract — no shim).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quantmax_core/quantmax_core.dart';

import '../screens/feed_screen.dart';
import '../screens/login_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container.
///
/// The router lives exactly as long as the container: it listens to the auth
/// state via [refreshListenable], so building a fresh instance per widget
/// build would leak subscriptions. Widgets consume it through
/// `ref.watch(appRouterProvider)` (see [QuantMaxApp]); tests override this
/// provider instead of touching globals.
final appRouterProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'appRouterProvider',
);

/// Builds the app router with the auth gate wired in.
///
/// [ref] is the container-level ref from [appRouterProvider]. The redirect
/// closure captures it and only ever uses [Ref.read] — re-evaluation is
/// driven by [GoRouterRefreshStream] on the auth-state stream, never by
/// provider watches inside the redirect.
GoRouter buildAppRouter(Ref ref) {
  final refresh = GoRouterRefreshStream(ref.watch(authStateProvider.stream));
  // GoRouter removes its listener on dispose but does not dispose the
  // listenable itself; tie the subscription's lifetime to the provider.
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      // Deep-link handoff: the /oauth2redirect builder stashed the full
      // redirect URI into quantmax_core's [pendingOAuthRedirectProvider].
      // The auth notifier consumes it via its own listener (and clears the
      // flag); its state emissions re-trigger this redirect and land the
      // user (→ / on success, error surfaced on /login). Hold position here.
      final Uri? pendingOAuth = ref.read(pendingOAuthRedirectProvider);
      if (pendingOAuth != null) {
        return '/login';
      }

      final String location = state.matchedLocation;
      final bool isLogin = location == '/login';
      final bool isOAuthReturn = location == '/oauth2redirect';

      final AsyncValue<AuthSessionState> session = ref.read(authStateProvider);
      final bool signedIn = session.maybeWhen(
        data: (AuthSessionState authState) => authState is AuthAuthenticated,
        orElse: () => false,
      );

      // Signed in but parked on the login page: push into the app.
      if (signedIn && isLogin) {
        return '/';
      }
      // Signed out: everything except the login page and the OAuth return
      // route bounces back to /login. The return route is exempt so the
      // deep-link handoff above can run. While the stream is still loading
      // (or errored), hold position — bouncing to /login here would flash
      // the login page on cold start.
      if (!signedIn && !isLogin && !isOAuthReturn) {
        return '/login';
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (BuildContext context, GoRouterState state) =>
            const LoginScreen(),
      ),
      GoRoute(
        path: '/',
        name: 'feed',
        builder: (BuildContext context, GoRouterState state) =>
            const FeedScreen(),
      ),
      // OAuth2 PKCE return leg. The OS hands the deep link here
      // (`com.quantrinity.quantmax:/oauth2redirect?code=…&state=…`);
      // [OAuthCallbackGate] stashes the full URI for the redirect hook and
      // renders nothing.
      GoRoute(
        path: '/oauth2redirect',
        name: 'oauth2redirect',
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
/// The auth-state notifier emits on every [AuthSessionState] transition
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

/// Invisible landing for the OAuth2 deep-link return (`/oauth2redirect`).
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
      ref.read(pendingOAuthRedirectProvider.notifier).state = widget.uri;
      // The refreshListenable only fires on auth-state emissions and the
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
