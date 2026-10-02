// ============================================================================
// quant_app - BrowserAuthLauncher wiring tests (Phase 1, M2)
// ============================================================================
//
// Only the Riverpod wiring is unit-testable here: [openAuthorizeUrl] goes
// through url_launcher's platform channel, which needs a real device or the
// Flutter engine under test — the channel contract cannot be verified in
// this environment, so no theatre around it. The consent-button interaction
// (launcher receives the exact authorize URL) is covered by
// `login_screen_test.dart` with an overridden [browserLauncherProvider].

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/auth/browser_launcher.dart';

void main() {
  group('browserLauncherProvider', () {
    test('resolves a BrowserAuthLauncher instance', () {
      final ProviderContainer container = ProviderContainer();
      addTearDown(container.dispose);

      expect(
        container.read(browserLauncherProvider),
        isA<BrowserAuthLauncher>(),
      );
    });
  });
}
