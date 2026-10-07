// ============================================================================
// quantcooks_core - QuantCooks brand color tokens
// ============================================================================
//
// QuantCooks palette for a creator/editor tool (CapCut/Figma competitor).
// Dark-first: the canvas is the product, so canvas surfaces go deeper than
// the ecosystem default.
//
// Token provenance (no theatre — read before changing a value):
// - "VERIFIED" tokens are ported 1:1 from @quant/brand via
//   `package:quant_foundation` (packages/brand/src/{colors,themes}.ts SSOT).
//   They are referenced, not redefined, so brand updates propagate.
// - "COOKS" tokens are QuantCooks-specific: NOT in @quant/brand. Every one
//   carries `// TODO(UNVERIFIED)` — the value is a proposal tuned for an
//   editor canvas and must be confirmed with design before release.

import 'package:flutter/material.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// QuantCooks brand color tokens.
///
/// Verified brand ramps come from [QuantColors]; this class adds the
/// editor-specific surface/chrome set and the creative accent used for
/// export/publish actions.
abstract final class CooksColors {
  CooksColors._();

  // -- Verified brand anchors ------------------------------------------------
  // Ported 1:1 from @quant/brand (packages/brand/src/colors.ts). Aliased here
  // so the editor theme reads in QuantCooks terms; values stay identical.

  /// Brand primary orange — `primary.500` in @quant/brand.
  static const Color brandOrange = QuantColors.primary500;

  /// Brand primary pressed — `primary.600` in @quant/brand.
  static const Color brandOrangePressed = QuantColors.primary600;

  /// Brand accent amber — `accent.500` in @quant/brand.
  static const Color brandAmber = QuantColors.accent500;

  /// Semantic success — `semantic.success.500` in @quant/brand.
  static const Color success = QuantColors.success500;

  /// Semantic success strong — `semantic.success.600` in @quant/brand.
  static const Color successStrong = QuantColors.success600;

  /// Semantic warning — `semantic.warning.500` in @quant/brand.
  static const Color warning = QuantColors.warning500;

  /// Semantic error — `semantic.error.500` in @quant/brand.
  static const Color error = QuantColors.error500;

  /// Semantic error surface (white label, AA) —
  /// `semantic.error.600` in @quant/brand.
  static const Color errorStrong = QuantColors.error600;

  /// Semantic info — `semantic.info.500` in @quant/brand.
  static const Color info = QuantColors.info500;

  /// Border default (dark) — `neutral.700` in @quant/brand.
  static const Color borderDark = QuantColors.neutral700;

  /// Elevated surface (dark) — `neutral.800` in @quant/brand.
  static const Color surfaceDarkElevated = QuantColors.neutral800;

  /// Primary surface (dark) — `neutral.900` in @quant/brand.
  static const Color surfaceDark = QuantColors.neutral900;

  /// Muted foreground (dark) — `neutral.300` in @quant/brand.
  static const Color mutedForegroundDark = QuantColors.neutral300;

  /// Light canvas — `surface.light` in @quant/brand.
  static const Color surfaceLight = QuantColors.surfaceLight;

  // -- QuantCooks creator accent (COOKS) --------------------------------------
  // NOTE: `packages/brand/src/apps.ts` has no `quantcooks` entry (it has
  // `quantedits` #7C3AED for the editing suite). The rose accent below is
  // QuantCooks-specific: chosen to read as "creative action" (export,
  // publish, record) against the orange brand, distinct from every other
  // app accent in QuantAppColors.

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// QuantCooks creator accent — rose for export/publish/record actions.
  static const Color creatorAccent = Color(0xFFFF4D6D);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Pressed state of [creatorAccent].
  static const Color creatorAccentPressed = Color(0xFFE0335C);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Deep stop of the creative gradient (used on dark canvas).
  static const Color creatorAccentDeep = Color(0xFFB81E4B);

  // -- Dark-first editor canvas surfaces (COOKS) ------------------------------
  // Deeper than the ecosystem `surface.dark` (#090A0C): in an editor the
  // canvas must recede behind the media being edited.

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Deepest canvas — preview viewport background, media letterbox.
  static const Color canvas = Color(0xFF050607);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Timeline / track area background.
  static const Color timelineSurface = Color(0xFF0D0F12);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Clip / card surface on the timeline (sits above [timelineSurface]).
  static const Color clipSurface = Color(0xFF171A1F);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Canvas grid lines / rulers — white at 6% over the canvas.
  static const Color canvasGrid = Color(0x0FFFFFFF);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Transparency checkerboard, light cell.
  static const Color checkerLight = Color(0xFF2A2D33);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Transparency checkerboard, dark cell.
  static const Color checkerDark = Color(0xFF1B1E23);

  // -- Editor chrome (COOKS) ---------------------------------------------------
  // Small, high-signal colors for timeline/playhead affordances. Kept flat
  // (no ramp) because they are UI chrome, not brand expression.

  /// Playhead line + handle. Aliases [creatorAccent] — the playhead is the
  /// single most important interactive element, so it takes the accent.
  static const Color playhead = creatorAccent;

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Selected clip outline.
  static const Color clipSelected = brandOrange;

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Trim-handle fill on clip edges.
  static const Color trimHandle = Color(0xFFFFFFFF);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Unplayed waveform bars.
  static const Color waveform = QuantColors.neutral500;

  /// Played waveform bars. Aliases [brandOrange] — progress reads as brand.
  static const Color waveformPlayed = brandOrange;

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Safe-area / title-safe overlay guides.
  static const Color safeAreaGuide = Color(0x66FF4D6D);

  /// TODO(UNVERIFIED): brand value assumed, confirm with design.
  /// Recording indicator.
  static const Color recording = Color(0xFFFF3B30);
}

/// Creative gradients for export/publish CTAs (COOKS).
///
/// Both stops are VERIFIED @quant/brand colors ([CooksColors.brandOrange],
/// [CooksColors.creatorAccent] — the accent itself is TODO(UNVERIFIED)); the
/// *pairing* and direction are QuantCooks-specific. Gradient CTAs are built
/// with a Container + InkWell (see [CooksTheme]), not via ButtonStyle.
abstract final class CooksGradients {
  CooksGradients._();

  /// TODO(UNVERIFIED): gradient pairing assumed, confirm with design.
  /// Primary creative-action gradient: brand orange → creator rose.
  /// Used for Export / Publish buttons on the dark canvas.
  static const LinearGradient creativeAction = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: <Color>[Color(0xFFFF8C42), Color(0xFFFF4D6D)],
  );

  /// TODO(UNVERIFIED): gradient pairing assumed, confirm with design.
  /// Subtle scrim behind preview overlays (timecode, transport controls).
  static const LinearGradient previewScrim = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[Color(0x00000000), Color(0xB3000000)],
  );
}
