// Copyright (c) 2026 Quatrinity Labs. All rights reserved.
// QuantCooks omnipresent — Phase 3b, Shift 1 (SSO login).
//
// System-browser launcher for the OAuth2 authorization step.
//
// TODO(UNVERIFIED): custom-scheme delivery of `quantcooks://oauth/callback`
// has NOT yet been proven on a real device. The OS plumbing (Android
// intent-filter, iOS CFBundleURLTypes) must register the scheme so the
// system browser can hand the redirect back to the app; the end-to-end
// round-trip must be verified on hardware before release.
//
// Future hardening (not yet): use Custom Tabs (Android) /
// ASWebAuthenticationSession (iOS) via `flutter_custom_tabs` for an
// in-app authentication tab. `url_launcher` with
// [LaunchMode.externalApplication] is sufficient for now: the SSO consent
// screen is a first-time/edge case.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Riverpod provider for [BrowserAuthLauncher].
///
/// The login screen depends on this provider to open the SSO consent URL.
final browserLauncherProvider =
    Provider<BrowserAuthLauncher>((ref) => const BrowserAuthLauncher());

/// Opens OAuth2 authorization URLs in the system browser.
///
/// The `/oauth/callback` go_router route captures
/// `quantcooks://oauth/callback?code=…&state=…` deep links — this class's job
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
