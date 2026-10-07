// ============================================================================
// quantcooks_core - typography tokens
// ============================================================================
//
// Type scale for the QuantCooks editor. The general ramp is adapted from
// @quant/brand via `package:quant_foundation` (packages/brand/src/
// typography.ts SSOT); the editor adds mono-first styles for timecode and
// dense timeline labels.
//
// Token provenance:
// - Styles referencing [QuantTextStyles]/[QuantTypography] are VERIFIED
//   @quant/brand ports (referenced, not redefined).
// - [CooksTextStyles.timecode], [CooksTextStyles.timecodeLarge],
//   [CooksTextStyles.clipLabel] and [CooksTextStyles.toolLabel] are
//   QuantCooks-specific compositions — marked TODO(UNVERIFIED).

import 'package:flutter/material.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Font-family aliases for the editor.
///
/// Display/body stay on the brand Inter stack; mono stays on the brand
/// JetBrains Mono stack (critical for timecode: tabular figures keep the
/// readout from jittering while scrubbing).
abstract final class CooksTypography {
  CooksTypography._();

  /// Brand display stack — `fontFamily.display` in @quant/brand.
  static const String fontFamilyDisplay = QuantTypography.fontFamilyDisplay;

  /// Brand body stack — `fontFamily.body` in @quant/brand.
  static const String fontFamilyBody = QuantTypography.fontFamilyBody;

  /// Brand mono stack — `fontFamily.mono` in @quant/brand.
  /// Used for timecode, frame numbers, and metadata readouts.
  static const String fontFamilyMono = QuantTypography.fontFamilyMono;

  /// Latin fallback list — `fontFamilyFallbackLatin` in @quant/brand.
  static const List<String> fontFamilyFallbackLatin =
      QuantTypography.fontFamilyFallbackLatin;

  /// em → px tracking helper — `QuantTypography.tracking` in @quant/brand.
  static double tracking(double fontSize, double em) =>
      QuantTypography.tracking(fontSize, em);
}

/// Composed text styles for the QuantCooks editor.
///
/// The display → label ramp reuses the verified [QuantTextStyles] compositions
/// so product chrome (dialogs, settings, project list) matches the ecosystem.
/// Editor-canvas styles (timecode, clip labels) are defined here because no
/// brand token covers them.
abstract final class CooksTextStyles {
  CooksTextStyles._();

  // -- Verified brand ramp (aliases of QuantTextStyles) ------------------------

  /// 60px / 72px display — [QuantTextStyles.display].
  static const TextStyle display = QuantTextStyles.display;

  /// 48px / 56px — [QuantTextStyles.h1].
  static const TextStyle h1 = QuantTextStyles.h1;

  /// 36px / 40px — [QuantTextStyles.h2].
  static const TextStyle h2 = QuantTextStyles.h2;

  /// 30px / 36px — [QuantTextStyles.h3].
  static const TextStyle h3 = QuantTextStyles.h3;

  /// 24px / 32px — [QuantTextStyles.h4].
  static const TextStyle h4 = QuantTextStyles.h4;

  /// 20px / 28px — [QuantTextStyles.h5].
  static const TextStyle h5 = QuantTextStyles.h5;

  /// 18px / 28px — [QuantTextStyles.bodyLarge].
  static const TextStyle bodyLarge = QuantTextStyles.bodyLarge;

  /// 16px / 24px — [QuantTextStyles.body].
  static const TextStyle body = QuantTextStyles.body;

  /// 14px / 20px — [QuantTextStyles.bodySmall].
  static const TextStyle bodySmall = QuantTextStyles.bodySmall;

  /// 12px / 16px metadata — [QuantTextStyles.caption].
  static const TextStyle caption = QuantTextStyles.caption;

  /// 14px / 20px button labels — [QuantTextStyles.button].
  static const TextStyle button = QuantTextStyles.button;

  /// 12px / 16px eyebrow labels — [QuantTextStyles.overline].
  static const TextStyle overline = QuantTextStyles.overline;

  /// 14px / 20px mono — [QuantTextStyles.code].
  static const TextStyle code = QuantTextStyles.code;

  // -- Editor-canvas styles (COOKS) ---------------------------------------------
  // Mono-first: JetBrains Mono has tabular figures, so timecode readouts
  // don't jitter while scrubbing. Letter-spacing is set in px from the em
  // fractions (see [CooksTypography.tracking]).

  /// TODO(UNVERIFIED): sizes assumed, confirm with design.
  /// Timecode readout `00:00:00:00` — 13px mono semibold, 0.1em tracking.
  /// Used on the timeline ruler and transport bar.
  static const TextStyle timecode = TextStyle(
    fontFamily: QuantTypography.fontFamilyMono,
    fontSize: 13.0,
    height: 16.0 / 13.0,
    fontWeight: QuantTypography.fontWeightSemiBold,
    letterSpacing: 1.3, // 13.0 * 0.1
  );

  /// TODO(UNVERIFIED): sizes assumed, confirm with design.
  /// Large timecode overlay on the preview viewport — 20px mono semibold.
  static const TextStyle timecodeLarge = TextStyle(
    fontFamily: QuantTypography.fontFamilyMono,
    fontSize: 20.0,
    height: 28.0 / 20.0,
    fontWeight: QuantTypography.fontWeightSemiBold,
    letterSpacing: 1.0, // 20.0 * 0.05
  );

  /// TODO(UNVERIFIED): sizes assumed, confirm with design.
  /// Timeline clip name — 11px medium, 0.025em tracking; must stay legible
  /// on small clips at 100% zoom.
  static const TextStyle clipLabel = TextStyle(
    fontFamily: QuantTypography.fontFamilyBody,
    fontFamilyFallback: QuantTypography.fontFamilyFallbackLatin,
    fontSize: 11.0,
    height: 14.0 / 11.0,
    fontWeight: QuantTypography.fontWeightMedium,
    letterSpacing: 0.275, // 11.0 * 0.025
  );

  /// TODO(UNVERIFIED): sizes assumed, confirm with design.
  /// Toolbar / tool-rail labels — 10px medium, 0.05em tracking, uppercase
  /// applied by the widget.
  static const TextStyle toolLabel = TextStyle(
    fontFamily: QuantTypography.fontFamilyBody,
    fontFamilyFallback: QuantTypography.fontFamilyFallbackLatin,
    fontSize: 10.0,
    height: 12.0 / 10.0,
    fontWeight: QuantTypography.fontWeightMedium,
    letterSpacing: 0.5, // 10.0 * 0.05
  );
}
