// ============================================================================
// ads_theme - light + dark ThemeData
// ============================================================================
//
// Material 3 themes for QuantAds, adapted from `quant_foundation`'s
// `quant_theme.dart`. The builder structure is mirrored: surfaces, borders,
// error, and motion come from the brand tokens, while the **ads accent
// (amber/gold `#F59E0B`-derived)** takes the primary CTA / focus-ring /
// selected-nav roles, per [AdsCtaColors].
//
// - `AdsTheme.adsDark` / `AdsTheme.adsLight` — the QuantAds app themes.
// - Dark is the default theme (see [AdsTheme.fallback]).
// - `AdsTheme.of(context)` returns the ads theme matching the ambient
//   brightness, so widgets stay theme-aware without extra plumbing.
// - `AdsTheme.of(Brightness)` resolves a theme without a build context.

import 'package:flutter/material.dart';

import 'ads_colors.dart';
import 'ads_typography.dart';

/// Themes for the QuantAds app.
///
/// All themes are Material 3 (`useMaterial3: true`) and are built from the
/// ads tokens. The `dark` theme is the product default.
abstract final class AdsTheme {
  AdsTheme._();

  // -- QuantAds app themes ----------------------------------------------------

  /// QuantAds app theme (dark): brand dark surfaces with the amber/gold
  /// campaign accent as primary CTA color, secondary, and focus ring.
  static ThemeData get adsDark => _buildTheme(
        brightness: Brightness.dark,
        background: AdsColors.surfaceDark,
        foreground: const Color(0xFFF5F5F5),
        surface: AdsColors.surfaceDarkElevated,
        surfaceElevated: AdsColors.surfaceDarkOverlay,
        primary: AdsCtaColors.ctaDark,
        onPrimary: AdsCtaColors.onCtaDark,
        secondary: AdsColors.adsAmber300,
        onSecondary: AdsColors.adsAmber950,
        border: AdsColors.neutral700,
        muted: AdsColors.surfaceDarkOverlay,
        mutedForeground: AdsColors.neutral300,
        error: AdsColors.error500,
        onError: const Color(0xFFFFFFFF),
        focusRing: AdsCtaColors.focusRing,
        appAccent: AdsColors.quantAds,
      );

  /// QuantAds app theme (light): brand light surfaces with the amber/gold
  /// campaign accent (`accent.600`, AA with white labels) as the primary
  /// CTA color, secondary, and focus ring.
  static ThemeData get adsLight => _buildTheme(
        brightness: Brightness.light,
        background: AdsColors.surfaceLight,
        foreground: const Color(0xFF0F172A),
        surface: AdsColors.surfaceLightElevated,
        surfaceElevated: AdsColors.surfaceLight,
        primary: AdsCtaColors.ctaLight,
        onPrimary: AdsCtaColors.onCtaLight,
        secondary: AdsCtaColors.ctaLight,
        onSecondary: AdsCtaColors.onCtaLight,
        border: const Color(0xFFE2E8F0),
        muted: const Color(0xFFF1F5F9),
        mutedForeground: const Color(0xFF64748B),
        error: AdsColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: AdsCtaColors.focusRing,
        appAccent: AdsColors.quantAds,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => adsDark;

  /// Returns the QuantAds theme matching the given [brightness].
  static ThemeData of(Brightness brightness) =>
      brightness == Brightness.dark ? adsDark : adsLight;

  /// Returns the QuantAds theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// AdsTheme.adsLight, darkTheme: AdsTheme.adsDark,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData ofContext(BuildContext context) =>
      of(Theme.of(context).brightness);

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
      fontFamily: AdsTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: AdsTextStyles.h5.copyWith(color: foreground),
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
        titleTextStyle: AdsTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: AdsTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: AdsTextStyles.body.copyWith(color: mutedForeground),
        labelStyle: AdsTextStyles.bodySmall.copyWith(color: mutedForeground),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(AdsTextStyles.button),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(AdsTextStyles.button),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(AdsTextStyles.button),
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
        contentTextStyle: AdsTextStyles.bodySmall.copyWith(color: foreground),
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
        selectedLabelStyle: AdsTextStyles.caption,
        unselectedLabelStyle: AdsTextStyles.caption,
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: AdsTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            AdsTextStyles.bodySmall.copyWith(color: mutedForeground),
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
        textStyle: AdsTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),
      extensions: const <ThemeExtension<dynamic>>[],
    );
  }

  /// Builds the ads text theme: [AdsTextStyles] ramp tinted with the theme
  /// foreground, secondary styles with the muted foreground.
  static TextTheme _textTheme(Color foreground, Color mutedForeground) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, AdsTextStyles.display),
      displayMedium: on(foreground, AdsTextStyles.h1),
      displaySmall: on(foreground, AdsTextStyles.h2),
      headlineLarge: on(foreground, AdsTextStyles.h2),
      headlineMedium: on(foreground, AdsTextStyles.h3),
      headlineSmall: on(foreground, AdsTextStyles.h4),
      titleLarge: on(foreground, AdsTextStyles.h4),
      titleMedium: on(foreground, AdsTextStyles.h5),
      titleSmall: on(mutedForeground, AdsTextStyles.overline),
      bodyLarge: on(foreground, AdsTextStyles.bodyLarge),
      bodyMedium: on(foreground, AdsTextStyles.body),
      bodySmall: on(foreground, AdsTextStyles.bodySmall),
      labelLarge: on(foreground, AdsTextStyles.button),
      labelMedium: on(foreground, AdsTextStyles.code),
      labelSmall: on(mutedForeground, AdsTextStyles.caption),
    );
  }
}
