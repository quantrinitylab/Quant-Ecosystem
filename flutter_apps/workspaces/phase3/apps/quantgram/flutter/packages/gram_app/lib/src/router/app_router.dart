// ============================================================================
// gram_app - GoRouter route table with the Shift 1 auth gate
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// Routes: /splash (initial) -> /login -> /home, plus /oauth/callback for the
// PKCE deep-link return. Redirect hook auth gate hai; W3 ke gram_core
// providers read karta hai (W3-sync Shift 1 me coordinator ne verify kiya):
//
//   sealed class AuthSessionState {}
//   AuthInitial | AuthLoading | AuthConsentRequired(authorizeUrl) |
//   AuthAuthenticated | AuthFailure(message)   (sab positional ctors)
//   final authSessionProvider;            // AsyncNotifierProvider<AuthSessionNotifier, AuthSessionState>
//   final pendingOAuthRedirectProvider;   // StateProvider<Uri?>
//
// Redirect re-evaluation [GoRouterRefreshStream] par chalti hai — token-state
// stream (authStateProvider.stream) par, widget rebuilds par nahi. Phase1
// `quant_app/lib/src/router/app_router.dart` se copy-adapt (read-only
// reference; phase1 file NOT modified).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:gram_core/gram_core.dart';

import '../screens/home_screen.dart';
import '../screens/login_screen.dart';
import '../screens/post_detail_screen.dart';
import '../screens/splash_screen.dart';

/// Root navigator key for the app (dialogs, deep links, shell-free nav).
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// GoRouter instance scoped to the Riverpod container (wired via
/// [routerProvider]; see providers/app_providers.dart).
///
/// [ref] container-level ref hai. Redirect closure sirf [Ref.read] use
/// karta hai — re-evaluation [GoRouterRefreshStream] se driven hoti hai,
/// redirect ke andar provider watch kabhi nahi.
GoRouter buildAppRouter(Ref ref) {
  // W3-sync: refresh [GoRouterRefreshStream] se driven hai. Provider ka
  // `.stream` deprecated hai (Riverpod 3.x) — bridge [ref.listen] se hai:
  // har auth-state emission par controller me ping, widget rebuilds ke bina.
  final StreamController<void> refreshController =
      StreamController<void>.broadcast();
  final ProviderSubscription<AsyncValue<AuthState>> authStateSub =
      ref.listen<AsyncValue<AuthState>>(
    authStateProvider,
    (_, __) => refreshController.add(null),
  );
  final GoRouterRefreshStream refresh =
      GoRouterRefreshStream(refreshController.stream);
  ref.onDispose(() {
    authStateSub.close();
    refresh.dispose();
    refreshController.close();
  });

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (BuildContext context, GoRouterState state) {
      // W3-sync: poora auth gate W3 ke providers se wired (phase1-verified
      // pattern). `pendingOAuthRedirectProvider` ko AuthSessionNotifier
      // (build me ref.listen) khud consume karta hai — redirect ko sirf
      // session state dekhni hai.
      final String location = state.matchedLocation;
      final bool isSplash = location == '/splash';
      final bool isLogin = location == '/login';
      final bool isOAuthCallback = location == '/oauth/callback';

      final AsyncValue<AuthSessionState> session =
          ref.read(authSessionProvider);
      return session.when(
        data: (AuthSessionState authState) => switch (authState) {
          AuthAuthenticated() when isLogin || isSplash || isOAuthCallback =>
            '/home',
          AuthAuthenticated() => null,
          // In-flight states login screen ki apni UI ke hain (spinner /
          // consent card); yahan redirect karna screen se ladega.
          AuthLoading() => null,
          AuthConsentRequired() => null,
          // /oauth/callback par AuthInitial = handoff abhi frame me hai
          // (OAuthCallbackGate post-frame stash karega) — position hold karo,
          // warna callback URI kho jayegi.
          AuthInitial() when isOAuthCallback => null,
          AuthFailure() when isOAuthCallback => '/login',
          AuthInitial() || AuthFailure() when !isLogin && !isSplash =>
            '/login',
          AuthInitial() || AuthFailure() => null,
        },
        // Hydration chal rahi hai: position hold karo. /splash se /login
        // bounce karna cold start par flash karega.
        loading: () => null,
        error: (_, __) => null,
      );
    },
    routes: <RouteBase>[
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (BuildContext context, GoRouterState state) =>
            const SplashScreen(),
      ),
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
            const HomeScreen(),
      ),
      // Post detail (Shift 2 stub — comments/thread UI spec ke baad).
      // Auth gate: authenticated par position hold, unauthenticated par
      // /login redirect (upar redirect hook me covered).
      GoRoute(
        path: '/post/:id',
        name: 'postDetail',
        builder: (BuildContext context, GoRouterState state) =>
            PostDetailScreen(postId: state.pathParameters['id'] ?? ''),
      ),
      // OAuth2 PKCE return leg. OS deep link yahan aata hai
      // (`quantgram://oauth/callback?code=…&state=…`, ya App Links equivalent
      // jab scheme decision finalize ho); [OAuthCallbackGate] full URI stash
      // karke redirect hook ko handoff karta hai, khud kuch render nahi karta.
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
/// Token-state stream har token transition (login/logout/refresh) par emit
/// karta hai; har emission par GoRouter ka redirect dobara chalta hai —
/// widget rebuilds ke bina auth gate react karta hai.
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
/// Next frame par full redirect [uri] (query me `code`/`state`, ya denial par
/// `error`) [pendingOAuthRedirectProvider] me stash hoti hai aur router ko
/// redirect re-run ke liye kaha jata hai. [AuthSessionNotifier] (gram_core)
/// us provider ko apne `build()` me `ref.listen` se consume karke
/// `completeOAuthCallback` chalata hai — gate khud kuch render nahi karta.
///
/// One-shot guard: frame callback chalne se pehle double build ho to double
/// handoff nahi hoga.
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
      // C-P2-2 (defense-in-depth, zero-defect): sirf configured OAuth
      // redirect scheme par aayi URIs stash hoti hain. In-app navigation
      // (`router.go('/oauth/callback?...')`, widget tests) EMPTY scheme
      // ke saath aata hai — accepted. Koi bhi doosra non-empty scheme
      // foreign deep link hai jise OS kabhi yahan route nahi karna chahiye —
      // uska `code`/`state` auth notifier tak kabhi nahi pahunchna chahiye.
      final expectedScheme = ref.read(appConfigProvider).oauthRedirectScheme;
      final actualScheme = widget.uri.scheme;
      if (actualScheme.isNotEmpty && actualScheme != expectedScheme) {
        // /login par bhejo; auth gate authenticated users ko wahan se
        // /home bhej dega, to koi atak nahi jata.
        GoRouter.of(context).go('/login');
        return;
      }
      // W3-sync: notifier (gram_core) pendingOAuthRedirectProvider ko khud
      // consume karta hai.
      ref.read(pendingOAuthRedirectProvider.notifier).state = widget.uri;
      GoRouter.of(context).refresh();
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// Fallback for unknown / malformed locations.
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
