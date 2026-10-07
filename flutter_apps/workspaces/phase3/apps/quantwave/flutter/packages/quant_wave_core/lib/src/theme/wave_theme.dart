// ============================================================================
// quant_wave_core - light + dark ThemeData
// ============================================================================
//
// Material 3 themes built from the verified brand tokens in
// `packages/brand/src/themes.ts` (SSOT), wired with the color, typography and
// motion tokens from the sibling files in this directory. Structure mirrors
// quant_foundation's `QuantTheme` so later diffing stays easy.
//
// - `WaveTheme.waveDark` / `WaveTheme.waveLight` — the QuantWave app theme:
//   identical surfaces to the ecosystem themes, but the QuantWave app accent
//   violet `0xFF8B5CF6` (provisional — TODO(UNVERIFIED) in wave_colors.dart)
//   takes the secondary / focus-ring role.
// - Dark is the default theme (see [WaveTheme.fallback]).
// - `WaveTheme.of(context)` returns the wave theme matching the ambient
//   brightness, so widgets stay theme-aware without extra plumbing.

import 'package:flutter/material.dart';

import 'wave_colors.dart';
import 'wave_typography.dart';

/// Brand themes for the QuantWave omnipresent Flutter clients.
///
/// All themes are Material 3 (`useMaterial3: true`) and are built from the
/// verified tokens in `packages/brand/src/themes.ts` plus the sibling token
/// files. The `dark` wave theme is the product default.
abstract final class WaveTheme {
  WaveTheme._();

  // -- QuantWave app themes ----------------------------------------------------

  /// QuantWave app theme (dark): brand dark surfaces with the QuantWave app
  /// accent violet `0xFF8B5CF6` as the secondary color and focus ring.
  static ThemeData get waveDark => _buildTheme(
        brightness: Brightness.dark,
        background: WaveColors.surfaceDark,
        foreground: const Color(0xFFF5F5F5),
        surface: WaveColors.surfaceDarkElevated,
        surfaceElevated: WaveColors.surfaceDarkOverlay,
        primary: WaveColors.primary500,
        onPrimary: const Color(0xFF111111),
        secondary: WaveAppColors.quantwave,
        onSecondary: const Color(0xFFFFFFFF),
        border: WaveColors.neutral700,
        muted: WaveColors.surfaceDarkOverlay,
        mutedForeground: WaveColors.neutral300,
        error: WaveColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: WaveAppColors.quantwave,
        appAccent: WaveAppColors.quantwave,
      );

