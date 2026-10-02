// ============================================================================
// quantcooks_core - light + dark ThemeData for the QuantCooks editor
// ============================================================================
//
// Material 3 themes built from [CooksColors], [CooksTextStyles] and
// [CooksTypography]. Construction follows the `QuantTheme._buildTheme`
// pattern from `package:quant_foundation`.
//
// - `CooksTheme.dark()` — the PRIMARY theme: a dark-first editor where the
//   canvas recedes behind the media. This is the app default.
// - `CooksTheme.light()` — the light companion for bright environments.
// - `CooksTheme.of(context)` resolves the matching theme from the tree.
// - [CooksCanvasExtension] carries editor-canvas colors/gradients that have
//   no Material 3 slot (playhead, timeline surfaces, creative gradient).
//   Read it via `Theme.of(context).extension<CooksCanvasExtension>()`.

import 'package:flutter/material.dart';

import 'cooks_colors.dart';
import 'cooks_typography.dart';

/// Editor-canvas theme extension: colors and gradients with no Material 3
/// slot (playhead, timeline surfaces, creative CTA gradient).
///
/// TODO(UNVERIFIED): all default values are QuantCooks-specific proposals —
/// confirm with design.
@immutable
final class CooksCanvasExtension extends ThemeExtension<CooksCanvasExtension> {
  /// Deepest canvas — preview viewport / letterbox.
  final Color canvas;

  /// Timeline / track area background.
  final Color timelineSurface;

  /// Clip surface on the timeline.
  final Color clipSurface;

  /// Canvas grid lines / rulers.
  final Color canvasGrid;

  /// Transparency checkerboard, light cell.
  final Color checkerLight;

  /// Transparency checkerboard, dark cell.
  final Color checkerDark;

  /// Playhead line + handle.
  final Color playhead;

  /// Selected clip outline.
  final Color clipSelected;

  /// Trim-handle fill on clip edges.
  final Color trimHandle;

  /// Unplayed waveform bars.
  final Color waveform;

  /// Played waveform bars.
  final Color waveformPlayed;

  /// Creative-action gradient for Export / Publish CTAs.
  final LinearGradient creativeGradient;

  const CooksCanvasExtension({
    required this.canvas,
    required this.timelineSurface,
    required this.clipSurface,
    required this.canvasGrid,
    required this.checkerLight,
    required this.checkerDark,
    required this.playhead,
    required this.clipSelected,
    required this.trimHandle,
    required this.waveform,
    required this.waveformPlayed,
    required this.creativeGradient,
  });

  /// Canvas extension matching [CooksTheme.dark].
  static const CooksCanvasExtension dark = CooksCanvasExtension(
    canvas: CooksColors.canvas,
    timelineSurface: CooksColors.timelineSurface,
    clipSurface: CooksColors.clipSurface,
    canvasGrid: CooksColors.canvasGrid,
    checkerLight: CooksColors.checkerLight,
    checkerDark: CooksColors.checkerDark,
    playhead: CooksColors.playhead,
    clipSelected: CooksColors.clipSelected,
    trimHandle: CooksColors.trimHandle,
    waveform: CooksColors.waveform,
    waveformPlayed: CooksColors.waveformPlayed,
    creativeGradient: CooksGradients.creativeAction,
  );

  /// Canvas extension matching [CooksTheme.light].
  ///
  /// TODO(UNVERIFIED): light canvas values assumed, confirm with design.
  static const CooksCanvasExtension light = CooksCanvasExtension(
    canvas: Color(0xFFE9EAED),
    timelineSurface: Color(0xFFF4F5F7),
    clipSurface: Color(0xFFFFFFFF),
    canvasGrid: Color(0x14000000),
    checkerLight: Color(0xFFFFFFFF),
    checkerDark: Color(0xFFD8DADF),
    playhead: CooksColors.playhead,
    clipSelected: CooksColors.clipSelected,
    trimHandle: Color(0xFF111318),
    waveform: Color(0xFF83868E),
    waveformPlayed: CooksColors.waveformPlayed,
    creativeGradient: CooksGradients.creativeAction,
  );

