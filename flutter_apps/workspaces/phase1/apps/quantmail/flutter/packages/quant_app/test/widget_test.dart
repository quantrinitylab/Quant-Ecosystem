// Smoke test: the app boots and lands on the login route.
//
// The login screen is the M2 OAuth2+PKCE UI; its branding header proves we
// are on the /login route.
//
// Uses an InMemory TokenManager override so auth hydration completes
// instantly (real secure storage has no platform channel in widget tests).
// Bounded pumps instead of pumpAndSettle: the loading spinner never settles.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/app.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

void main() {
  testWidgets('boots to the login route', (WidgetTester tester) async {
    final tokenManager = TokenManager(storage: InMemoryTokenStorage());
    addTearDown(tokenManager.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenManagerProvider.overrideWithValue(tokenManager),
        ],
        child: const QuantMailApp(),
      ),
    );
    // Let async hydration complete and the router land on /login.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('QuantMail'), findsOneWidget);
    expect(find.text('Sign in to your account'), findsOneWidget);
  });
}