  /// QuantWave app theme (light): brand light surfaces with the QuantWave app
  /// accent violet `0xFF8B5CF6` as the secondary color and focus ring.
  static ThemeData get waveLight => _buildTheme(
        brightness: Brightness.light,
        background: WaveColors.surfaceLight,
        foreground: const Color(0xFF0F172A),
        surface: WaveColors.surfaceLightElevated,
        surfaceElevated: WaveColors.surfaceLight,
        primary: const Color(0xFF4F46E5),
        onPrimary: const Color(0xFFFFFFFF),
        secondary: WaveAppColors.quantwave,
        onSecondary: const Color(0xFFFFFFFF),
        border: const Color(0xFFE2E8F0),
        muted: const Color(0xFFF1F5F9),
        mutedForeground: const Color(0xFF64748B),
        error: WaveColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: WaveAppColors.quantwave,
        appAccent: WaveAppColors.quantwave,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => waveDark;

  /// Returns the wave theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// WaveTheme.waveLight, darkTheme: WaveTheme.waveDark,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? waveDark : waveLight;

  // -- Builder ------------------------------------------------------------------

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color background,
    required Color foreground,
    required Color surface,
    required Color surfaceElevated,
    required Color primary,
    required Color onPrimary,
    required Color secondary,
    required Color onSecondary,
    required Color border,
    required Color muted,
    required Color mutedForeground,
    required Color error,
    required Color onError,
    required Color focusRing,
    required Color? appAccent,
  }) {
    final bool isDark = brightness == Brightness.dark;
    final ColorScheme scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onPrimary,
      secondary: secondary,
      onSecondary: onSecondary,
      error: error,
      onError: onError,
      surface: surface,
      onSurface: foreground,
      surfaceContainerLow: surface,
      surfaceContainer: surfaceElevated,
      surfaceContainerHigh: surfaceElevated,
      outline: border,
      outlineVariant: border,
    );

    final TextTheme textTheme = _textTheme(foreground, mutedForeground);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      canvasColor: background,
      cardColor: surfaceElevated,
      dividerColor: border,
      focusColor: focusRing,
      hoverColor: muted,
      splashColor: (appAccent ?? secondary).withValues(alpha: 0.12),
      highlightColor: (appAccent ?? secondary).withValues(alpha: 0.08),
      disabledColor: mutedForeground.withValues(alpha: 0.38),
      fontFamily: WaveTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: WaveTextStyles.h5.copyWith(color: foreground),
      ),
      cardTheme: CardThemeData(
        color: surfaceElevated,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: border),
        ),
        titleTextStyle: WaveTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: WaveTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: WaveTextStyles.body.copyWith(color: mutedForeground),
        labelStyle: WaveTextStyles.bodySmall.copyWith(color: mutedForeground),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: focusRing, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: error),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStatePropertyAll<Color>(primary),
          foregroundColor: WidgetStatePropertyAll<Color>(onPrimary),
          textStyle: const WidgetStatePropertyAll<TextStyle>(WaveTextStyles.button),
          padding: const WidgetStatePropertyAll<EdgeInsets>(
            EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(appAccent ?? primary),
          textStyle: const WidgetStatePropertyAll<TextStyle>(WaveTextStyles.button),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(foreground),
          textStyle: const WidgetStatePropertyAll<TextStyle>(WaveTextStyles.button),
          padding: const WidgetStatePropertyAll<EdgeInsets>(
            EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
          side: WidgetStatePropertyAll<BorderSide>(BorderSide(color: border)),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(mutedForeground),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevated,
        contentTextStyle: WaveTextStyles.bodySmall.copyWith(color: foreground),
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: appAccent ?? primary,
        unselectedItemColor: mutedForeground,
        selectedLabelStyle: WaveTextStyles.caption,
        unselectedLabelStyle: WaveTextStyles.caption,
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: WaveTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            WaveTextStyles.bodySmall.copyWith(color: mutedForeground),
        side: BorderSide(color: border),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFFFFFFFF) : const Color(0xFF111111),
          borderRadius: const BorderRadius.all(Radius.circular(8)),
        ),
        textStyle: WaveTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),
      extensions: const <ThemeExtension<dynamic>>[],
    );
  }

  /// Builds the brand text theme: [WaveTextStyles] ramp tinted with the
  /// theme foreground, secondary styles with the muted foreground.
  static TextTheme _textTheme(Color foreground, Color mutedForeground) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, WaveTextStyles.display),
      displayMedium: on(foreground, WaveTextStyles.h1),
      displaySmall: on(foreground, WaveTextStyles.h2),
      headlineLarge: on(foreground, WaveTextStyles.h2),
      headlineMedium: on(foreground, WaveTextStyles.h3),
      headlineSmall: on(foreground, WaveTextStyles.h4),
      titleLarge: on(foreground, WaveTextStyles.h4),
      titleMedium: on(foreground, WaveTextStyles.h5),
      titleSmall: on(mutedForeground, WaveTextStyles.overline),
      bodyLarge: on(foreground, WaveTextStyles.bodyLarge),
      bodyMedium: on(foreground, WaveTextStyles.body),
      bodySmall: on(foreground, WaveTextStyles.bodySmall),
      labelLarge: on(foreground, WaveTextStyles.button),
      labelMedium: on(foreground, WaveTextStyles.code),
      labelSmall: on(mutedForeground, WaveTextStyles.caption),
    );
  }
}