  @override
  CooksCanvasExtension copyWith({
    Color? canvas,
    Color? timelineSurface,
    Color? clipSurface,
    Color? canvasGrid,
    Color? checkerLight,
    Color? checkerDark,
    Color? playhead,
    Color? clipSelected,
    Color? trimHandle,
    Color? waveform,
    Color? waveformPlayed,
    LinearGradient? creativeGradient,
  }) {
    return CooksCanvasExtension(
      canvas: canvas ?? this.canvas,
      timelineSurface: timelineSurface ?? this.timelineSurface,
      clipSurface: clipSurface ?? this.clipSurface,
      canvasGrid: canvasGrid ?? this.canvasGrid,
      checkerLight: checkerLight ?? this.checkerLight,
      checkerDark: checkerDark ?? this.checkerDark,
      playhead: playhead ?? this.playhead,
      clipSelected: clipSelected ?? this.clipSelected,
      trimHandle: trimHandle ?? this.trimHandle,
      waveform: waveform ?? this.waveform,
      waveformPlayed: waveformPlayed ?? this.waveformPlayed,
      creativeGradient: creativeGradient ?? this.creativeGradient,
    );
  }

  @override
  CooksCanvasExtension lerp(
      ThemeExtension<CooksCanvasExtension>? other, double t) {
    if (other is! CooksCanvasExtension) return this;
    Color lerpColor(Color a, Color b) => Color.lerp(a, b, t)!;
    return CooksCanvasExtension(
      canvas: lerpColor(canvas, other.canvas),
      timelineSurface: lerpColor(timelineSurface, other.timelineSurface),
      clipSurface: lerpColor(clipSurface, other.clipSurface),
      canvasGrid: lerpColor(canvasGrid, other.canvasGrid),
      checkerLight: lerpColor(checkerLight, other.checkerLight),
      checkerDark: lerpColor(checkerDark, other.checkerDark),
      playhead: lerpColor(playhead, other.playhead),
      clipSelected: lerpColor(clipSelected, other.clipSelected),
      trimHandle: lerpColor(trimHandle, other.trimHandle),
      waveform: lerpColor(waveform, other.waveform),
      waveformPlayed: lerpColor(waveformPlayed, other.waveformPlayed),
      creativeGradient: LinearGradient.lerp(
            creativeGradient,
            other.creativeGradient,
            t,
          ) ??
          creativeGradient,
    );
  }
}

/// Material 3 themes for the QuantCooks editor.
///
/// Dark is the default ([fallback]); the app boots with
/// `MaterialApp(theme: CooksTheme.light(), darkTheme: CooksTheme.dark(),
/// themeMode: ThemeMode.dark)`.
///
/// Gradient CTAs (Export / Publish) are NOT expressible in ButtonStyle:
/// build them as `Container(decoration: BoxDecoration(gradient:
/// CooksGradients.creativeAction))` + `InkWell`, reading the gradient from
/// `Theme.of(context).extension<CooksCanvasExtension>()`.
abstract final class CooksTheme {
  CooksTheme._();

  /// The QuantCooks dark editor theme — the product default.
  ///
  /// Canvas `#050607` (deeper than the ecosystem dark surface), timeline
  /// surfaces from [CooksColors], brand orange primary, creator rose
  /// `#FF4D6D` as secondary / focus ring (TODO(UNVERIFIED)).
  static ThemeData get dark => _buildTheme(
        brightness: Brightness.dark,
        background: CooksColors.canvas,
        foreground: const Color(0xFFF5F5F5),
        surface: CooksColors.timelineSurface,
        surfaceElevated: CooksColors.surfaceDarkElevated,
        primary: CooksColors.brandOrange,
        onPrimary: const Color(0xFF111111),
        secondary: CooksColors.creatorAccent,
        onSecondary: const Color(0xFFFFFFFF),
        border: CooksColors.borderDark,
        muted: CooksColors.surfaceDarkElevated,
        mutedForeground: CooksColors.mutedForegroundDark,
        error: CooksColors.errorStrong,
        onError: const Color(0xFFFFFFFF),
        focusRing: CooksColors.creatorAccent,
        canvasExtension: CooksCanvasExtension.dark,
      );

