// ============================================================================
// gram_app - go_router providers: router + browser launcher
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// TODO(W3-sync): yahan assume kiya gaya tha ki `package:gram_core/gram_core.dart`
// ye exports dega. W3-sync (Shift 1, coordinator reconcile): actual W3 API —
//   - `authSessionProvider`       : AsyncNotifierProvider<AuthSessionNotifier, AuthSessionState>
//   - `AuthSessionState` (sealed) : AuthInitial | AuthLoading |
//                                   AuthConsentRequired(authorizeUrl) |
//                                   AuthAuthenticated | AuthFailure(message)
//                                   (sab positional ctors — QA F1 lesson)
//   - `pendingOAuthRedirectProvider` : StateProvider<Uri?>
//   - `appConfigProvider`         : Provider<AppConfig> (field
//                                   `oauthRedirectScheme` maujud hai)
// Neeche sab W3 ke final names se wired hai.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:gram_core/gram_core.dart';

import '../auth/browser_launcher.dart';
import '../router/app_router.dart';

/// GoRouter instance, Riverpod container ke scope me.
///
/// W1 ka `GramApp` (src/app.dart — W1 ki ownership) is provider ko watch
/// karke `MaterialApp.router(routerConfig: ...)` me deta hai. Router container
/// jitna jeeta hai: [refreshListenable] auth-state stream par hai, isliye
/// widget build par naya instance banana subscription leak karega.
final routerProvider = Provider<GoRouter>(
  buildAppRouter,
  name: 'routerProvider',
);

/// [BrowserAuthLauncher] ka provider.
///
/// Scheme `AppConfig` se configurable hai (custom-scheme vs App Links
/// decision pending — browser_launcher.dart me TODO(UNVERIFIED) dekho).
/// W3-sync (Shift 1): `appConfigProvider` W3 ke gram_core me publish ho gaya.
final browserLauncherProvider = Provider<BrowserAuthLauncher>(
  (ref) => BrowserAuthLauncher(
    oauthRedirectScheme: ref.watch(appConfigProvider).oauthRedirectScheme,
  ),
  name: 'browserLauncherProvider',
);
