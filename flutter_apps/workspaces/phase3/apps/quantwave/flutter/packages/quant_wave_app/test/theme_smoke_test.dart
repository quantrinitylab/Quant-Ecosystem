// ============================================================================
// quant_wave_app - WaveTheme smoke tests (W3, shift 1)
// ============================================================================
//
// Smoke: both Material 3 themes build, carry the right brightness, have all
// key colors set, and the QuantWave violet accent drives secondary + focus.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:quant_wave_core/src/theme/wave_colors.dart';
import 'package:quant_wave_core/src/theme/wave_theme.dart';

void main() {
  group('WaveTheme smoke', () {
    test('waveDark is a dark Material 3 theme', () {
      final ThemeData theme = WaveTheme.waveDark;
      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.dark);
      expect(theme.colorScheme.brightness, Brightness.dark);
    });

    test('waveLight is a light Material 3 theme', () {
      final ThemeData theme = WaveTheme.waveLight;
      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.light);
      expect(theme.colorScheme.brightness, Brightness.light);
    });

    test('fallback is the dark-first theme', () {
      expect(WaveTheme.fallback.brightness, Brightness.dark);
    });

    test('key colors and component themes are set on both themes', () {
      for (final ThemeData theme in <ThemeData>[
        WaveTheme.waveDark,
        WaveTheme.waveLight,
      ]) {
        final ColorScheme scheme = theme.colorScheme;
        for (final Color color in <Color>[
          scheme.primary,
          scheme.secondary,
          scheme.surface,
          scheme.onSurface,
          scheme.error,
        ]) {
          expect(color, isNot(equals(Colors.transparent)));
        }
        // Nullable component-theme fields: must be populated, not default.
        expect(theme.cardTheme.color, isNotNull);
        expect(theme.inputDecorationTheme.border, isNotNull);
        expect(theme.elevatedButtonTheme.style, isNotNull);
        expect(theme.textButtonTheme.style, isNotNull);
        expect(theme.iconButtonTheme.style, isNotNull);
        expect(theme.scaffoldBackgroundColor, isNot(equals(Colors.transparent)));
      }
    });

    test('QuantWave violet accent drives secondary and focus ring', () {
      const Color violet = Color(0xFF8B5CF6);
      expect(WaveAppColors.quantwave, violet);
      expect(WaveTheme.waveDark.colorScheme.secondary, violet);
      expect(WaveTheme.waveLight.colorScheme.secondary, violet);
      expect(WaveTheme.waveDark.focusColor, violet);
      expect(WaveTheme.waveLight.focusColor, violet);
    });
  });
}
