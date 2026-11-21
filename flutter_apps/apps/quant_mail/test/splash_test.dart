import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/screens/superapp/quant_workplace_splash_screen.dart';

void main() {
  testWidgets('QuantWorkplaceSplashScreen pumps and paints without error', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: QuantWorkplaceSplashScreen(
          initialSplashDuration: Duration(minutes: 5),
          child: SizedBox.shrink(),
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(QuantWorkplaceSplashScreen), findsOneWidget);
  });
}
