// ============================================================================
// gram_core - QuantGram brand color tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `QuantColors` (port of
// `packages/brand/src/colors.ts`), re-voiced for QuantGram: a dark-first
// social/photo app where media performance and a vivid brand gradient are
// the product signature.
//
// Design notes:
// - Dark is the default theme: deep blacks (`#0A0A0F`) keep photos punchy
//   and OLED-friendly; surfaces step up in small, predictable tiers so feed
//   cards read without visible banding.
// - The brand gradient (magenta -> violet -> amber) is QuantGram's own
//   identity — Instagram-adjacent in spirit, distinct in hue sequence and
//   naming. Use it for story rings, the create button, and brand moments,
//   never for text or functional chrome.
// - All values are `const`, so they can be used in `const` widget trees.

import 'package:flutter/material.dart';

/// Brand color tokens for QuantGram.
///
/// Light + dark palettes live side by side; [GramTheme] wires them into the
/// active [ColorScheme]. No seed-based color generation — every surface is
/// an explicit, reviewed token.
abstract final class GramColors {
  GramColors._();

  // -- Brand gradient --------------------------------------------------------

  /// Gradient stop 1: vivid magenta `#EC4899`.
  static const Color brandGradientStart = Color(0xFFEC4899);

  /// Gradient stop 2: electric violet `#8B5CF6`.
  static const Color brandGradientMid = Color(0xFF8B5CF6);

  /// Gradient stop 3: warm amber `#F59E0B`.
  static const Color brandGradientEnd = Color(0xFFF59E0B);

  /// The QuantGram brand gradient: magenta -> violet -> amber.
  ///
  /// Used for story rings, the create (+) button, and brand moments.
  static const LinearGradient brandGradient = LinearGradient(
    colors: <Color>[brandGradientStart, brandGradientMid, brandGradientEnd],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // -- Dark palette (default) ------------------------------------------------

  /// Dark canvas `#0A0A0F` — app background, feed background.
  static const Color backgroundDark = Color(0xFF0A0A0F);

  /// Dark primary surface `#131318` — cards, sheets, feed items.
  static const Color surfaceDark = Color(0xFF131318);

  /// Dark secondary surface `#1C1C24` — nested cards, comment bubbles.
  static const Color surfaceVariantDark = Color(0xFF1C1C24);

  /// Dark elevated surface `#23232E` — dialogs, menus, bottom sheets.
  static const Color surfaceElevatedDark = Color(0xFF23232E);

  /// Dark border `#2A2A36` — hairlines, card outlines.
  static const Color borderDark = Color(0xFF2A2A36);

  /// Dark primary text `#F4F4F6`.
  static const Color foregroundDark = Color(0xFFF4F4F6);

  /// Dark secondary text `#A8A8B3` — captions, timestamps, metadata.
  static const Color foregroundSecondaryDark = Color(0xFFA8A8B3);

  /// Dark tertiary text `#6E6E7A` — disabled, placeholder-adjacent.
  static const Color foregroundTertiaryDark = Color(0xFF6E6E7A);

  /// Dark scrim `#99000000` — media viewer overlays, story dimming.
  static const Color scrimDark = Color(0x99000000);

  // -- Light palette ---------------------------------------------------------

  /// Light canvas `#FAFAFA` — app background, feed background.
  static const Color backgroundLight = Color(0xFFFAFAFA);

  /// Light primary surface `#FFFFFF` — cards, sheets, feed items.
  static const Color surfaceLight = Color(0xFFFFFFFF);

  /// Light secondary surface `#F0F0F5` — nested cards, comment bubbles.
  static const Color surfaceVariantLight = Color(0xFFF0F0F5);

  /// Light elevated surface `#FFFFFF` — dialogs, menus, bottom sheets.
  static const Color surfaceElevatedLight = Color(0xFFFFFFFF);

  /// Light border `#E4E4EA` — hairlines, card outlines.
  static const Color borderLight = Color(0xFFE4E4EA);

  /// Light primary text `#101014`.
  static const Color foregroundLight = Color(0xFF101014);

  /// Light secondary text `#5C5C66` — captions, timestamps, metadata.
  static const Color foregroundSecondaryLight = Color(0xFF5C5C66);

  /// Light tertiary text `#8E8E99` — disabled, placeholder-adjacent.
  static const Color foregroundTertiaryLight = Color(0xFF8E8E99);

  /// Light scrim `#80000000` — media viewer overlays, story dimming.
  static const Color scrimLight = Color(0x80000000);

  // -- On-brand / base -------------------------------------------------------

  /// On-brand label: white text on gradient/brand fills.
  static const Color onBrand = Color(0xFFFFFFFF);

  /// Pure white — media backgrounds, light-theme brand fills.
  static const Color white = Color(0xFFFFFFFF);

  /// Pure black — media backgrounds, dark-theme scrims.
  static const Color black = Color(0xFF000000);

  // -- Semantic: success (green) ---------------------------------------------

  /// Success 400 — dark-theme success accents (meets contrast on dark).
  static const Color success400 = Color(0xFF4ADE80);

  /// Success 500 — light-theme success accents.
  static const Color success500 = Color(0xFF22C55E);

  /// Success 600 — destructive-adjacent bold fills, AA with white label.
  static const Color success600 = Color(0xFF16A34A);

  // -- Semantic: warning (amber) ----------------------------------------------

  /// Warning 400 — dark-theme warning accents.
  static const Color warning400 = Color(0xFFFBBF24);

  /// Warning 500 — light-theme warning accents.
  static const Color warning500 = Color(0xFFF59E0B);

  /// Warning 600 — bold warning fills.
  static const Color warning600 = Color(0xFFD97706);

  // -- Semantic: error (rose) -------------------------------------------------

  /// Error 400 — dark-theme error accents.
  static const Color error400 = Color(0xFFFB7185);

  /// Error 500 — light-theme error accents.
  static const Color error500 = Color(0xFFF43F5E);

  /// Error 600 — destructive actions (meets AA with white label).
  static const Color error600 = Color(0xFFE11D48);

  // -- Semantic: info (blue) ---------------------------------------------------

  /// Info 400 — dark-theme info accents.
  static const Color info400 = Color(0xFF60A5FA);

  /// Info 500 — light-theme info accents.
  static const Color info500 = Color(0xFF3B82F6);

  /// Info 600 — bold info fills.
  static const Color info600 = Color(0xFF2563EB);
}
