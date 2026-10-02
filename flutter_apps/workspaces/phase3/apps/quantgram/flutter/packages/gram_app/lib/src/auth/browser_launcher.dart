// ============================================================================
// gram_app - system-browser launcher for the OAuth2 authorization step
// (QuantGram Shift 1, W4: router + screens)
// ============================================================================
//
// Copy-adapt of phase1 `quant_app/lib/src/auth/browser_launcher.dart`
// (read-only reference; phase1 file NOT modified).
//
// W3-sync (Shift 1, coordinator reconcile): [BrowserAuthLauncher] yahan
// self-contained hai (koi gram_core dependency nahi). Authorize URL W3 ke
// gram_core `AuthRepository` se aati hai: login_screen
// `authSessionProvider.notifier.beginSsoLogin()` call karti hai, PKCE
// verifier + state repository ke paas rehte hain, aur
// `AuthConsentRequired(authorizeUrl)` state par screen ye launcher use karke
// URL kholti hai.
//
// TODO(UNVERIFIED): custom-scheme delivery of `quantgram://oauth/callback`
// abhi kisi real device par prove NAHI hui hai. OS plumbing (Android
// intent-filter, iOS CFBundleURLTypes) scheme register karegi taaki system
// browser redirect wapas app ko de sake, lekin end-to-end round-trip
// hardware par verify hona baaki hai. Board par security P2 note hai:
// custom-scheme vs App Links/Universal Links decision pending hai — isliye
// scheme hardcode NAHI hai; [AppConfig.oauthRedirectScheme] se configurable
// hai (default `quantgram`, `--dart-define=QUANTGRAM_OAUTH_REDIRECT_SCHEME`
// se override).

import 'package:url_launcher/url_launcher.dart';

/// Opens OAuth2 authorization URLs in the system browser.
///
/// Job sirf OS-level handoff hai: [launchAuthorizeUrl] se khula URL backend
/// ka consent/authorize page dikhata hai, aur wapas aane wala
/// `<scheme>://oauth/callback?code=…&state=…` deep link `/oauth/callback`
/// go_router route (router/app_router.dart) pakadta hai.
class BrowserAuthLauncher {
  /// Creates the launcher.
  ///
  /// [oauthRedirectScheme] sirf documentation/diagnostics ke liye rakha gaya
  /// hai (deep-link registration se match hona chahiye); launch call par iska
  /// istemal nahi hota.
  const BrowserAuthLauncher({this.oauthRedirectScheme = 'quantgram'});

  /// Custom URL scheme jo app OAuth2 redirect ke liye claim karti hai.
  ///
  /// Configurable rakha gaya hai kyunki custom-scheme vs App Links decision
  /// abhi pending hai (TODO(UNVERIFIED) upar dekho).
  final String oauthRedirectScheme;

  /// [url] ko system browser me kholta hai.
  ///
  /// `true` jab browser launch ho gaya; `false` jab launch fail hua
  /// (koi browser nahi, ya platform ne URL reject kar di).
  Future<bool> launchAuthorizeUrl(Uri url) async {
    return launchUrl(url, mode: LaunchMode.externalApplication);
  }
}
