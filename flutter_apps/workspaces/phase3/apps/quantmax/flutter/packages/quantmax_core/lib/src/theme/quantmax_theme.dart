// ============================================================================
// quantmax_core - QuantMax Material 3 themes
// ============================================================================
//
// Material 3 `ThemeData` builders composed from the QuantMax tokens in this
// directory ([QuantMaxColors], [QuantMaxTextStyles], [QuantMaxMotion]).
// Adapted from the phase0 `QuantTheme` builder pattern.
//
// - `quantmaxThemeDark` — the DEFAULT theme. Feed-first: pure-black canvas
//   (`QuantMaxColors.feedCanvas`) for OLED contrast under video, amber
//   accent `#F59E0B` (`apps.ts` quantmax accent).
// - `quantmaxThemeLight` — light-mode counterpart: white canvas, deeper
//   amber (`primary600`/`primary700`) for AA contrast on white.
// - Feed-specific component theming: the app bar is TRANSPARENT (it floats
//   over video, never a bar), comment/action sheets use the 300ms sheet
//   motion spec, snack bars float above the feed.
// - On-video overlay text is NOT theme-dependent — use the fixed-white
//   `video*` styles in [QuantMaxTextStyles] directly in the player.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'quant_colors.dart';
import 'quant_motion.dart';
import 'quant_typography.dart';

/// QuantMax Material 3 themes for the Flutter clients.
///
/// Dark is the product default (see [QuantMaxTheme.fallback]); the app boots
/// with `MaterialApp(theme: QuantMaxTheme.quantmaxThemeLight,
/// darkTheme: QuantMaxTheme.quantmaxThemeDark, themeMode: ThemeMode.dark)`.
abstract final class QuantMaxTheme {
  QuantMaxTheme._();

  /// QuantMax dark theme — the default. Pure-black feed canvas, amber
  /// accent, white overlay text pinned over video.
  static ThemeData get quantmaxThemeDark => _buildTheme(
        brightness: Brightness.dark,
        background: QuantMaxColors.feedCanvas,
        foreground: QuantMaxColors.foregroundDark,
        mutedForeground: QuantMaxColors.mutedForegroundDark,
        surface: QuantMaxColors.surfaceDarkElevated,
        surfaceElevated: QuantMaxColors.surfaceDarkOverlay,
        primary: QuantMaxColors.primary500,
        onPrimary: const Color(0xFF111111),
        secondary: QuantMaxColors.primary300,
        tertiary: QuantMaxColors.verified,
        border: QuantMaxColors.borderDark,
        muted: QuantMaxColors.surfaceDarkOverlay,
        error: QuantMaxColors.error,
        onError: const Color(0xFFFFFFFF),
        focusRing: QuantMaxColors.primary500,
      );

  /// QuantMax light theme. White canvas, amber deepened to `primary600`
  /// (buttons) / `primary700` (text) for AA contrast on white.
  static ThemeData get quantmaxThemeLight => _buildTheme(
        brightness: Brightness.light,
        background: QuantMaxColors.canvasLight,
        foreground: QuantMaxColors.foregroundLight,
        mutedForeground: QuantMaxColors.mutedForegroundLight,
        surface: QuantMaxColors.surfaceLightElevated,
        surfaceElevated: QuantMaxColors.canvasLight,
        primary: QuantMaxColors.primary600,
        onPrimary: const Color(0xFFFFFFFF),
        secondary: QuantMaxColors.primary700,
        tertiary: QuantMaxColors.verified,
        border: QuantMaxColors.borderLight,
        muted: QuantMaxColors.surfaceLightOverlay,
        error: QuantMaxColors.error,
        onError: const Color(0xFFFFFFFF),
        focusRing: QuantMaxColors.primary600,
      );

  /// The default theme for the app: dark-first, feed on pure black.
  static ThemeData get fallback => quantmaxThemeDark;

  /// Returns the QuantMax theme matching the ambient [Theme] brightness.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? quantmaxThemeDark
          : quantmaxThemeLight;

