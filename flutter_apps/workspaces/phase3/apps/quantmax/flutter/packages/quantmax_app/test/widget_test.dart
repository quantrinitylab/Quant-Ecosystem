// ============================================================================
// quantmax_app - app smoke test (Phase 3b, Shift 1)
// ============================================================================
//
// Minimal boot check: `QuantMaxApp` builds and shows the D1 login surface.
// Unexecuted here (no Flutter SDK in this env); run on an SDK machine with
// `flutter test`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantmax_core/quantmax_core.dart';
import 'package:quantmax_app/src/app.dart';

import 'helpers/fake_auth_state.dart';

void main() {
  testWidgets('app boots to the QuantMail SSO login screen',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          authStateProvider.overrideWith(
            () => FakeAuthStateNotifier(const AuthInitial()),
          ),
        ],
        child: const QuantMaxApp(),
      ),
    );
    await tester.pump();

    expect(find.text('QuantMax'), findsOneWidget);
    expect(find.text('Continue with QuantMail'), findsOneWidget);
  });
}
