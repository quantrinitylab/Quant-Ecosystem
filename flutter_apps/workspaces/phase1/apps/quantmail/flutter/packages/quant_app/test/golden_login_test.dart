// Golden screenshot: renders the QuantMail login screen and writes a golden
// PNG on first run (--update-goldens), compares on later runs.
// Run: flutter test --update-goldens test/golden_login_test.dart

import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/app.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Loads the test fonts as 'Inter' (the brand fontFamily) so golden
/// screenshots render real glyphs instead of tofu blocks.
Future<void> _loadBrandFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final loader = FontLoader('Inter');
  for (final name in ['Inter-Regular.ttf', 'Inter-Bold.ttf']) {
    final file = File('test/fonts/$name');
    final bytes = await file.readAsBytes();
    loader.addFont(Future.value(ByteData.view(bytes.buffer)));
  }
  await loader.load();
}

void main() {
  testWidgets('login screen golden', (WidgetTester tester) async {
    // runAsync: FontLoader uses platform channels; inside testWidgets the
    // fake async zone would otherwise never complete the load.
    await tester.runAsync(_loadBrandFonts);

    final tokenManager = TokenManager(storage: InMemoryTokenStorage());
    addTearDown(tokenManager.dispose);

    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenManagerProvider.overrideWithValue(tokenManager),
        ],
        child: const QuantMailApp(),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('QuantMail'), findsOneWidget);
    await expectLater(
      find.byType(QuantMailApp),
      matchesGoldenFile('goldens/login.png'),
    );
  });
}
