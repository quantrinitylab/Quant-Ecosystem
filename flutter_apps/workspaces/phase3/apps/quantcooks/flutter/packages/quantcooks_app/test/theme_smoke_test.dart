// ============================================================================
// quantcooks_app - CooksTheme smoke test
// ============================================================================
//
// The QuantCooks editor is dark-first: `CooksTheme.dark` is the primary
// theme (see `CooksTheme.fallback` and `themeMode: ThemeMode.dark` in
// `src/app.dart`). This smoke test asserts the theme actually builds and
// carries the editor-canvas ThemeExtension.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantcooks_core/quantcooks_core.dart';

void main() {
  group('CooksTheme smoke', () {
    test('dark theme builds with dark brightness', () {
      final ThemeData theme = CooksTheme.dark;
      expect(theme.brightness, Brightness.dark);
      expect(theme.useMaterial3, isTrue);
    });

    test('dark is the default/fallback identity', () {
      expect(CooksTheme.fallback.brightness, Brightness.dark);
    });

    test('dark theme carries the CooksCanvasExtension', () {
      final ThemeData theme = CooksTheme.dark;
      final CooksCanvasExtension? canvas =
          theme.extension<CooksCanvasExtension>();
      expect(canvas, isNotNull);
      // Spot-check an editor-canvas color: the playhead must be visible
      // against the dark canvas.
      expect(canvas!.playhead, isNot(equals(canvas.canvas)));
    });

    test('light theme carries the CooksCanvasExtension too', () {
      final ThemeData theme = CooksTheme.light;
      expect(theme.brightness, Brightness.light);
      expect(theme.extension<CooksCanvasExtension>(), isNotNull);
    });
  });
}
