import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/widgets/quant_ai_logo.dart';

void main() {
  testWidgets('QuantAiLogo decodes and paints the asset image', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: QuantAiLogo(size: 120))),
    );
    ImageStream? streamRef;
    await tester.runAsync(() async {
      final img = tester.widget<Image>(find.byType(Image));
      final stream = img.image.resolve(const ImageConfiguration());
      streamRef = stream;
      final c = Completer<void>();
      late ImageStreamListener listener;
      listener = ImageStreamListener((info, sync) {
        debugPrint('DECODED: ${info.image.width}x${info.image.height}');
        c.complete();
      }, onError: (e, s) {
        debugPrint('DECODE ERROR: $e');
        c.completeError(e);
      });
      stream.addListener(listener);
      await c.future.timeout(const Duration(seconds: 10));
      stream.removeListener(listener);
    });
    expect(streamRef, isNotNull);
  });
}