  /// The QuantCooks light theme.
  ///
  /// TODO(UNVERIFIED): light-theme role mapping assumed, confirm with
  /// design. Primary orange deepened to `primary.600` for contrast on
  /// white; canvas stays light-neutral so the editor chrome reads.
  static ThemeData get light => _buildTheme(
        brightness: Brightness.light,
        background: CooksColors.surfaceLight,
        foreground: const Color(0xFF0F172A),
        surface: const Color(0xFFF4F5F7),
        surfaceElevated: CooksColors.surfaceLight,
        primary: CooksColors.brandOrangePressed,
        onPrimary: const Color(0xFFFFFFFF),
        secondary: CooksColors.creatorAccent,
        onSecondary: const Color(0xFFFFFFFF),
        border: const Color(0xFFE2E8F0),
        muted: const Color(0xFFF1F5F9),
        mutedForeground: const Color(0xFF64748B),
        error: CooksColors.errorStrong,
        onError: const Color(0xFFFFFFFF),
        focusRing: CooksColors.brandOrangePressed,
        canvasExtension: CooksCanvasExtension.light,
      );

  /// The default theme for the app: dark-first editor.
  static ThemeData get fallback => dark;

  /// Returns the QuantCooks theme matching the ambient [Theme] brightness.
  ///
  /// Use this in widgets that must re-resolve the theme from the tree;
  /// the app itself boots with [fallback] (dark).
  static ThemeData of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;

  // -- Builder ---------------------------------------------------------------

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
    required CooksCanvasExtension canvasExtension,
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
      splashColor: secondary.withValues(alpha: 0.12),
      highlightColor: secondary.withValues(alpha: 0.08),
      disabledColor: mutedForeground.withValues(alpha: 0.38),
      fontFamily: CooksTypography.fontFamilyBody,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: foreground,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: CooksTextStyles.h5.copyWith(color: foreground),
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
        titleTextStyle: CooksTextStyles.h4.copyWith(color: foreground),
        contentTextStyle: CooksTextStyles.body.copyWith(color: foreground),
      ),
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: muted,
        hintStyle: CooksTextStyles.body.copyWith(color: mutedForeground),
        labelStyle: CooksTextStyles.bodySmall.copyWith(color: mutedForeground),
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
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(CooksTextStyles.button),
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
          foregroundColor: WidgetStatePropertyAll<Color>(secondary),
          textStyle:
              const WidgetStatePropertyAll<TextStyle>(CooksTextStyles.button),
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
              const WidgetStatePropertyAll<TextStyle>(CooksTextStyles.button),
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
        contentTextStyle: CooksTextStyles.bodySmall.copyWith(color: foreground),
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
        selectedLabelStyle: CooksTextStyles.caption,
        unselectedLabelStyle: CooksTextStyles.caption,
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: muted,
        labelStyle: CooksTextStyles.bodySmall.copyWith(color: foreground),
        secondaryLabelStyle:
            CooksTextStyles.bodySmall.copyWith(color: mutedForeground),
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
        textStyle: CooksTextStyles.caption.copyWith(
          color: isDark ? const Color(0xFF111111) : const Color(0xFFFFFFFF),
        ),
      ),
      extensions: <ThemeExtension<dynamic>>[canvasExtension],
    );
  }

  /// Builds the editor text theme: [CooksTextStyles] ramp tinted with the
  /// theme foreground, secondary styles with the muted foreground.
  static TextTheme _textTheme(Color foreground, Color mutedForeground) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, CooksTextStyles.display),
      displayMedium: on(foreground, CooksTextStyles.h1),
      displaySmall: on(foreground, CooksTextStyles.h2),
      headlineLarge: on(foreground, CooksTextStyles.h2),
      headlineMedium: on(foreground, CooksTextStyles.h3),
      headlineSmall: on(foreground, CooksTextStyles.h4),
      titleLarge: on(foreground, CooksTextStyles.h4),
      titleMedium: on(foreground, CooksTextStyles.h5),
      titleSmall: on(mutedForeground, CooksTextStyles.overline),
      bodyLarge: on(foreground, CooksTextStyles.bodyLarge),
      bodyMedium: on(foreground, CooksTextStyles.body),
      bodySmall: on(foreground, CooksTextStyles.bodySmall),
      labelLarge: on(foreground, CooksTextStyles.button),
      labelMedium: on(foreground, CooksTextStyles.code),
      labelSmall: on(mutedForeground, CooksTextStyles.caption),
    );
  }
}
