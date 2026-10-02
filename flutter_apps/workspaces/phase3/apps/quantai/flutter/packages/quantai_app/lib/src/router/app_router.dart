// ============================================================================
// quantai_app - GoRouter route table with the auth gate (Shift 1)
// ============================================================================
//
// Pattern adapted from quant_app's router (Phase 1, M2).
//
// Routes: /login -> /home, plus /oauth/callback for the PKCE deep-link
// return. The redirect hook is the auth gate; it reads the W1 auth-session
// providers from quantai_core (package:quantai_core/quantai_core.dart):
//
//   sealed class AuthSessionState {}  (positional constructors only)
//   AuthInitial | AuthLoading | AuthTwoFactorRequired(challenge) |
//   AuthConsentRequired(authorizeUrl) | AuthAuthenticated | AuthFailure(message)
//   final authSessionProvider;             // AsyncNotifierProvider
//   final pendingOAuthRedirectProvider;    // StateProvider<Uri?>
//   final isSessionAuthenticatedProvider;  // derived bool
//
// Redirect re-evaluation is driven by [GoRouterRefreshStream] on the
// auth-session notifier's stream, not by widget rebuilds.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quantai_core/quantai_core.dart';

import '../screens/chat_screen.dart';
import '../screens/conversations_screen.dart';
import '../screens/login_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container.
///
/// The router lives exactly as long as the container: it listens to the auth
/// session via [refreshListenable], so building a fresh instance per widget
/// build would leak subscriptions. Widgets consume it through
/// `ref.watch(appRouterProvider)` (see [QuantAiApp]); tests override this
/// provider instead of touching globals.
final appRouterProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'appRouterProvider',
);

/// Builds the app router with the auth gate wired in.
///
/// [ref] is the container-level ref from [appRouterProvider]. The redirect
/// closure captures it and only ever uses [Ref.read] — re-evaluation is
/// driven by [GoRouterRefreshStream] on the auth-session notifier stream,
/// never by provider watches inside the redirect.
GoRouter buildAppRouter(Ref ref) {
  final refresh = GoRouterRefreshStream(
    ref.watch(authSessionProvider.notifier).stream,
  );
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
        data: (AuthSessionState authState) {
          final bool signedIn = ref.read(isSessionAuthenticatedProvider);
          if (signedIn) {
            // Signed in but parked on the login page: push into the app.
            return isLogin ? '/home' : null;
          }
          return switch (authState) {
            // In-flight states are owned by the login screen's own UI
            // (spinner, 2FA prompt, consent browser); never redirect them —
            // a redirect here would fight the screen's step handling.
            AuthLoading() => null,
            AuthTwoFactorRequired() => null,
            AuthConsentRequired() => null,
            AuthAuthenticated() => null, // Unreachable while !signedIn.
            // Signed out (or failed): everything except the login page and
            // the OAuth return route bounces back to /login. The callback
            // route is exempt so the deep-link handoff above can run.
            AuthInitial() || AuthFailure()
                when !isLogin && !isOAuthCallback =>
              '/login',
            AuthInitial() || AuthFailure() => null,
          };
        },
        // Hydration still running (or the stream errored): hold position.
        // Bouncing to /login here would flash the login page on cold start.
        loading: () => null,
        error: (_, _) => null,
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
            const ConversationsScreen(),
      ),
      GoRoute(
        path: '/chat/:sessionId',
        name: 'chat',
        builder: (BuildContext context, GoRouterState state) => ChatScreen(
          sessionId: state.pathParameters['sessionId']!,
        ),
      ),
      // OAuth2 PKCE return leg. The OS hands the deep link here
      // (`quantai://oauth/callback?code=…&state=…`, or the universal-link
      // equivalent); [OAuthCallbackGate] stashes the full URI for the
      // redirect hook and renders nothing.
      //
      // TODO(UNVERIFIED): `quantai://oauth/callback` delivery has not been
      // proven on a real device (Android intent-filter, iOS
      // CFBundleURLTypes). Verify the end-to-end round-trip on hardware
      // before release.
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
