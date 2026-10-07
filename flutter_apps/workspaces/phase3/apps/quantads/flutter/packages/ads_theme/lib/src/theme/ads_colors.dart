// ============================================================================
// ads_theme - color tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `quant_colors.dart` (which ports
// `packages/brand/src/colors.ts`, SSOT). All brand ramps are preserved 1:1
// so QuantAds widgets shade exactly like the rest of the ecosystem.
//
// Ads-specific additions:
// - The amber/gold accent ramp (`adsAmber*`) is promoted to the app's primary
//   accent for campaign/CTA surfaces (`#F59E0B`-derived roles, light + dark).
// - Semantic roles for ads flows: earning (success green), spend (error
//   red), and credits-gold (the Quant Credits economy, bet #2).
//
// Mapping rules (same as foundation): TS hex → `Color(0xFF…)` compile-time
// constants; naming `AdsColors.adsAmber500` etc. All values are `const`.

import 'package:flutter/material.dart';

/// Color tokens for the QuantAds app: brand ramps + ads-specific accents.
///
/// All values are `const`, so they can be used in `const` widget trees.
abstract final class AdsColors {
  AdsColors._();

  // -- Primary (brand orange) ramp -------------------------------------------

  /// `primary.50`
  static const Color primary50 = Color(0xFFFFF7ED);

  /// `primary.100`
  static const Color primary100 = Color(0xFFFFEDD5);

  /// `primary.200`
  static const Color primary200 = Color(0xFFFED7AA);

  /// `primary.300`
  static const Color primary300 = Color(0xFFFFB875);

  /// `primary.400`
  static const Color primary400 = Color(0xFFFF9B5A);

  /// `primary.500` — primary brand orange.
  static const Color primary500 = Color(0xFFFF8C42);

  /// `primary.600` — pressed state.
  static const Color primary600 = Color(0xFFE8752F);

  /// `primary.700`
  static const Color primary700 = Color(0xFFC75D1E);

  /// `primary.800` — brand soft.
  static const Color primary800 = Color(0xFF2B1A11);

  /// `primary.900` — brand subtle.
  static const Color primary900 = Color(0xFF1D1410);

  /// `primary.950`
  static const Color primary950 = Color(0xFF110C0A);

  // -- Neutral (slate) ramp ---------------------------------------------------

  /// `neutral.50`
  static const Color neutral50 = Color(0xFFF5F5F5);

  /// `neutral.100`
  static const Color neutral100 = Color(0xFFE4E5E8);

  /// `neutral.200`
  static const Color neutral200 = Color(0xFFC5C7CD);

  /// `neutral.300`
  static const Color neutral300 = Color(0xFFA1A4AC);

  /// `neutral.400`
  static const Color neutral400 = Color(0xFF83868E);

  /// `neutral.500`
  static const Color neutral500 = Color(0xFF6B6E76);

  /// `neutral.600`
  static const Color neutral600 = Color(0xFF4A4D55);

  /// `neutral.700` — border default (dark theme).
  static const Color neutral700 = Color(0xFF282C35);

  /// `neutral.800` — elevated surface (dark theme).
  static const Color neutral800 = Color(0xFF16181D);

  /// `neutral.900` — primary surface (dark theme).
  static const Color neutral900 = Color(0xFF111318);

  /// `neutral.950` — canvas (dark theme background).
  static const Color neutral950 = Color(0xFF090A0C);

  // -- Ads accent (amber/gold) ramp ------------------------------------------
  //
  // Ported 1:1 from the brand `accent` ramp; promoted to QuantAds' primary
  // campaign/CTA accent. `#F59E0B`-derived light/dark roles live on
  // [AdsCtaColors]; this ramp keeps the full 50–950 stops.

  /// `accent.50`
  static const Color adsAmber50 = Color(0xFFFFFBEB);

  /// `accent.100`
  static const Color adsAmber100 = Color(0xFFFEF3C7);

  /// `accent.200`
  static const Color adsAmber200 = Color(0xFFFDE68A);

  /// `accent.300`
  static const Color adsAmber300 = Color(0xFFFCD34D);

  /// `accent.400`
  static const Color adsAmber400 = Color(0xFFFBBF24);

  /// `accent.500` — the QuantAds campaign accent.
  static const Color adsAmber500 = Color(0xFFF59E0B);

  /// `accent.600`
  static const Color adsAmber600 = Color(0xFFD97706);

  /// `accent.700`
  static const Color adsAmber700 = Color(0xFFB45309);

  /// `accent.800`
  static const Color adsAmber800 = Color(0xFF92400E);

  /// `accent.900`
  static const Color adsAmber900 = Color(0xFF78350F);

  /// `accent.950`
  static const Color adsAmber950 = Color(0xFF451A03);

  // -- Semantic: error (red) ---------------------------------------------------

  /// `semantic.error.50`
  static const Color error50 = Color(0xFFFEF2F2);

  /// `semantic.error.100`
  static const Color error100 = Color(0xFFFEE2E2);

  /// `semantic.error.200`
  static const Color error200 = Color(0xFFFECACA);

  /// `semantic.error.300`
  static const Color error300 = Color(0xFFFCA5A5);

  /// `semantic.error.400`
  static const Color error400 = Color(0xFFF87171);

  /// `semantic.error.500`
  static const Color error500 = Color(0xFFEF4444);

  /// `semantic.error.600` — destructive surface (meets AA with white label).
  static const Color error600 = Color(0xFFDC2626);

  /// `semantic.error.700`
  static const Color error700 = Color(0xFFB91C1C);

