// ============================================================================
// quantube_core - light + dark ThemeData
// ============================================================================
//
// Copy-adapt of `quant_foundation` themes
// (`phase0/foundation/lib/src/theme/quant_theme.dart`), re-skinned for
// QuanTube's video-dark identity:
//
// - `QuanTubeTheme.darkTheme()` is the product default: video-dark canvas
//   `#0F0F0F`, pure-black player area, brand red `#F43F5E` (from
//   `@quant/brand` `apps.ts`) as primary / progress / focus accent.
// - `QuanTubeTheme.lightTheme()` is the YouTube-light-style variant:
//   `#F9F9F9` canvas, same red accent.
// - Player chrome stays high-contrast: white controls on black, red
//   scrubber/progress, white focus ring for remote/keyboard navigation.
// - No heavy custom painting anywhere: rounded shapes, border sides and
//   `ColorScheme`-driven tints only, so the video texture keeps the GPU.
//
// Dark-first: the app boots with `themeMode: ThemeMode.dark`.
// `QuanTubeTheme.of(context)` returns the QuanTube theme matching the
// ambient brightness, so widgets stay theme-aware without extra plumbing.

import 'package:flutter/material.dart';

import 'quantube_colors.dart';
import 'quantube_typography.dart';

/// QuanTube Material 3 themes built from the tokens in this directory.
abstract final class QuanTubeTheme {
  QuanTubeTheme._();

  // -- App themes ------------------------------------------------------------------

  /// QuanTube dark theme — the default theme of the app.
  ///
  /// Video-dark surfaces (`#0F0F0F` canvas, black player canvas), brand red
  /// accent, white text. Player controls are high-contrast by design.
  static ThemeData get darkTheme => _buildTheme(
        brightness: Brightness.dark,
        canvas: QuanTubeColors.canvasDark,
        playerCanvas: QuanTubeColors.playerCanvas,
        foreground: QuanTubeColors.foregroundDark,
        secondaryForeground: QuanTubeColors.foregroundDarkSecondary,
        tertiaryForeground: QuanTubeColors.foregroundDarkTertiary,
        surface: QuanTubeColors.surfaceDark,
        surfaceElevated: QuanTubeColors.overlayDark,
        primary: QuanTubeColors.brandRed,
        onPrimary: QuanTubeColors.foregroundDark,
        border: QuanTubeColors.borderDark,
        borderElevated: QuanTubeColors.borderDarkElevated,
        muted: QuanTubeColors.surfaceDark,
        controls: QuanTubeColors.foregroundDark,
        focusRing: QuanTubeColors.focusRing,
        shimmerBase: QuanTubeColors.shimmerDark,
        shimmerHighlight: QuanTubeColors.shimmerDarkHighlight,
      );

