// ============================================================================
// quant_chat - QuantChat app theme
// ============================================================================
//
// Material 3 light + dark `ThemeData` for the QuantChat Flutter client,
// ported from `QuantTheme` in `package:quant_foundation`
// (`phase0/foundation/lib/src/theme/quant_theme.dart`).
//
// Token source (SSOT): `@quant/brand` tokens — `QuantColors`,
// `QuantTypography` / `QuantTextStyles`, `QuantMotion` — sab verified values,
// yahan invent kuch nahi kiya gaya.
//
// QuantChat identity (QuantMail se farq):
// - Primary STILL brand orange (`QuantColors.primary500`) — ecosystem
//   consistency, taaki sab Quant apps ek family lagen.
// - `secondary`, `focusRing` aur `appAccent` = `QuantAppColors.quantchat`
//   (`#10B981` emerald, `packages/brand/src/apps.ts` se verified) — yahi
//   WhatsApp/Telegram/Discord se alag hone wali QuantChat ki pehchan hai:
//   bottom nav selection, focus rings, text-button color, splash/highlight
//   sab emerald me.
// - Dark default hai ([QuantChatTheme.fallback]); `of(context)` ambient
//   brightness se quantChat variant resolve karta hai.
//
// Chat-specific tweaks (note for later shifts): message bubbles ke liye
// dedicated bubble palette abhi scope me nahi — jab conversation view
// banega, tab `QuantChatTheme` par `incomingBubbleColor` /
// `outgoingBubbleColor` extension fields jodenge (token values ke saath).

import 'package:flutter/material.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// QuantChat app theme — Material 3, brand tokens se bana hua.
///
/// Product default: dark ([fallback]).
abstract final class QuantChatTheme {
  QuantChatTheme._();

  // -- QuantChat app themes --------------------------------------------------

  /// QuantChat app theme (dark): brand dark surfaces, QuantChat app accent
  /// emerald `#10B981` (from `packages/brand/src/apps.ts`, verified
  /// `QuantAppColors.quantchat`) as the secondary color, focus ring and app
  /// accent.
  static ThemeData get quantChatDark => _buildTheme(
        brightness: Brightness.dark,
        background: QuantColors.surfaceDark,
        foreground: const Color(0xFFF5F5F5),
        surface: QuantColors.surfaceDarkElevated,
        surfaceElevated: QuantColors.surfaceDarkOverlay,
        primary: QuantColors.primary500,
        onPrimary: const Color(0xFF111111),
        secondary: QuantAppColors.quantchat,
        onSecondary: const Color(0xFFFFFFFF),
        border: QuantColors.neutral700,
        muted: QuantColors.surfaceDarkOverlay,
        mutedForeground: QuantColors.neutral300,
        error: QuantColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: QuantAppColors.quantchat,
        appAccent: QuantAppColors.quantchat,
      );

  /// QuantChat app theme (light): brand light surfaces, QuantChat app accent
  /// emerald `#10B981` as the secondary color, focus ring and app accent.
  static ThemeData get quantChatLight => _buildTheme(
        brightness: Brightness.light,
        background: QuantColors.surfaceLight,
        foreground: const Color(0xFF0F172A),
        surface: QuantColors.surfaceLightElevated,
        surfaceElevated: QuantColors.surfaceLight,
        primary: const Color(0xFF4F46E5),
        onPrimary: const Color(0xFFFFFFFF),
        secondary: QuantAppColors.quantchat,
        onSecondary: const Color(0xFFFFFFFF),
        border: const Color(0xFFE2E8F0),
        muted: const Color(0xFFF1F5F9),
        mutedForeground: const Color(0xFF64748B),
        error: QuantColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: QuantAppColors.quantchat,
        appAccent: QuantAppColors.quantchat,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => quantChatDark;

  /// Returns the QuantChat theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// QuantChatTheme.quantChatLight, darkTheme: QuantChatTheme.quantChatDark,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? quantChatDark
          : quantChatLight;

  // -- Builder -----------------------------------------------------------------

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
      fontFamily: QuantTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: QuantTextStyles.h5.copyWith(color: foreground),
      ),
      cardTheme: CardTheme(
        color: surfaceElevated,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          side: BorderSide(color: border),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: border),
        ),
        titleTextStyle: QuantTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: QuantTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: QuantTextStyles.body.copyWith(color: mutedForeground),
        labelStyle: QuantTextStyles.bodySmall.copyWith(color: mutedForeground),
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
              const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
              const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
        contentTextStyle: QuantTextStyles.bodySmall.copyWith(color: foreground),
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

  /// Builds the brand text theme: [QuantTextStyles] ramp tinted with the
  /// theme foreground, secondary styles with the muted foreground.
  static TextTheme _textTheme(Color foreground, Color mutedForeground) {
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
