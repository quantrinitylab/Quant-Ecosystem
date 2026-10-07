// ============================================================================
// quantai_app - system-browser launcher for the OAuth2 consent step (Shift 1)
// ============================================================================
//
// Pattern adapted from quant_app (Phase 1, M2); the class here is named
// [BrowserLauncher] per the QuantAI auth contract.
//
// TODO(UNVERIFIED): custom-scheme delivery of `quantai://oauth/callback`
// has NOT yet been proven on a real device. The OS plumbing here (Android
// intent-filter, iOS CFBundleURLTypes) registers the scheme so the system
// browser can hand the redirect back to the app, but the end-to-end
// round-trip must be verified on hardware before release.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Riverpod provider for [BrowserLauncher].
///
/// The login screen reads this provider to open the OAuth2 consent URL.
final browserLauncherProvider =
    Provider<BrowserLauncher>((ref) => const BrowserLauncher());

/// Opens OAuth2 authorization URLs in the system browser.
///
/// The router's `/oauth/callback` route captures
/// `quantai://oauth/callback?code=…&state=…` deep links — this class's job
/// is only the OS-level handoff so that URL reaches the app.
class BrowserLauncher {
  const BrowserLauncher();

  /// Opens [url] in the system browser.
  ///
  /// Returns `true` when the browser was launched, `false` if the launch
  /// failed (e.g. no browser available or the platform rejected the URL).
  Future<bool> openAuthorizeUrl(Uri url) async {
    return launchUrl(url, mode: LaunchMode.externalApplication);
  }
}
