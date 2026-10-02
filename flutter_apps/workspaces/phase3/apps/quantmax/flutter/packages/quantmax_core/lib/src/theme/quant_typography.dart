// ============================================================================
// quantmax_core - QuantMax typography
// ============================================================================
//
// Adapted from `packages/brand/src/typography.ts` (SSOT, see phase0
// `quant_typography.dart`). QuantMax is feed-first: most text a viewer reads
// sits ON VIDEO (username, caption, music ticker, counts), so the overlay
// styles pin to white and never inherit the ambient theme foreground.
//
// Mapping rules:
// - Sizes from the brand ramp: xs 12, sm 14, base 16, lg 18, xl 20,
//   2xl 24, 3xl 30, 5xl 48.
// - Line heights as Flutter `height` factors = `lineHeightPx / fontSizePx`.
// - No `.sp` (flutter_screenutil): plain `double` logical pixels.
// - Fonts are NOT bundled: 'Inter' via app bundle or `google_fonts`
//   (optional); Indic fallback stacks prevent tofu on mixed-script text.

import 'package:flutter/material.dart';

/// Typography tokens shared by QuantMax overlay + app styles.
abstract final class QuantMaxTypography {
  QuantMaxTypography._();

  /// Display / headings font stack — Inter.
  static const String fontFamilyDisplay = 'Inter';

  /// Body / caption font stack — Inter.
  static const String fontFamilyBody = 'Inter';

  /// Devanagari / Indic fallback.
  static const String fontFamilyIndic = 'Noto Sans Devanagari';

  /// System fallback list for Latin text.
  static const List<String> fontFamilyFallbackLatin = <String>[
    'Inter',
    '-apple-system',
    'Segoe UI',
  ];

  /// Fallback list for Devanagari / Indic text.
  static const List<String> fontFamilyFallbackIndic = <String>[
    'Noto Sans Devanagari',
    'Inter',
  ];

  // -- Overlay size tokens -----------------------------------------------------

  /// Username row over video — 15px semibold.
  static const double overlayUsernameSize = 15.0;

  /// Video caption over video — 14px regular, up to 2 lines.
  static const double overlayCaptionSize = 14.0;

  /// Music ticker over video — 13px medium.
  static const double overlayTickerSize = 13.0;

  /// Engagement counts under rail icons (likes, comments) — 12px semibold.
  static const double overlayCountSize = 12.0;

  /// Empty-state display — 30px semibold.
  static const double emptyDisplaySize = 30.0;
}

/// Composed QuantMax text styles.
///
/// Two families:
/// - **overlay** styles (fixed white) for anything drawn on top of video —
///   use them directly in the feed player; they ignore theme brightness.
/// - **app** styles (no color) for profile, settings, auth, comment sheets —
///   they pick up color from [QuantMaxTypography.textTheme] or
///   `.copyWith(color: …)`.
abstract final class QuantMaxTextStyles {
  QuantMaxTextStyles._();

  // -- On-video overlay styles (fixed white) ----------------------------------