  /// `semantic.error.800`
  static const Color error800 = Color(0xFF991B1B);

  /// `semantic.error.900`
  static const Color error900 = Color(0xFF7F1D1D);

  /// `semantic.error.950`
  static const Color error950 = Color(0xFF450A0A);

  // -- Semantic: warning (amber) ------------------------------------------------

  /// `semantic.warning.500`
  static const Color warning500 = Color(0xFFF59E0B);

  /// `semantic.warning.600`
  static const Color warning600 = Color(0xFFD97706);

  /// `semantic.warning.700`
  static const Color warning700 = Color(0xFFB45309);

  // -- Semantic: success (green) ------------------------------------------------
  //
  // Used for the "earning" direction of ads flows (payouts, ROI gains).

  /// `semantic.success.500`
  static const Color success500 = Color(0xFF22C55E);

  /// `semantic.success.600`
  static const Color success600 = Color(0xFF16A34A);

  /// `semantic.success.700`
  static const Color success700 = Color(0xFF15803D);

  /// `semantic.success.100`
  static const Color success100 = Color(0xFFDCFCE7);

  // -- Semantic: info (blue) ----------------------------------------------------

  /// `semantic.info.500`
  static const Color info500 = Color(0xFF3B82F6);

  /// `semantic.info.600`
  static const Color info600 = Color(0xFF2563EB);

  // -- Surfaces -----------------------------------------------------------------

  /// `surface.dark` — canvas, dark theme background.
  static const Color surfaceDark = Color(0xFF090A0C);

  /// `surface.darkElevated` — primary surface, dark theme.
  static const Color surfaceDarkElevated = Color(0xFF111318);

  /// `surface.darkOverlay` — elevated surface, dark theme.
  static const Color surfaceDarkOverlay = Color(0xFF16181D);

  /// `surface.light` — canvas, light theme background.
  static const Color surfaceLight = Color(0xFFFFFFFF);

  /// `surface.lightElevated` — primary surface, light theme.
  static const Color surfaceLightElevated = Color(0xFFF8F9FA);

  /// `surface.lightOverlay` — elevated surface, light theme.
  static const Color surfaceLightOverlay = Color(0xFFF1F3F5);

  // -- QuantAds app accent --------------------------------------------------------
  //
  // The per-app brand accent from `packages/brand/src/apps.ts` (QuantAds
  // entry). The amber ramp is the campaign/CTA accent; this emerald is kept
  // for product identity surfaces where the app mark appears.

  /// QuantAds — advertising and marketing campaigns.
  static const Color quantAds = Color(0xFF059669);
}

/// Campaign/CTA accent roles: `#F59E0B`-derived, light + dark.
///
/// Use these for primary CTAs ("Launch campaign", "Top up credits"), active
/// campaign status accents, and highlight surfaces. Derived roles reuse the
/// [AdsColors.adsAmber] ramp stops.
abstract final class AdsCtaColors {
  AdsCtaColors._();

  /// Light theme CTA surface: `accent.600` — meets AA with white labels.
  static const Color ctaLight = AdsColors.adsAmber600;

  /// Light theme on-CTA label.
  static const Color onCtaLight = Color(0xFFFFFFFF);

  /// Dark theme CTA surface: `accent.500`.
  static const Color ctaDark = AdsColors.adsAmber500;

  /// Dark theme on-CTA label.
  static const Color onCtaDark = Color(0xFF451A03);

  /// Focus ring on both themes.
  static const Color focusRing = AdsColors.adsAmber500;

  /// Subtle tinted CTA container, light theme.
  static const Color containerLight = AdsColors.adsAmber100;

  /// Subtle tinted CTA container, dark theme.
  static const Color containerDark = AdsColors.adsAmber950;

  /// On-container label, light theme.
  static const Color onContainerLight = AdsColors.adsAmber900;

  /// On-container label, dark theme.
  static const Color onContainerDark = AdsColors.adsAmber200;
}

/// Semantic colors for ads flows: earning, spend, and Quant Credits.
///
/// Direction-of-money roles used by dashboards, wallet, and campaign
/// analytics. Values are stops from the brand semantic ramps above.
abstract final class AdsSemanticColors {
  AdsSemanticColors._();

  // -- Earning (green) ----------------------------------------------------------

  /// Earning/payout surface, light theme: `semantic.success.600`.
  static const Color earningLight = AdsColors.success600;

  /// Earning/payout surface, dark theme: `semantic.success.500`.
  static const Color earningDark = AdsColors.success500;

  /// On-earning label.
  static const Color onEarning = Color(0xFFFFFFFF);

  // -- Spend (red) ---------------------------------------------------------------

  /// Spend/outflow surface, light theme: `semantic.error.600` (AA with white).
  static const Color spendLight = AdsColors.error600;

  /// Spend/outflow surface, dark theme: `semantic.error.500`.
  static const Color spendDark = AdsColors.error500;

  /// On-spend label.
  static const Color onSpend = Color(0xFFFFFFFF);

  // -- Quant Credits (gold) --------------------------------------------------------
  //
  // The Quant Credits economy (bet #2) — gold tint distinguishes credit
  // balances from fiat earning/spend values.

  /// Credits balance accent, light theme: `accent.600`.
  static const Color creditsGoldLight = AdsColors.adsAmber600;

  /// Credits balance accent, dark theme: `accent.400`.
  static const Color creditsGoldDark = AdsColors.adsAmber400;

  /// Credits chip background, light theme.
  static const Color creditsChipLight = AdsColors.adsAmber100;

  /// Credits chip background, dark theme.
  static const Color creditsChipDark = AdsColors.adsAmber950;
}
