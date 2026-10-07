// ============================================================================
// gram_core - light + dark ThemeData for QuantGram
// ============================================================================
//
// Material 3 themes built from the QuantGram tokens in the sibling files in
// this directory (no `ColorScheme.fromSeed` — every color is an explicit
// [GramColors] token).
//
// - [GramTheme.dark] — the default theme: deep black `#0A0A0F` canvas, vivid
//   magenta->violet->amber brand gradient moments.
// - [GramTheme.light] — same brand, light surfaces.
// - The brand gradient itself is reserved for signature moments (story
//   rings, the create button); functional chrome uses the solid brand
//   colors. See the `brandGradient` note on `buildGramTheme`.
// - [GramTheme.of] returns the theme matching the ambient brightness, so
//   widgets stay theme-aware without extra plumbing.

import 'package:flutter/material.dart';

import 'gram_colors.dart';
import 'gram_typography.dart';

/// Material 3 themes for the QuantGram Flutter clients.
///
/// Dark is the default theme (see [GramTheme.fallback]).
abstract final class GramTheme {
  GramTheme._();

  /// The QuantGram dark theme — the product default.
  ///
  /// Canvas `#0A0A0F`, surface `#131318`, brand magenta `#EC4899` primary,
  /// border `#2A2A36`.
  static ThemeData get dark => buildGramTheme(Brightness.dark);

  /// The QuantGram light theme.
  ///
  /// Canvas `#FAFAFA`, surface `#FFFFFF`, brand magenta `#EC4899` primary,
  /// border `#E4E4EA`.
  static ThemeData get light => buildGramTheme(Brightness.light);

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => dark;

  /// Returns the theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// GramTheme.light, darkTheme: GramTheme.dark, themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;

  /// Builds the QuantGram [ThemeData] for [brightness] from the explicit
  /// [GramColors] tokens — no seed-based color generation.
  ///
  /// The [GramColors.brandGradient] is intentionally *not* a color-scheme
  /// entry: gradients cannot live in a [ColorScheme]. Apply it directly to
  /// signature widgets (story rings via `GradientBorder`/`Container`
  /// decoration, the create button via an ink-decorated container). The
  /// solid [primary] here is [GramColors.brandGradientStart] (magenta) so
  /// buttons and focused controls stay on-brand.
  static ThemeData buildGramTheme(Brightness brightness) {
    final bool isDark = brightness == Brightness.dark;

    final Color background =
        isDark ? GramColors.backgroundDark : GramColors.backgroundLight;
    final Color foreground =
        isDark ? GramColors.foregroundDark : GramColors.foregroundLight;
    final Color foregroundSecondary = isDark
        ? GramColors.foregroundSecondaryDark
        : GramColors.foregroundSecondaryLight;
    final Color foregroundTertiary = isDark
        ? GramColors.foregroundTertiaryDark
        : GramColors.foregroundTertiaryLight;
    final Color surface =
        isDark ? GramColors.surfaceDark : GramColors.surfaceLight;
    final Color surfaceVariant = isDark
        ? GramColors.surfaceVariantDark
        : GramColors.surfaceVariantLight;
    final Color surfaceElevated = isDark
        ? GramColors.surfaceElevatedDark
        : GramColors.surfaceElevatedLight;
    final Color border =
        isDark ? GramColors.borderDark : GramColors.borderLight;

    const Color primary = GramColors.brandGradientStart;
    const Color onPrimary = GramColors.onBrand;
    const Color secondary = GramColors.brandGradientMid;
    const Color onSecondary = GramColors.onBrand;
    final Color tertiary = GramColors.brandGradientEnd;
    final Color error = isDark ? GramColors.error400 : GramColors.error500;
    const Color onError = GramColors.onBrand;

    final ColorScheme scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onPrimary,
      primaryContainer: surfaceElevated,
      onPrimaryContainer: foreground,
      secondary: secondary,
      onSecondary: onSecondary,
      secondaryContainer: surfaceVariant,
      onSecondaryContainer: foreground,
      tertiary: tertiary,
      onTertiary: GramColors.black,
      error: error,
      onError: onError,
      surface: surface,
      onSurface: foreground,
      surfaceContainerLowest: background,
      surfaceContainerLow: surface,
      surfaceContainer: surfaceVariant,
      surfaceContainerHigh: surfaceElevated,
      onSurfaceVariant: foregroundSecondary,
      outline: border,
      outlineVariant: border,
    );