  /// 15px / 20px, semibold, white — username row over video.
  static const TextStyle videoUsername = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyDisplay,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 15.0,
    height: 20.0 / 15.0,
    fontWeight: FontWeight.w600,
    color: Color(0xFFFFFFFF),
  );

  /// 15px / 20px, semibold, white, Devanagari-safe — same row, Indic scripts.
  static const TextStyle videoUsernameIndic = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyDisplay,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackIndic,
    fontSize: 15.0,
    height: 20.0 / 15.0,
    fontWeight: FontWeight.w600,
    color: Color(0xFFFFFFFF),
  );

  /// 14px / 20px, regular, white — video caption, max 2 lines.
  static const TextStyle videoCaption = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 14.0,
    height: 20.0 / 14.0,
    fontWeight: FontWeight.w400,
    color: Color(0xFFFFFFFF),
  );

  /// 13px / 18px, medium, white 85% — scrolling music ticker.
  static const TextStyle videoMusicTicker = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 13.0,
    height: 18.0 / 13.0,
    fontWeight: FontWeight.w500,
    color: Color(0xD9FFFFFF),
  );

  /// 12px / 16px, semibold, white — like/comment/share counts on the rail.
  static const TextStyle videoCount = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 12.0,
    height: 16.0 / 12.0,
    fontWeight: FontWeight.w600,
    color: Color(0xFFFFFFFF),
  );

  /// 12px / 16px, medium, white 70% — "LIVE", badges, timestamps over video.
  static const TextStyle videoBadge = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 12.0,
    height: 16.0 / 12.0,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.6,
    color: Color(0xB3FFFFFF),
  );

  /// 11px / 14px, semibold, white — tiny labels (disc, "FOLLOW" pill).
  static const TextStyle videoMicro = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 11.0,
    height: 14.0 / 11.0,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
    color: Color(0xFFFFFFFF),
  );

  // -- App styles (theme-tinted, for non-video screens) ------------------------

  /// 30px / 36px, semibold — empty states ("No videos yet", errors).
  static const TextStyle emptyDisplay = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyDisplay,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 30.0,
    height: 36.0 / 30.0,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.75,
  );

  /// 20px / 28px, semibold — screen titles (Profile, Upload).
  static const TextStyle screenTitle = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyDisplay,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 20.0,
    height: 28.0 / 20.0,
    fontWeight: FontWeight.w600,
  );

  /// 16px / 24px, semibold — section headers, list titles.
  static const TextStyle sectionHeader = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyDisplay,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 16.0,
    height: 24.0 / 16.0,
    fontWeight: FontWeight.w600,
  );

  /// 16px / 24px, regular — default body.
  static const TextStyle body = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 16.0,
    height: 24.0 / 16.0,
    fontWeight: FontWeight.w400,
  );

  /// 14px / 20px, regular — secondary body, comment text.
  static const TextStyle bodySmall = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 14.0,
    height: 20.0 / 14.0,
    fontWeight: FontWeight.w400,
  );

  /// 14px / 20px, semibold — comment author names, tappable names.
  static const TextStyle bodySmallEmphasis = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 14.0,
    height: 20.0 / 14.0,
    fontWeight: FontWeight.w600,
  );

  /// 12px / 16px, regular — timestamps, metadata, tab labels (inactive).
  static const TextStyle caption = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 12.0,
    height: 16.0 / 12.0,
    fontWeight: FontWeight.w400,
  );

  /// 14px / 20px, semibold, 0.025em tracking — button labels.
  static const TextStyle button = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 14.0,
    height: 20.0 / 14.0,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.35,
  );

  /// 12px / 16px, medium, 0.1em tracking — tab labels, section eyebrows.
  static const TextStyle overline = TextStyle(
    fontFamily: QuantMaxTypography.fontFamilyBody,
    fontFamilyFallback: QuantMaxTypography.fontFamilyFallbackLatin,
    fontSize: 12.0,
    height: 16.0 / 12.0,
    fontWeight: FontWeight.w500,
    letterSpacing: 1.2,
  );

  // -- TextTheme mapping ---------------------------------------------------------

  /// Builds the Material [TextTheme] for non-video screens: [app] styles
  /// tinted with the theme foreground, secondary styles with the muted
  /// foreground.
  ///
  /// On-video overlay styles are NOT in this mapping — they are fixed-white
  /// and used directly from [QuantMaxTextStyles].
  static TextTheme textTheme(Color foreground, Color mutedForeground) {
    TextStyle on(Color c, TextStyle s) => s.copyWith(color: c);
    return TextTheme(
      displayLarge: on(foreground, QuantMaxTextStyles.emptyDisplay),
      displayMedium: on(foreground, QuantMaxTextStyles.emptyDisplay),
      displaySmall: on(foreground, QuantMaxTextStyles.screenTitle),
      headlineLarge: on(foreground, QuantMaxTextStyles.screenTitle),
      headlineMedium: on(foreground, QuantMaxTextStyles.screenTitle),
      headlineSmall: on(foreground, QuantMaxTextStyles.sectionHeader),
      titleLarge: on(foreground, QuantMaxTextStyles.sectionHeader),
      titleMedium: on(foreground, QuantMaxTextStyles.bodySmallEmphasis),
      titleSmall: on(mutedForeground, QuantMaxTextStyles.overline),
      bodyLarge: on(foreground, QuantMaxTextStyles.body),
      bodyMedium: on(foreground, QuantMaxTextStyles.bodySmall),
      bodySmall: on(mutedForeground, QuantMaxTextStyles.caption),
      labelLarge: on(foreground, QuantMaxTextStyles.button),
      labelMedium: on(foreground, QuantMaxTextStyles.bodySmallEmphasis),
      labelSmall: on(mutedForeground, QuantMaxTextStyles.caption),
    );
  }
}
