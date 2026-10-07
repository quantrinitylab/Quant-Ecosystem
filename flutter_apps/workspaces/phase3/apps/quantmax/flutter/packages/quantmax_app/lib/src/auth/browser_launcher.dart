// ============================================================================
// quantmax_app - system-browser launcher for OAuth2+PKCE (Phase 3b, Shift 1)
// ============================================================================
//
// Copy-adapted from phase1 quant_app's `src/auth/browser_launcher.dart`
// (read-only pattern — not edited).
//
// Opens the OAuth2 authorization URL in the system browser; the OS then
// hands the redirect back to the app via the registered deep-link scheme
// (`com.quantrinity.quantmax:/oauth2redirect`), which W6's go_router table
// will capture and forward to `QuantMaxAuthSessionNotifier.completeOAuthCallback`.
//
// TODO(UNVERIFIED): custom-scheme delivery has NOT yet been proven on a
// real device. The OS plumbing (Android intent-filter, iOS CFBundleURLTypes)
// still needs the scheme registered; the end-to-end round-trip must be
// verified on hardware before release (security audit P2: consider App
// Links / Universal Links migration later).

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// OAuth2 redirect deep link claimed by QuantMax.
///
/// Byte contract with the platform registration (AndroidManifest / Info.plist,
/// W1's scaffold) and with the OAuth client registration
/// (`QUANTMAX_OAUTH_REDIRECT_URI` dart-define).
const String kQuantMaxOAuthRedirectUri =
    'com.quantrinity.quantmax:/oauth2redirect';

/// Riverpod provider for [BrowserAuthLauncher].
///
/// The login screen depends on this provider to open the OAuth2 consent URL.
final browserLauncherProvider =
    Provider<BrowserAuthLauncher>((ref) => const BrowserAuthLauncher());

/// Opens OAuth2 authorization URLs in the system browser.
class BrowserAuthLauncher {
  const BrowserAuthLauncher();

  /// Opens [url] in the system browser.
  ///
  /// Returns `true` when the browser was launched, `false` if the launch
  /// failed (e.g. no browser available or the platform rejected the URL).
  Future<bool> openAuthorizeUrl(Uri url) async {
    return launchUrl(url, mode: LaunchMode.externalApplication);
  }
}