  // -- Builder --------------------------------------------------------------------

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color background,
    required Color foreground,
    required Color mutedForeground,
    required Color surface,
    required Color surfaceElevated,
    required Color primary,
    required Color onPrimary,
    required Color secondary,
    required Color tertiary,
    required Color border,
    required Color muted,
    required Color error,
    required Color onError,
    required Color focusRing,
  }) {
    final bool isDark = brightness == Brightness.dark;
    final ColorScheme scheme = ColorScheme(
      brightness: brightness,
      primary: primary,
      onPrimary: onPrimary,
      secondary: secondary,
      onSecondary: onPrimary,
      tertiary: tertiary,
      onTertiary: const Color(0xFFFFFFFF),
      error: error,
      onError: onError,
      surface: surface,
      onSurface: foreground,
      surfaceContainerLow: background,
      surfaceContainer: surface,
      surfaceContainerHigh: surfaceElevated,
      outline: border,
      outlineVariant: border,
    );

    final TextTheme textTheme =
        QuantMaxTextStyles.textTheme(foreground, mutedForeground);

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
      splashColor: primary.withValues(alpha: 0.12),
      highlightColor: primary.withValues(alpha: 0.08),
      disabledColor: mutedForeground.withValues(alpha: 0.38),
      fontFamily: QuantMaxTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,

      // -- Feed: transparent app bar floating over video -------------------------
      // The feed/viewer has no bar chrome: title + actions pin white over
      // the video with a top scrim (see QuantMaxColors.scrimStopsTop).
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: QuantMaxColors.onVideoPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: QuantMaxTextStyles.screenTitle
            .copyWith(color: QuantMaxColors.onVideoPrimary),
        iconTheme: const IconThemeData(
          color: QuantMaxColors.onVideoPrimary,
          size: 26,
        ),
      ),

      // -- Feed: comment / action sheets -----------------------------------------
      // Bottom sheets slide up over the feed on the 300ms sheet spec.
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        modalBackgroundColor: surface,
        elevation: 0,
        showDragHandle: true,
        dragHandleColor: mutedForeground.withValues(alpha: 0.4),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        clipBehavior: Clip.antiAlias,
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: border),
        ),
        titleTextStyle:
            QuantMaxTextStyles.sectionHeader.copyWith(color: foreground),
        contentTextStyle: QuantMaxTextStyles.body.copyWith(color: foreground),
      ),

      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),

      // -- Feed: floating snack bars above the player ------------------------------
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevated,
        contentTextStyle:
            QuantMaxTextStyles.bodySmall.copyWith(color: foreground),
        actionTextColor: primary,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
        behavior: SnackBarBehavior.floating,
        elevation: 0,
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: QuantMaxTextStyles.body.copyWith(color: mutedForeground),
        labelStyle:
            QuantMaxTextStyles.bodySmall.copyWith(color: mutedForeground),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuantMaxTextStyles.button),
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
              const WidgetStatePropertyAll<TextStyle>(QuantMaxTextStyles.button),
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
              const WidgetStatePropertyAll<TextStyle>(QuantMaxTextStyles.button),
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

      // Feed rail icons over video: white idle, amber when active.
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: const WidgetStatePropertyAll<Color>(
            QuantMaxColors.onVideoPrimary,
          ),
          iconSize: const WidgetStatePropertyAll<double>(28),
        ),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: isDark ? QuantMaxColors.feedCanvas : surface,
        selectedItemColor: primary,
        unselectedItemColor: mutedForeground,
        selectedLabelStyle: QuantMaxTextStyles.caption,
        unselectedLabelStyle: QuantMaxTextStyles.caption,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),

      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: QuantMaxTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            QuantMaxTextStyles.bodySmall.copyWith(color: mutedForeground),
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
        textStyle: QuantMaxTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),

      // Feed motion values, readable via
      // `Theme.of(context).extension<QuantMaxMotion>()`.
      extensions: const <ThemeExtension<dynamic>>[
        QuantMaxMotion(),
      ],
    );
  }
}
