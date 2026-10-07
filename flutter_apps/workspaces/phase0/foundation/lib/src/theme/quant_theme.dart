// ============================================================================
// quant_foundation - light + dark ThemeData
// ============================================================================
//
// Material 3 themes built from the verified brand tokens in
// `packages/brand/src/themes.ts` (SSOT), wired with the color, typography and
// motion tokens from the sibling files in this directory.
//
// - `QuantTheme.brandDark` / `QuantTheme.brandLight` — the ecosystem themes,
//   brand orange primary (`#FF8C42` dark, indigo `#4F46E5` light).
// - `QuantTheme.quantMailDark` / `QuantTheme.quantMailLight` — the QuantMail
//   app theme: identical surfaces, but the app accent blue `#3B82F6`
//   (from `packages/brand/src/apps.ts`) takes the secondary / focus-ring role.
// - Dark is the default theme (see [QuantTheme.fallback]).
// - `QuantTheme.of(context)` returns the brand theme matching the ambient
//   brightness, so widgets stay theme-aware without extra plumbing.

import 'package:flutter/material.dart';

import 'quant_colors.dart';
import 'quant_typography.dart';

/// Brand themes for the QuantMail omnipresent Flutter clients.
///
/// All themes are Material 3 (`useMaterial3: true`) and are built from the
/// verified tokens in `packages/brand/src/themes.ts` plus the sibling token
/// files. The `dark` brand theme is the product default.
abstract final class QuantTheme {
  QuantTheme._();

  // -- Brand themes ----------------------------------------------------------

  /// The ecosystem dark theme — the default theme of the app.
  ///
  /// Port of `dark` in `packages/brand/src/themes.ts`: canvas `#090A0C`,
  /// surface `#111318`, primary orange `#FF8C42`, border `#282C35`,
  /// destructive `#DC2626` (white label, AA).
  static ThemeData get brandDark => _buildTheme(
        brightness: Brightness.dark,
        background: QuantColors.surfaceDark,
        foreground: const Color(0xFFF5F5F5),
        surface: QuantColors.surfaceDarkElevated,
        surfaceElevated: QuantColors.surfaceDarkOverlay,
        primary: QuantColors.primary500,
        onPrimary: const Color(0xFF111111),
        secondary: QuantColors.primary300,
        onSecondary: const Color(0xFF111111),
        border: QuantColors.neutral700,
        muted: QuantColors.surfaceDarkOverlay,
        mutedForeground: QuantColors.neutral300,
        error: QuantColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: QuantColors.primary500,
        appAccent: null,
      );

  /// The ecosystem light theme.
  ///
  /// Port of `light` in `packages/brand/src/themes.ts`: primary indigo
  /// `#4F46E5`, accent `#D97706`, border `#E2E8F0`, foreground `#0F172A`.
  static ThemeData get brandLight => _buildTheme(
        brightness: Brightness.light,
        background: QuantColors.surfaceLight,
        foreground: const Color(0xFF0F172A),
        surface: QuantColors.surfaceLightElevated,
        surfaceElevated: QuantColors.surfaceLight,
        primary: const Color(0xFF4F46E5),
        onPrimary: const Color(0xFFFFFFFF),
        secondary: QuantColors.accent600,
        onSecondary: const Color(0xFF000000),
        border: const Color(0xFFE2E8F0),
        muted: const Color(0xFFF1F5F9),
        mutedForeground: const Color(0xFF64748B),
        error: QuantColors.error600,
        onError: const Color(0xFFFFFFFF),
        focusRing: const Color(0xFF4F46E5),
        appAccent: null,
      );

  // -- QuantMail app themes ----------------------------------------------------