  /// QuanTube light theme — YouTube-light-style variant.
  ///
  /// `#F9F9F9` canvas, white surfaces, same brand red accent, dark text.
  static ThemeData get lightTheme => _buildTheme(
        brightness: Brightness.light,
        canvas: QuanTubeColors.canvasLight,
        playerCanvas: QuanTubeColors.playerCanvas,
        foreground: QuanTubeColors.foregroundLight,
        secondaryForeground: QuanTubeColors.foregroundLightSecondary,
        tertiaryForeground: QuanTubeColors.foregroundLightTertiary,
        surface: QuanTubeColors.surfaceLight,
        surfaceElevated: QuanTubeColors.overlayLight,
        primary: QuanTubeColors.brandRed,
        onPrimary: QuanTubeColors.foregroundDark,
        border: QuanTubeColors.borderLight,
        borderElevated: QuanTubeColors.borderLight,
        muted: QuanTubeColors.overlayLight,
        controls: QuanTubeColors.foregroundDark,
        focusRing: QuanTubeColors.brandRed,
        shimmerBase: QuanTubeColors.shimmerLight,
        shimmerHighlight: QuanTubeColors.shimmerLightHighlight,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => darkTheme;

  /// Returns the QuanTube theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree; the
  /// app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// QuanTubeTheme.lightTheme, darkTheme: QuanTubeTheme.darkTheme,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? darkTheme : lightTheme;

  // -- Builder ----------------------------------------------------------------------

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color canvas,
    required Color playerCanvas,
    required Color foreground,
    required Color secondaryForeground,
    required Color tertiaryForeground,
    required Color surface,
    required Color surfaceElevated,
    required Color primary,
    required Color onPrimary,
    required Color border,
    required Color borderElevated,
    required Color muted,
    required Color controls,
    required Color focusRing,
    required Color shimmerBase,
    required Color shimmerHighlight,
  }) {
    final bool isDark = brightness == Brightness.dark;

    final ColorScheme scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onPrimary,
      secondary: secondaryForeground,
      onSecondary: foreground,
      tertiary: tertiaryForeground,
      onTertiary: foreground,
      error: QuanTubeColors.liveRed,
      onError: const Color(0xFFFFFFFF),
      surface: surface,
      onSurface: foreground,
      surfaceContainerLow: canvas,
      surfaceContainer: surface,
      surfaceContainerHigh: surfaceElevated,
      outline: border,
      outlineVariant: borderElevated,
    );

    final TextTheme textTheme = _textTheme(foreground, secondaryForeground);

    // A fixed dark-on-black control palette for the video player itself:
    // the player always floats over black video, regardless of the app's
    // light/dark mode.
    final TextTheme playerTextTheme = TextTheme(
      bodySmall: QuanTubeTextStyles.playerTimecode
          .copyWith(color: QuanTubeColors.foregroundDark),
      titleMedium:
          QuanTubeTextStyles.miniPlayerTitle.copyWith(color: QuanTubeColors.foregroundDark),
      labelSmall: QuanTubeTextStyles.durationBadge
          .copyWith(color: QuanTubeColors.foregroundDark),
      labelMedium: QuanTubeTextStyles.chapterLabel
          .copyWith(color: QuanTubeColors.foregroundDarkSecondary),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: canvas,
      canvasColor: canvas,
      cardColor: surfaceElevated,
      dividerColor: border,
      focusColor: focusRing,
      hoverColor: muted,
      splashColor: primary.withValues(alpha: 0.12),
      highlightColor: primary.withValues(alpha: 0.08),
      disabledColor: tertiaryForeground.withValues(alpha: 0.38),
      fontFamily: QuanTubeTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: canvas,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: QuanTubeTextStyles.h5.copyWith(color: foreground),
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
        titleTextStyle: QuanTubeTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: QuanTubeTextStyles.body.copyWith(color: foreground),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaceElevated,
        dragHandleColor: secondaryForeground,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      // The scrubber / seek-bar: red track, white thumb, square-ish profile
      // so buffered vs. played is crisp at small sizes.
      sliderTheme: SliderThemeData(
        activeTrackColor: primary,
        inactiveTrackColor: isDark
            ? QuanTubeColors.foregroundDark.withValues(alpha: 0.25)
            : tertiaryForeground.withValues(alpha: 0.4),
        thumbColor: QuanTubeColors.foregroundDark,
        overlayColor: primary.withValues(alpha: 0.12),
        trackHeight: 3,
        trackShape: const RectangularSliderTrackShape(),
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
        overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: primary,
        linearTrackColor: isDark
            ? QuanTubeColors.foregroundDark.withValues(alpha: 0.2)
            : tertiaryForeground.withValues(alpha: 0.3),
        circularTrackColor: isDark
            ? QuanTubeColors.foregroundDark.withValues(alpha: 0.2)
            : tertiaryForeground.withValues(alpha: 0.3),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: QuanTubeTextStyles.body.copyWith(color: secondaryForeground),
        labelStyle:
            QuanTubeTextStyles.bodySmall.copyWith(color: secondaryForeground),
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
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStatePropertyAll<Color>(primary),
          foregroundColor: WidgetStatePropertyAll<Color>(onPrimary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuanTubeTextStyles.button),
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
          foregroundColor: WidgetStatePropertyAll<Color>(primary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuanTubeTextStyles.button),
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
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuanTubeTextStyles.button),
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
          foregroundColor: WidgetStatePropertyAll<Color>(secondaryForeground),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevated,
        contentTextStyle: QuanTubeTextStyles.bodySmall.copyWith(color: foreground),
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: canvas,
        selectedItemColor: primary,
        unselectedItemColor: secondaryForeground,
        selectedLabelStyle: QuanTubeTextStyles.caption,
        unselectedLabelStyle: QuanTubeTextStyles.caption,
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: QuanTubeTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            QuanTubeTextStyles.bodySmall.copyWith(color: secondaryForeground),
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
        textStyle: QuanTubeTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),
      // Player-local themes: used by the video player overlay widgets, which
      // always sit on black video regardless of the ambient brightness.
      extensions: <ThemeExtension<dynamic>>[
        QuanTubePlayerTheme(
          playerCanvas: playerCanvas,
          controls: controls,
          controlsSecondary: QuanTubeColors.foregroundDarkSecondary,
          scrim: QuanTubeColors.playerScrim,
          dim: QuanTubeColors.playerDim,
          textTheme: playerTextTheme,
        ),
      ],
    );
  }

  /// Builds the QuanTube text theme: brand ramp tinted with the theme
  /// foreground, secondary styles with the secondary foreground.
  static TextTheme _textTheme(Color foreground, Color secondaryForeground) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, QuanTubeTextStyles.display),
      displayMedium: on(foreground, QuanTubeTextStyles.h1),
      displaySmall: on(foreground, QuanTubeTextStyles.h2),
      headlineLarge: on(foreground, QuanTubeTextStyles.h2),
      headlineMedium: on(foreground, QuanTubeTextStyles.h3),
      headlineSmall: on(foreground, QuanTubeTextStyles.h4),
      titleLarge: on(foreground, QuanTubeTextStyles.h4),
      titleMedium: on(foreground, QuanTubeTextStyles.h5),
      titleSmall: on(secondaryForeground, QuanTubeTextStyles.overline),
      bodyLarge: on(foreground, QuanTubeTextStyles.bodyLarge),
      bodyMedium: on(foreground, QuanTubeTextStyles.body),
      bodySmall: on(foreground, QuanTubeTextStyles.bodySmall),
      labelLarge: on(foreground, QuanTubeTextStyles.button),
      labelMedium: on(foreground, QuanTubeTextStyles.code),
      labelSmall: on(secondaryForeground, QuanTubeTextStyles.caption),
    );
  }
}

