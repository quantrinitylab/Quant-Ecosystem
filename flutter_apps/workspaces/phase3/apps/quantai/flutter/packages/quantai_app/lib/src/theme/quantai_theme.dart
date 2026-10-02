// ============================================================================
// quantai_app - QuantAI Material 3 theme (Shift 1)
// ============================================================================
//
// The QuantAI look: brand surfaces and the shared primary (brand orange)
// from the Phase 0 foundation tokens, with the QuantAI identity carried by
// [QuantAppColors.quantai] (#8B5CF6) as the secondary / focus color.
//
// Imported, never copied: [QuantColors], [QuantAppColors] and
// [QuantTextStyles] all come from `package:quant_foundation`.

import 'package:flutter/material.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// QuantAI Material 3 themes: dark-first (the app default), with a light
/// companion.
///
/// The text-theme builder mirrors the foundation's `_textTheme` pattern
/// (brand ramp tinted with the theme foreground), so the type scale matches
/// the web theme exactly.
abstract final class QuantAiTheme {
  QuantAiTheme._();

  /// The QuantAI identity color: violet, secondary slot everywhere.
  static const Color identityViolet = QuantAppColors.quantai;

  /// Dark theme — the app default ([fallback]).
  static ThemeData get quantAiDark => _buildTheme(
        brightness: Brightness.dark,
        background: QuantColors.surfaceDark,
        foreground: QuantColors.neutral50,
        surface: QuantColors.surfaceDarkElevated,
        surfaceElevated: QuantColors.surfaceDarkOverlay,
        border: QuantColors.neutral700,
        muted: QuantColors.neutral800,
        mutedForeground: QuantColors.neutral400,
      );

  /// Light theme companion.
  static ThemeData get quantAiLight => _buildTheme(
        brightness: Brightness.light,
        background: QuantColors.surfaceLight,
        foreground: QuantColors.neutral950,
        surface: QuantColors.surfaceLightElevated,
        surfaceElevated: QuantColors.surfaceLightOverlay,
        border: QuantColors.neutral200,
        muted: QuantColors.neutral100,
        mutedForeground: QuantColors.neutral500,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => quantAiDark;

  /// Returns the QuantAI theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree; the
  /// app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// QuantAiTheme.quantAiLight, darkTheme: QuantAiTheme.quantAiDark,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? quantAiDark : quantAiLight;

  // -- Builder --------------------------------------------------------------

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color background,
    required Color foreground,
    required Color surface,
    required Color surfaceElevated,
    required Color border,
    required Color muted,
    required Color mutedForeground,
  }) {
    final bool isDark = brightness == Brightness.dark;

    const Color primary = QuantColors.primary500;
    const Color onPrimary = Color(0xFFFFFFFF);
    const Color secondary = identityViolet;
    const Color onSecondary = Color(0xFFFFFFFF);
    const Color error = QuantColors.error500;
    const Color onError = Color(0xFFFFFFFF);

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

    final TextTheme textTheme = _quantAiTextTheme(foreground, mutedForeground);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      textTheme: textTheme,
      focusColor: secondary,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: foreground,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: QuantTextStyles.h5.copyWith(color: foreground),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: const WidgetStatePropertyAll<Color>(primary),
          foregroundColor: const WidgetStatePropertyAll<Color>(onPrimary),
          textStyle: const WidgetStatePropertyAll<TextStyle>(
            QuantTextStyles.button,
          ),
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
          foregroundColor: const WidgetStatePropertyAll<Color>(secondary),
          textStyle: const WidgetStatePropertyAll<TextStyle>(
            QuantTextStyles.button,
          ),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(
            QuantTextStyles.button,
          ),
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
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceElevated,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          // Violet focus ring: the QuantAI identity at every input.
          borderSide: BorderSide(color: secondary, width: 2),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: error),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevated,
        contentTextStyle: QuantTextStyles.bodySmall.copyWith(color: foreground),
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: secondary,
        unselectedItemColor: mutedForeground,
        selectedLabelStyle: QuantTextStyles.caption,
        unselectedLabelStyle: QuantTextStyles.caption,
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: QuantTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            QuantTextStyles.bodySmall.copyWith(color: mutedForeground),
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
        textStyle: QuantTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),
      extensions: const <ThemeExtension<dynamic>>[],
    );
  }

  /// Builds the QuantAI text theme: the [QuantTextStyles] brand ramp tinted
  /// with the theme foreground, secondary styles with the muted foreground.
  ///
  /// Pattern copy-adapted from the foundation's `_textTheme` so the type
  /// scale matches the web theme exactly.
  static TextTheme _quantAiTextTheme(
    Color foreground,
    Color mutedForeground,
  ) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, QuantTextStyles.display),
      displayMedium: on(foreground, QuantTextStyles.h1),
      displaySmall: on(foreground, QuantTextStyles.h2),
      headlineLarge: on(foreground, QuantTextStyles.h2),
      headlineMedium: on(foreground, QuantTextStyles.h3),
      headlineSmall: on(foreground, QuantTextStyles.h4),
      titleLarge: on(foreground, QuantTextStyles.h4),
      titleMedium: on(foreground, QuantTextStyles.h5),
      titleSmall: on(mutedForeground, QuantTextStyles.overline),
      bodyLarge: on(foreground, QuantTextStyles.bodyLarge),
      bodyMedium: on(foreground, QuantTextStyles.body),
      bodySmall: on(foreground, QuantTextStyles.bodySmall),
      labelLarge: on(foreground, QuantTextStyles.button),
      labelMedium: on(foreground, QuantTextStyles.code),
      labelSmall: on(mutedForeground, QuantTextStyles.caption),
    );
  }
}