  /// QuantMail app theme (dark): brand dark surfaces with the QuantMail app
  /// accent blue `#3B82F6` (from `packages/brand/src/apps.ts`) as the
  /// secondary color and focus ring.
  ///
  /// P2-11 decision 2026-10-03: single orange accent — TextButton foreground,
  /// consent icon and secondary actions speak the orange primary CTA
  /// language, not the blue appAccent. Reversible from one place:
  /// [_quantMailPolish] — design-atelier reverse kar sakta hai.
  static ThemeData get quantMailDark => _quantMailPolish(
        _buildTheme(
          brightness: Brightness.dark,
          background: QuantColors.surfaceDark,
          foreground: const Color(0xFFF5F5F5),
          surface: QuantColors.surfaceDarkElevated,
          surfaceElevated: QuantColors.surfaceDarkOverlay,
          primary: QuantColors.primary500,
          onPrimary: const Color(0xFF111111),
          secondary: QuantAppColors.quantmail,
          onSecondary: const Color(0xFFFFFFFF),
          border: QuantColors.neutral700,
          muted: QuantColors.surfaceDarkOverlay,
          mutedForeground: QuantColors.neutral300,
          error: QuantColors.error600,
          onError: const Color(0xFFFFFFFF),
          focusRing: QuantAppColors.quantmail,
          appAccent: QuantAppColors.quantmail,
        ),
        brightness: Brightness.dark,
      );

  /// QuantMail app theme (light): brand light surfaces with the lava accent
  /// `#C2410C` as the single brand voice.
  ///
  /// P2-24 decision 2026-10-04 (design-atelier): single lava accent — light
  /// primary is lava-deep `#C2410C`; indigo `#4F46E5` removed (Gmail pattern:
  /// one accent hue per app, tonal per-mode adapt — see
  /// design-atelier/tokens/LAVA_TOKENS_SPEC.md). Reversible from one place:
  /// the `primary:` line below. [_quantMailPolish] is fully
  /// scheme-relative: focus, chips, and tonal containers follow
  /// `scheme.primary` automatically.
  static ThemeData get quantMailLight => _quantMailPolish(
        _buildTheme(
          brightness: Brightness.light,
          background: QuantColors.surfaceLight,
          foreground: const Color(0xFF0F172A),
          surface: QuantColors.surfaceLightElevated,
          surfaceElevated: QuantColors.surfaceLight,
          primary: const Color(0xFFC2410C), // P2-24: lava-deep (5.18:1 on white)
          onPrimary: const Color(0xFFFFFFFF),
          secondary: QuantAppColors.quantmail,
          onSecondary: const Color(0xFFFFFFFF),
          border: const Color(0xFFE2E8F0),
          muted: const Color(0xFFF1F5F9),
          mutedForeground: const Color(0xFF64748B),
          error: QuantColors.error600,
          onError: const Color(0xFFFFFFFF),
          focusRing: QuantAppColors.quantmail,
          appAccent: QuantAppColors.quantmail,
        ),
        brightness: Brightness.light,
      );

  /// The default theme for the app: dark-first.
  static ThemeData get fallback => brandDark;

  /// Returns the brand theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark) via `MaterialApp(theme:
  /// QuantTheme.brandLight, darkTheme: QuantTheme.brandDark,
  /// themeMode: ThemeMode.dark)`.
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? brandDark : brandLight;

  // -- Builder ------------------------------------------------------------------