/// Player-local theme extension: the video player's fixed control palette.
///
/// The player always floats over black video, so its colors do NOT follow the
/// app's light/dark mode. Widgets inside the player overlay read this via
/// `Theme.of(context).extension<QuanTubePlayerTheme>()`.
///
/// Colors only — no custom painters or shaders here, per the playback
/// performance budget.
@immutable
final class QuanTubePlayerTheme extends ThemeExtension<QuanTubePlayerTheme> {
  /// The video surface: pure black, constant in both app modes.
  final Color playerCanvas;

  /// Primary control color: white, high-contrast over black video.
  final Color controls;

  /// Secondary control / metadata color over video.
  final Color controlsSecondary;

  /// Gradient scrim behind the top/bottom player chrome.
  final Color scrim;

  /// Dimmed backdrop behind full-screen player overlays.
  final Color dim;

  /// Text styles tuned for legibility over video.
  final TextTheme textTheme;

  /// Creates a player-local theme extension.
  const QuanTubePlayerTheme({
    required this.playerCanvas,
    required this.controls,
    required this.controlsSecondary,
    required this.scrim,
    required this.dim,
    required this.textTheme,
  });

  @override
  ThemeExtension<QuanTubePlayerTheme> copyWith({
    Color? playerCanvas,
    Color? controls,
    Color? controlsSecondary,
    Color? scrim,
    Color? dim,
    TextTheme? textTheme,
  }) {
    return QuanTubePlayerTheme(
      playerCanvas: playerCanvas ?? this.playerCanvas,
      controls: controls ?? this.controls,
      controlsSecondary: controlsSecondary ?? this.controlsSecondary,
      scrim: scrim ?? this.scrim,
      dim: dim ?? this.dim,
      textTheme: textTheme ?? this.textTheme,
    );
  }

  @override
  ThemeExtension<QuanTubePlayerTheme> lerp(
    covariant ThemeExtension<QuanTubePlayerTheme>? other,
    double t,
  ) {
    if (other is! QuanTubePlayerTheme) return this;
    return QuanTubePlayerTheme(
      playerCanvas: Color.lerp(playerCanvas, other.playerCanvas, t)!,
      controls: Color.lerp(controls, other.controls, t)!,
      controlsSecondary:
          Color.lerp(controlsSecondary, other.controlsSecondary, t)!,
      scrim: Color.lerp(scrim, other.scrim, t)!,
      dim: Color.lerp(dim, other.dim, t)!,
      textTheme: TextTheme.lerp(textTheme, other.textTheme, t),
    );
  }
}
