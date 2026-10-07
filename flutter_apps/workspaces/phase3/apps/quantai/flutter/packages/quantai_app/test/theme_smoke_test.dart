import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_app/src/theme/quantai_theme.dart';

void main() {
  group('QuantAiTheme smoke (design-token wiring)', () {
    test('quantAiDark is non-null and dark', () {
      final theme = QuantAiTheme.quantAiDark;
      expect(theme, isNotNull);
      expect(theme.brightness, Brightness.dark);
    });

    test('quantAiLight is non-null and light', () {
      final theme = QuantAiTheme.quantAiLight;
      expect(theme, isNotNull);
      expect(theme.brightness, Brightness.light);
    });

    test('AI accent (secondary) is the brand violet', () {
      expect(QuantAiTheme.quantAiDark.colorScheme.secondary,
          const Color(0xFF8B5CF6));
      expect(QuantAiTheme.quantAiLight.colorScheme.secondary,
          const Color(0xFF8B5CF6));
    });
  });
}
