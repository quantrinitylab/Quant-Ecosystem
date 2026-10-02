// ============================================================================
// quant_chat - system-browser launcher for the OAuth2 authorization step
// (QuantChat, shift 1)
//
// Port of quantmail's `quant_app/.../auth/browser_launcher.dart`.
//
// TODO(UNVERIFIED): custom-scheme delivery of `quantchat://oauth/callback`
// has NOT yet been proven on a real device. The OS plumbing here (Android
// intent-filter, iOS CFBundleURLTypes) registers the scheme so the system
// browser can hand the redirect back to the app, but the end-to-end
// round-trip must be verified on hardware before release.
//
// Future hardening (not yet): use Custom Tabs (Android) /
// ASWebAuthenticationSession (iOS) via `flutter_custom_tabs` for an
// in-app authentication tab. `url_launcher` with
// [LaunchMode.externalApplication] is sufficient for now: the consent screen
// is a first-time/edge case — the primary path is the app calling the
// authorize endpoint directly rather than rendering the consent page in a
// browser.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Riverpod provider for [BrowserAuthLauncher].
///
/// The login screen depends on this provider to open the OAuth2 consent URL.
final browserLauncherProvider =
    Provider<BrowserAuthLauncher>((ref) => const BrowserAuthLauncher());

/// Opens OAuth2 authorization URLs in the system browser.
///
/// The `/oauth/callback` go_router route captures
/// `quantchat://oauth/callback?code=…&state=…` deep links — this class's job
/// is only the OS-level handoff so that URL reaches the app.
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