    final TextTheme textTheme = _textTheme(foreground, foregroundSecondary);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      canvasColor: background,
      cardColor: surface,
      dividerColor: border,
      focusColor: secondary,
      hoverColor: surfaceVariant,
      splashColor: primary.withValues(alpha: 0.12),
      highlightColor: primary.withValues(alpha: 0.08),
      disabledColor: foregroundTertiary.withValues(alpha: 0.38),
      fontFamily: GramTypography.fontFamilyDefault,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: GramTextStyles.h4.copyWith(color: foreground),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(20)),
          side: BorderSide(color: border),
        ),
        titleTextStyle: GramTextStyles.h3.copyWith(color: foreground),
        contentTextStyle: GramTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceVariant,
        hintStyle: GramTextStyles.body.copyWith(color: foregroundTertiary),
        labelStyle: GramTextStyles.bodySmall.copyWith(color: foregroundSecondary),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
          borderSide: BorderSide(color: secondary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          borderSide: BorderSide(color: error),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: const WidgetStatePropertyAll<Color>(primary),
          foregroundColor: const WidgetStatePropertyAll<Color>(onPrimary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(GramTextStyles.button),
          padding: const WidgetStatePropertyAll<EdgeInsets>(
            EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          foregroundColor: const WidgetStatePropertyAll<Color>(primary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(GramTextStyles.button),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(foreground),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(GramTextStyles.button),
          padding: const WidgetStatePropertyAll<EdgeInsets>(
            EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
          side: WidgetStatePropertyAll<BorderSide>(BorderSide(color: border)),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(foregroundSecondary),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevated,
        contentTextStyle: GramTextStyles.bodySmall.copyWith(color: foreground),
        actionTextColor: primary,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: primary,
        unselectedItemColor: foregroundTertiary,
        selectedLabelStyle: GramTextStyles.storyLabel,
        unselectedLabelStyle: GramTextStyles.storyLabel,
        elevation: 0,
        showUnselectedLabels: true,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surfaceVariant,
        labelStyle: GramTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            GramTextStyles.bodySmall.copyWith(color: foregroundSecondary),
        side: BorderSide(color: border),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(999)),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: isDark ? GramColors.white : GramColors.black,
          borderRadius: const BorderRadius.all(Radius.circular(8)),
        ),
        textStyle: GramTextStyles.timestamp.copyWith(
          color: isDark ? GramColors.black : GramColors.white,
        ),
      ),
      // Semantic aliases are read from [GramColors] directly (success /
      // warning / info are not ColorScheme entries).
      extensions: const <ThemeExtension<dynamic>>[],
    );
  }

  /// Builds the text theme: [GramTextStyles] tinted with the theme
  /// foreground, secondary styles with the muted foreground.
  static TextTheme _textTheme(Color foreground, Color foregroundSecondary) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, GramTextStyles.display),
      displayMedium: on(foreground, GramTextStyles.h1),
      displaySmall: on(foreground, GramTextStyles.h2),
      headlineLarge: on(foreground, GramTextStyles.h2),
      headlineMedium: on(foreground, GramTextStyles.h3),
      headlineSmall: on(foreground, GramTextStyles.h3),
      titleLarge: on(foreground, GramTextStyles.h3),
      titleMedium: on(foreground, GramTextStyles.h4),
      titleSmall: on(foregroundSecondary, GramTextStyles.overline),
      bodyLarge: on(foreground, GramTextStyles.bodyLarge),
      bodyMedium: on(foreground, GramTextStyles.body),
      bodySmall: on(foreground, GramTextStyles.bodySmall),
      labelLarge: on(foreground, GramTextStyles.button),
      labelMedium: on(foreground, GramTextStyles.code),
      labelSmall: on(foregroundSecondary, GramTextStyles.timestamp),
    );
  }
}
