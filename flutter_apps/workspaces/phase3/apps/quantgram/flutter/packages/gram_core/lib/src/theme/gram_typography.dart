// ============================================================================
// gram_core - typography tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `QuantTypography` / `QuantTextStyles`,
// trimmed and re-voiced for QuantGram's feed-first UI.
//
// Differences from the foundation ramp:
// - Font family is the platform system default (no brand font bundled yet;
//   see TODO below). Feed text must render instantly on every device, so no
//   bundled TTF / google_fonts dependency is required for shift 1.
// - Feed-oriented extras on [GramTextStyles]: [GramTextStyles.storyLabel],
//   [GramTextStyles.username], [GramTextStyles.timestamp], and
//   [GramTextStyles.caption] for post captions.
//
// Mapping rules (kept from the foundation port):
// - `rem` -> logical px at the 16px root: xs 0.75rem -> 12.0, etc.
// - line-height rem -> px; Flutter `height` factor = lineHeight / fontSize.
// - fontWeight numbers -> matching `FontWeight` constants.
// - letter-spacing em -> px = fontSize x em.

import 'package:flutter/material.dart';

/// Typography tokens for QuantGram.
///
/// TODO(brand-font): pick and bundle a brand display font (candidate: same
/// family as the web `display` stack). Until then every style falls back to
/// the system font via [fontFamilyDefault].
abstract final class GramTypography {
  GramTypography._();

  // -- Font families ---------------------------------------------------------

  /// Brand font slot — `null` until the brand font decision lands, which
  /// makes [GramTextStyles] fall back to the platform system font.
  static const String? fontFamilyDefault = null;

  /// Mono stack for IDs, hashes, debug surfaces.
  static const String fontFamilyMono = 'JetBrains Mono';

  // -- Font sizes (px) -------------------------------------------------------

  /// xs — 0.75rem.
  static const double fontSizeXs = 12.0;

  /// sm — 0.875rem.
  static const double fontSizeSm = 14.0;

  /// base — 1rem.
  static const double fontSizeBase = 16.0;

  /// lg — 1.125rem.
  static const double fontSizeLg = 18.0;

  /// xl — 1.25rem.
  static const double fontSizeXl = 20.0;

  /// 2xl — 1.5rem.
  static const double fontSize2xl = 24.0;

  /// 3xl — 1.875rem.
  static const double fontSize3xl = 30.0;

  /// 4xl — 2.25rem.
  static const double fontSize4xl = 36.0;

  /// 5xl — 3rem.
  static const double fontSize5xl = 48.0;

  // -- Line heights (px) -----------------------------------------------------

  /// lineHeight.xs — 1rem.
  static const double lineHeightXs = 16.0;

  /// lineHeight.sm — 1.25rem.
  static const double lineHeightSm = 20.0;

  /// lineHeight.base — 1.5rem.
  static const double lineHeightBase = 24.0;

  /// lineHeight.lg — 1.75rem.
  static const double lineHeightLg = 28.0;

  /// lineHeight.xl — 1.75rem.
  static const double lineHeightXl = 28.0;

  /// lineHeight.2xl — 2rem.
  static const double lineHeight2xl = 32.0;

  /// lineHeight.3xl — 2.25rem.
  static const double lineHeight3xl = 36.0;

  /// lineHeight.4xl — 2.5rem.
  static const double lineHeight4xl = 40.0;

  /// lineHeight.5xl — 3.5rem.
  static const double lineHeight5xl = 56.0;

  // -- Font weights ----------------------------------------------------------

  /// 400.
  static const FontWeight fontWeightNormal = FontWeight.w400;

  /// 500.
  static const FontWeight fontWeightMedium = FontWeight.w500;

  /// 600.
  static const FontWeight fontWeightSemiBold = FontWeight.w600;

  /// 700.
  static const FontWeight fontWeightBold = FontWeight.w700;

  /// 800.
  static const FontWeight fontWeightExtraBold = FontWeight.w800;
}

/// Composed text styles built from [GramTypography] tokens.
///
/// Styles carry no color: call `.copyWith(color: ...)` or use the
/// [GramTheme] text theme, which applies the theme foreground automatically.
abstract final class GramTextStyles {
  GramTextStyles._();

  /// 48px / 56px, bold, `-0.025em` -> -1.2 tracking — hero headlines.
  static const TextStyle display = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSize5xl,
    height: 56.0 / 48.0,
    fontWeight: GramTypography.fontWeightBold,
    letterSpacing: -1.2,
  );

  /// 36px / 40px, bold, `-0.025em` -> -0.9 tracking.
  static const TextStyle h1 = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSize4xl,
    height: 40.0 / 36.0,
    fontWeight: GramTypography.fontWeightBold,
    letterSpacing: -0.9,
  );

  /// 30px / 36px, semibold, `-0.025em` -> -0.75 tracking.
  static const TextStyle h2 = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSize3xl,
    height: 36.0 / 30.0,
    fontWeight: GramTypography.fontWeightSemiBold,
    letterSpacing: -0.75,
  );

  /// 24px / 32px, semibold.
  static const TextStyle h3 = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSize2xl,
    height: 32.0 / 24.0,
    fontWeight: GramTypography.fontWeightSemiBold,
  );

  /// 20px / 28px, semibold.
  static const TextStyle h4 = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeXl,
    height: 28.0 / 20.0,
    fontWeight: GramTypography.fontWeightSemiBold,
  );

  /// 18px / 28px, normal.
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeLg,
    height: 28.0 / 18.0,
    fontWeight: GramTypography.fontWeightNormal,
  );

  /// 16px / 24px, normal — the default body style.
  static const TextStyle body = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeBase,
    height: 24.0 / 16.0,
    fontWeight: GramTypography.fontWeightNormal,
  );

  /// 14px / 20px, normal.
  static const TextStyle bodySmall = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: GramTypography.fontWeightNormal,
  );

  /// 14px / 20px, semibold, `0.025em` -> 0.35 tracking — button labels.
  static const TextStyle button = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: GramTypography.fontWeightSemiBold,
    letterSpacing: 0.35,
  );

  /// 12px / 16px, medium, `0.1em` -> 1.2 tracking — section eyebrow labels.
  static const TextStyle overline = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeXs,
    height: 16.0 / 12.0,
    fontWeight: GramTypography.fontWeightMedium,
    letterSpacing: 1.2,
  );

  // -- Feed-oriented styles ---------------------------------------------------

  /// 12px / 16px, semibold — story ring labels under avatars.
  static const TextStyle storyLabel = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeXs,
    height: 16.0 / 12.0,
    fontWeight: GramTypography.fontWeightSemiBold,
  );

  /// 14px / 20px, semibold — post/comment author names.
  static const TextStyle username = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: GramTypography.fontWeightSemiBold,
  );

  /// 14px / 20px, normal — post caption body text.
  static const TextStyle caption = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: GramTypography.fontWeightNormal,
  );

  /// 12px / 16px, normal, `0.025em` -> 0.3 tracking — relative times,
  /// metadata, "2h", "1d".
  static const TextStyle timestamp = TextStyle(
    fontFamily: GramTypography.fontFamilyDefault,
    fontSize: GramTypography.fontSizeXs,
    height: 16.0 / 12.0,
    fontWeight: GramTypography.fontWeightNormal,
    letterSpacing: 0.3,
  );

  /// 14px / 20px, normal, JetBrains Mono — IDs, hashes, debug surfaces.
  static const TextStyle code = TextStyle(
    fontFamily: GramTypography.fontFamilyMono,
    fontSize: GramTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: GramTypography.fontWeightNormal,
  );
}
