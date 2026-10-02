// ============================================================================
// ads_theme - typography tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `quant_typography.dart` (which ports
// `packages/brand/src/typography.ts`, SSOT).
//
// Mapping rules (same as foundation):
// - `rem` → logical px at the 16px root: `xs 0.75rem` → `12.0`, …
// - line-height `rem` → px the same way.
// - `fontWeight` numbers → the matching `FontWeight` constants.
// - letter-spacing `em` → `px = fontSize × em` (see [AdsTypography.tracking]).
// - No `.sp` anywhere: plain `double` logical pixels.
// - Font family names are the first entry of each TS stack; the rest of the
//   stack is represented by `fontFamilyFallback*` lists. Fonts are NOT
//   bundled by this package.

import 'package:flutter/material.dart';

/// Typography tokens for the QuantAds app, adapted from the brand SSOT.
///
/// [AdsTextStyles] holds the composed `TextStyle`s built from these tokens.
abstract final class AdsTypography {
  AdsTypography._();

  // -- Font families -------------------------------------------------------------

  /// `fontFamily.display` — Inter with system fallbacks.
  static const String fontFamilyDisplay = 'Inter';

  /// `fontFamily.body` — Inter with system fallbacks.
  static const String fontFamilyBody = 'Inter';

  /// `fontFamily.mono` — JetBrains Mono stack.
  static const String fontFamilyMono = 'JetBrains Mono';

  /// `fontFamily.indic` — Noto Sans Devanagari stack for Indic scripts.
  static const String fontFamilyIndic = 'Noto Sans Devanagari';

  /// `fontFamily.tamil`.
  static const String fontFamilyTamil = 'Noto Sans Tamil';

  /// `fontFamily.bengali`.
  static const String fontFamilyBengali = 'Noto Sans Bengali';

  /// `fontFamily.telugu`.
  static const String fontFamilyTelugu = 'Noto Sans Telugu';

  /// `fontFamily.gujarati`.
  static const String fontFamilyGujarati = 'Noto Sans Gujarati';

  /// System fallback list for Latin text (mirrors the tail of the TS stacks).
  static const List<String> fontFamilyFallbackLatin = <String>[
    'Inter',
    '-apple-system',
    'Segoe UI',
  ];

  /// Fallback list for Devanagari / Indic text (mirrors the TS `indic` stack).
  static const List<String> fontFamilyFallbackIndic = <String>[
    'Noto Sans Devanagari',
    'Inter',
  ];

  // -- Font sizes (px) ------------------------------------------------------------

  /// `fontSize.xs` — 0.75rem.
  static const double fontSizeXs = 12.0;

  /// `fontSize.sm` — 0.875rem.
  static const double fontSizeSm = 14.0;

  /// `fontSize.base` — 1rem.
  static const double fontSizeBase = 16.0;

  /// `fontSize.lg` — 1.125rem.
  static const double fontSizeLg = 18.0;

  /// `fontSize.xl` — 1.25rem.
  static const double fontSizeXl = 20.0;

  /// `fontSize.2xl` — 1.5rem.
  static const double fontSize2xl = 24.0;

  /// `fontSize.3xl` — 1.875rem.
  static const double fontSize3xl = 30.0;

  /// `fontSize.4xl` — 2.25rem.
  static const double fontSize4xl = 36.0;

  /// `fontSize.5xl` — 3rem.
  static const double fontSize5xl = 48.0;

  /// `fontSize.6xl` — 3.75rem.
  static const double fontSize6xl = 60.0;

  // -- Line heights (px) ------------------------------------------------------------

  /// `lineHeight.xs` — 1rem.
  static const double lineHeightXs = 16.0;

  /// `lineHeight.sm` — 1.25rem.
  static const double lineHeightSm = 20.0;

  /// `lineHeight.base` — 1.5rem.
  static const double lineHeightBase = 24.0;

  /// `lineHeight.lg` — 1.75rem.
  static const double lineHeightLg = 28.0;

  /// `lineHeight.xl` — 1.75rem.
  static const double lineHeightXl = 28.0;

  /// `lineHeight.2xl` — 2rem.
  static const double lineHeight2xl = 32.0;

  /// `lineHeight.3xl` — 2.25rem.
  static const double lineHeight3xl = 36.0;

  /// `lineHeight.4xl` — 2.5rem.
  static const double lineHeight4xl = 40.0;

  /// `lineHeight.5xl` — 3.5rem.
  static const double lineHeight5xl = 56.0;

  /// `lineHeight.6xl` — 4.5rem.
  static const double lineHeight6xl = 72.0;

  // -- Font weights -------------------------------------------------------------

  /// `fontWeight.thin` — 100.
  static const FontWeight fontWeightThin = FontWeight.w100;

  /// `fontWeight.extralight` — 200.
  static const FontWeight fontWeightExtraLight = FontWeight.w200;

  /// `fontWeight.light` — 300.
  static const FontWeight fontWeightLight = FontWeight.w300;

  /// `fontWeight.normal` — 400.
  static const FontWeight fontWeightNormal = FontWeight.w400;

  /// `fontWeight.medium` — 500.
  static const FontWeight fontWeightMedium = FontWeight.w500;

  /// `fontWeight.semibold` — 600.
  static const FontWeight fontWeightSemiBold = FontWeight.w600;

  /// `fontWeight.bold` — 700.
  static const FontWeight fontWeightBold = FontWeight.w700;

  /// `fontWeight.extrabold` — 800.
  static const FontWeight fontWeightExtraBold = FontWeight.w800;