  /// QuantMail-only polish applied on top of [_buildTheme].
  ///
  /// Surgical override point for the quantMail themes ONLY — the shared
  /// [_buildTheme] defaults (used by brandDark/brandLight and the whole
  /// fleet) are never touched here. Everything below is reversible by
  /// editing this one method (design-atelier can reverse the P2-11 call).
  static ThemeData _quantMailPolish(
    ThemeData base, {
    required Brightness brightness,
  }) {
    final bool isDark = brightness == Brightness.dark;
    final ColorScheme scheme = base.colorScheme;
    return base.copyWith(
      // VQA-P2-22 (2026-10-04): blue-appAccent resurfacing kill —
      // `focusColor` on ThemeData (was focusRing blue `#3B82F6` from
      // [_buildTheme]) now follows scheme.primary, so focus glow,
      // FocusRing widgets and any focusColor consumers speak the theme
      // accent, not blue. Mirrors the P2-11 single-accent call.
      focusColor: scheme.primary,
      // VQA-P2-03: explicit dark-mode error container — deep desaturated
      // red bg + light red text (error ramp), instead of the loud derived
      // fallback that rendered full-saturation #DC2626 on #090A0C.
      //
      // VQA-P2-22 (2026-10-04): secondaryContainer / onSecondaryContainer
      // derived from scheme.primary, not the blue `secondary`
      // (`#3B82F6`). Selected FilterChip "Unread" and error-state
      // FilledButton.tonal "Retry" read these slots; they now tint from
      // the accent primary. Scheme-relative by design: a future primary
      // flip (see [quantMailLight]) needs no code change here.
      colorScheme: scheme.copyWith(
        errorContainer:
            isDark ? const Color(0xFF3A1214) : QuantColors.error100,
        onErrorContainer:
            isDark ? QuantColors.error300 : QuantColors.error900,
        secondaryContainer: Color.alphaBlend(
          scheme.primary.withValues(alpha: 0.18),
          scheme.surface,
        ),
        onSecondaryContainer: scheme.primary,
      ),
      // VQA-P2-04: Indic font fallback per DESIGN_TOKENS §3a — Devanagari
      // falls back to Noto Sans Devanagari, then Inter. ThemeData.copyWith
      // has no fontFamilyFallback slot, so this mirrors what the ThemeData
      // constructor itself does: apply the fallback to textTheme +
      // primaryTextTheme.
      textTheme: base.textTheme.apply(
        fontFamilyFallback: QuantTypography.fontFamilyFallbackIndic,
      ),
      primaryTextTheme: base.primaryTextTheme.apply(
        fontFamilyFallback: QuantTypography.fontFamilyFallbackIndic,
      ),
      // VQA-P2-05: disabled ElevatedButton dims (M3: onSurface @ 12%
      // container, onSurface @ 38% label) instead of staying full-orange
      // via WidgetStatePropertyAll(primary).
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStateProperty.resolveWith<Color>(
            (Set<WidgetState> states) =>
                states.contains(WidgetState.disabled)
                    ? scheme.onSurface.withValues(alpha: 0.12)
                    : scheme.primary,
          ),
          foregroundColor: WidgetStateProperty.resolveWith<Color>(
            (Set<WidgetState> states) =>
                states.contains(WidgetState.disabled)
                    ? scheme.onSurface.withValues(alpha: 0.38)
                    : scheme.onPrimary,
          ),
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
      // P2-11 decision 2026-10-03: single orange accent — TextButton speaks
      // the primary CTA language, not the blue appAccent.
      // design-atelier reverse kar sakta hai (revert to
      // `base.textButtonTheme`).
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStatePropertyAll<Color>(scheme.primary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(10)),
            ),
          ),
        ),
      ),
      // VQA-P2-22 (2026-10-04): focused search-field border follows
      // scheme.primary, not the blue focusRing from [_buildTheme].
      // BorderRadius mirrors the base (10) — shape stays identical.
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
      ),
      // VQA-P2-22 (2026-10-04): selected FilterChip ("Unread") speaks the
      // accent primary — selectedColor/checkmark derive from
      // scheme.primary/scheme.onPrimary instead of the blue `secondary`.
      // Selected label rides the primary too (secondaryLabelStyle), so the
      // label stays legible on the tinted fill.
      chipTheme: base.chipTheme.copyWith(
        selectedColor: scheme.primary,
        checkmarkColor: scheme.onPrimary,
        secondaryLabelStyle:
            QuantTextStyles.bodySmall.copyWith(color: scheme.onPrimary),
      ),
    );
  }

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
        titleTextStyle: QuantTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: QuantTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: QuantTextStyles.body.copyWith(color: mutedForeground),
        labelStyle: QuantTextStyles.bodySmall.copyWith(color: mutedForeground),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
          textStyle: const WidgetStatePropertyAll<TextStyle>(QuantTextStyles.button),
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
