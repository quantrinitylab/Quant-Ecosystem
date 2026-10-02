// Copyright (c) 2026 Quatrinity Labs. All rights reserved.
// QuantAds omnipresent — auth-flow verification tests.
//
// Verifies [BrowserAuthLauncher] opens the OAuth2 authorize URL in the
// *system browser*. The url_launcher platform channel
// (`plugins.flutter.io/url_launcher`) is mocked at the binary-messenger
// level — no platform interface imports, no real browser involved.
//
// The authorize URL under test is built with the REAL
// [AuthApi.buildAuthorizeUrl] from a fixture [AdsConfig]:
//   - TODO(UNVERIFIED): the OAuth2 `client_id` is UNPROVISIONED (U1 — the
//     `quantads-flutter` client is not yet registered). The client id used
//     here is a throwaway test fixture, NOT a real credential.
//   - TODO(UNVERIFIED): the production API base URL is not confirmed by the
//     backend team; tests use a reserved `.example` host.

import 'package:ads_app/src/auth/browser_launcher.dart';
import 'package:ads_core/ads_core.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Fixture config: throwaway values and reserved `.example` hosts only.
const AdsConfig _testConfig = AdsConfig(
  apiBaseUrl: 'https://ads-api-test.example',
  oauthClientId: 'test-client-id-unprovisioned',
  oauthRedirectScheme: 'quantads',
  oauthRedirectUri: 'quantads://oauth/callback',
  webOrigin: 'https://quantads-test.example',
);

/// Records `launch` method-channel calls instead of opening a real browser.
class FakeUrlLauncherChannel {
  static const MethodChannel channel =
      MethodChannel('plugins.flutter.io/url_launcher');

  /// The last URL the app asked the OS to open.
  String? launchedUrl;

  /// The `useSafariVC` / `useWebView` flags of the last call. Both `false`
  /// means the system browser (external application), not an in-app webview.
  bool? lastUseSafariVC;
  bool? lastUseWebView;

  /// What the channel reports back for `launch` (defaults to success).
  bool launchResult = true;

  void install() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (MethodCall call) async {
      if (call.method == 'launch') {
        final Map<Object?, Object?> args =
            call.arguments as Map<Object?, Object?>;
        launchedUrl = args['url'] as String?;
        lastUseSafariVC = args['useSafariVC'] as bool?;
        lastUseWebView = args['useWebView'] as bool?;
        return launchResult;
      }
      return null;
    });
  }

  void uninstall() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  }
}

void main() {
  // Initializes the test binding so the url_launcher platform channel can
  // be mocked in plain (non-widget) tests.
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeUrlLauncherChannel fake;

  setUp(() {
    fake = FakeUrlLauncherChannel()..install();
  });

  tearDown(() {
    fake.uninstall();
  });

  /// Builds the real PKCE authorize URL the consent flow would open.
  AuthorizeRequest buildTestAuthorizeRequest() {
    return AuthApi(baseUrl: _testConfig.apiBaseUrl).buildAuthorizeUrl(
      clientId: _testConfig.oauthClientId,
      redirectUri: _testConfig.oauthRedirectUri,
      state: 'test-state-123',
    );
  }

  test(
      'openAuthorizeUrl opens the PKCE authorize URL in the system browser',
      () async {
    final AuthorizeRequest request = buildTestAuthorizeRequest();

    final bool opened =
        await const BrowserAuthLauncher().openAuthorizeUrl(request.url);

    expect(opened, isTrue);
    expect(fake.launchedUrl, isNotNull);
    final Uri launched = Uri.parse(fake.launchedUrl!);

    // Scheme/host come from the API base URL; path is the verified
    // `/oauth/authorize` endpoint (AUTH_CONTRACT.md workstream C).
    expect(launched.scheme, 'https');
    expect(launched.host, 'ads-api-test.example');
    expect(launched.path, '/oauth/authorize');

    // OAuth2 + PKCE parameter contract.
    final Map<String, String> params = launched.queryParameters;
    expect(params['client_id'], _testConfig.oauthClientId);
    expect(params['response_type'], 'code');
    expect(params['code_challenge_method'], 'S256');
    expect(params['code_challenge'], isNotEmpty);
    expect(params['state'], 'test-state-123');

    // The redirect target is the registered QuantAds custom scheme — the
    // OS hands `quantads://oauth/callback?code=…&state=…` back to the app.
    final Uri redirectUri = Uri.parse(params['redirect_uri']!);
    expect(redirectUri.scheme, 'quantads');
    expect(redirectUri.toString(), 'quantads://oauth/callback');

    // System browser, never an in-app webview or SafariVC.
    expect(fake.lastUseWebView, isFalse);
    expect(fake.lastUseSafariVC, isFalse);
  });

  test('openAuthorizeUrl returns false when the platform cannot open the URL',
      () async {
    fake.launchResult = false;

    final bool opened = await const BrowserAuthLauncher()
        .openAuthorizeUrl(buildTestAuthorizeRequest().url);

    expect(opened, isFalse);
    expect(fake.launchedUrl, isNotNull);
  });

  test('browserLauncherProvider exposes a BrowserAuthLauncher', () {
    final ProviderContainer container = ProviderContainer();
    addTearDown(container.dispose);

    expect(
      container.read(browserLauncherProvider),
      isA<BrowserAuthLauncher>(),
    );
  });
}