  /// `fontWeight.black` — 900.
  static const FontWeight fontWeightBlack = FontWeight.w900;

  // -- Letter spacing (em fractions) -----------------------------------------------

  /// `letterSpacing.tighter` — `-0.05em`.
  static const double letterSpacingTighterEm = -0.05;

  /// `letterSpacing.tight` — `-0.025em`.
  static const double letterSpacingTightEm = -0.025;

  /// `letterSpacing.normal` — `0em`.
  static const double letterSpacingNormalEm = 0.0;

  /// `letterSpacing.wide` — `0.025em`.
  static const double letterSpacingWideEm = 0.025;

  /// `letterSpacing.wider` — `0.05em`.
  static const double letterSpacingWiderEm = 0.05;

  /// `letterSpacing.widest` — `0.1em`.
  static const double letterSpacingWidestEm = 0.1;

  /// Converts a TS `em` letter-spacing value to Flutter logical pixels:
  /// `tracking = fontSize × em`.
  static double tracking(double fontSize, double em) => fontSize * em;
}

/// Composed text styles built from [AdsTypography] tokens.
///
/// Each style combines the ramp's size, line height (expressed as Flutter's
/// `height` factor = `lineHeight / fontSize`), weight, and em→px tracking.
/// Styles carry no color: call `.copyWith(color: …)` or use the [AdsTheme]
/// text themes, which apply the theme foreground automatically.
///
/// Type ramp (display → overline) covers the full 12–60px brand scale.
abstract final class AdsTextStyles {
  AdsTextStyles._();

  /// 60px / 72px, bold, `-0.05em` → −3.0 tracking.
  static const TextStyle display = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize6xl,
    height: 72.0 / 60.0,
    fontWeight: AdsTypography.fontWeightBold,
    letterSpacing: -3.0,
  );

  /// 48px / 56px, bold, `-0.025em` → −1.2 tracking.
  static const TextStyle h1 = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize5xl,
    height: 56.0 / 48.0,
    fontWeight: AdsTypography.fontWeightBold,
    letterSpacing: -1.2,
  );

  /// 36px / 40px, bold, `-0.025em` → −0.9 tracking.
  static const TextStyle h2 = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize4xl,
    height: 40.0 / 36.0,
    fontWeight: AdsTypography.fontWeightBold,
    letterSpacing: -0.9,
  );

  /// 30px / 36px, semibold, `-0.025em` → −0.75 tracking.
  static const TextStyle h3 = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize3xl,
    height: 36.0 / 30.0,
    fontWeight: AdsTypography.fontWeightSemiBold,
    letterSpacing: -0.75,
  );

  /// 24px / 32px, semibold.
  static const TextStyle h4 = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize2xl,
    height: 32.0 / 24.0,
    fontWeight: AdsTypography.fontWeightSemiBold,
  );

  /// 20px / 28px, semibold.
  static const TextStyle h5 = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeXl,
    height: 28.0 / 20.0,
    fontWeight: AdsTypography.fontWeightSemiBold,
  );

  /// 18px / 28px, normal.
  static const TextStyle bodyLarge = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeLg,
    height: 28.0 / 18.0,
    fontWeight: AdsTypography.fontWeightNormal,
  );

  /// 16px / 24px, normal — the default body style.
  static const TextStyle body = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeBase,
    height: 24.0 / 16.0,
    fontWeight: AdsTypography.fontWeightNormal,
  );

  /// 14px / 20px, normal.
  static const TextStyle bodySmall = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: AdsTypography.fontWeightNormal,
  );

  /// 12px / 16px, normal, `0.025em` → 0.3 tracking — metadata, timestamps.
  static const TextStyle caption = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeXs,
    height: 16.0 / 12.0,
    fontWeight: AdsTypography.fontWeightNormal,
    letterSpacing: 0.3,
  );

  /// 14px / 20px, semibold, `0.025em` → 0.35 tracking — button labels.
  static const TextStyle button = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: AdsTypography.fontWeightSemiBold,
    letterSpacing: 0.35,
  );

  /// 12px / 16px, medium, `0.1em` → 1.2 tracking — section eyebrow labels.
  static const TextStyle overline = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSizeXs,
    height: 16.0 / 12.0,
    fontWeight: AdsTypography.fontWeightMedium,
    letterSpacing: 1.2,
  );

  /// 14px / 20px, normal, JetBrains Mono — code, hashes, IDs, amounts.
  static const TextStyle code = TextStyle(
    fontFamily: AdsTypography.fontFamilyMono,
    fontSize: AdsTypography.fontSizeSm,
    height: 20.0 / 14.0,
    fontWeight: AdsTypography.fontWeightNormal,
  );

  /// Devanagari-capable body style: 16px / 24px with the Noto Sans
  /// Devanagari fallback so mixed-script text never falls back to tofu.
  static const TextStyle bodyIndic = TextStyle(
    fontFamily: AdsTypography.fontFamilyBody,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackIndic,
    fontSize: AdsTypography.fontSizeBase,
    height: 24.0 / 16.0,
    fontWeight: AdsTypography.fontWeightNormal,
  );

  /// Metric figure: 30px / 36px, bold — dashboard stat values (spend, ROAS).
  static const TextStyle metric = TextStyle(
    fontFamily: AdsTypography.fontFamilyDisplay,
    fontFamilyFallback: AdsTypography.fontFamilyFallbackLatin,
    fontSize: AdsTypography.fontSize3xl,
    height: 36.0 / 30.0,
    fontWeight: AdsTypography.fontWeightBold,
    letterSpacing: -0.75,
  );
}
