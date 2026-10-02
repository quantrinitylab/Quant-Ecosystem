// ============================================================================
// quantube_core - QuanTube brand color tokens
// ============================================================================
//
// Copy-adapt of `quant_foundation` theme tokens
// (`phase0/foundation/lib/src/theme/quant_colors.dart`):
// - the shared @quant/brand ramps (primary, accent, neutral, semantic) are
//   preserved so QuanTube shades exactly like the rest of the ecosystem,
// - the QuanTube app accent is the red `#F43F5E` from
//   `packages/brand/src/apps.ts` (QuanTube — video hosting and streaming),
// - video playback gets a dedicated dark-on-black surface family tuned for
//   video: pure-ish black canvas `#0F0F0F`, dimmed scrims for player chrome,
//   and high-contrast white/red control colors.
//
// Do NOT add heavy custom painting or glow effects here: playback
// performance is the competitive edge, theme work must stay cheap.

import 'package:flutter/material.dart';

/// QuanTube color tokens: ecosystem ramps + video-first surfaces.
///
/// All values are `const`, so they can be used in `const` widget trees.
abstract final class QuanTubeColors {
  QuanTubeColors._();

  // -- QuanTube app accent (brand red) ---------------------------------------

  /// QuanTube brand accent from `@quant/brand` `apps.ts` (`quantube`).
  ///
  /// Used for: progress bar / scrubber, subscribe buttons, focus rings,
  /// selected states, notification dots.
  static const Color brandRed = Color(0xFFF43F5E);

  /// Pressed / active state of the brand red.
  static const Color brandRedPressed = Color(0xFFE11D48);

  /// Brightened red for hover on dark surfaces.
  static const Color brandRedBright = Color(0xFFFB7185);

  /// Deep red used for soft tints on dark backgrounds (badges, chips).
  static const Color brandRedDeep = Color(0xFF2A0E14);

  // -- Video surfaces (player-first, dark) -----------------------------------

  /// Player canvas: the video area itself. Pure black keeps the letterbox
  /// invisible and saves OLED power.
  static const Color playerCanvas = Color(0xFF000000);

  /// App canvas (dark): `#0F0F0F` — YouTube-dark-style page background.
  static const Color canvasDark = Color(0xFF0F0F0F);

  /// Elevated surface (dark): card / list backgrounds over the canvas.
  static const Color surfaceDark = Color(0xFF1A1A1A);

  /// Overlay surface (dark): sheets, menus, dialogs.
  static const Color overlayDark = Color(0xFF242424);

  /// Scrim behind player chrome: black at 60% for the top/bottom gradients
  /// over video.
  static const Color playerScrim = Color(0x99000000);

  /// Dimmed backdrop for full-screen overlays (quality sheet, share sheet).
  static const Color playerDim = Color(0xB3000000);

  // -- Text / icon colors (dark) ----------------------------------------------

  /// Primary text on video-dark surfaces: near-white.
  static const Color foregroundDark = Color(0xFFF1F1F1);

  /// Secondary text: video title meta, view counts, timestamps.
  static const Color foregroundDarkSecondary = Color(0xFFAAAAAA);

  /// Tertiary text: captions, hints, dividers text.
  static const Color foregroundDarkTertiary = Color(0xFF717171);

  /// Disabled / very dim text.
  static const Color foregroundDarkDisabled = Color(0xFF4D4D4D);

  // -- Borders (dark) ----------------------------------------------------------

  /// Default divider / hairline on dark surfaces.
  static const Color borderDark = Color(0xFF272727);

  /// Slightly raised border for elevated cards.
  static const Color borderDarkElevated = Color(0xFF3D3D3D);

  // -- Light variant constants -------------------------------------------------

  /// Light canvas: `#F9F9F9` — YouTube-light-style page background.
  static const Color canvasLight = Color(0xFFF9F9F9);

  /// Light elevated surface.
  static const Color surfaceLight = Color(0xFFFFFFFF);

  /// Light overlay surface.
  static const Color overlayLight = Color(0xFFF2F2F2);

  /// Primary text on light surfaces.
  static const Color foregroundLight = Color(0xFF0F0F0F);

  /// Secondary text on light surfaces.
  static const Color foregroundLightSecondary = Color(0xFF606060);

  /// Tertiary text on light surfaces.
  static const Color foregroundLightTertiary = Color(0xFF909090);

  /// Border on light surfaces.
  static const Color borderLight = Color(0xFFE5E5E5);

  // -- Status / playback feedback ----------------------------------------------

  /// Download complete / live badge accent.
  static const Color liveRed = Color(0xFFFF0000);

  /// Buffering / shimmer base color on dark surfaces.
  static const Color shimmerDark = Color(0xFF2A2A2A);

  /// Buffering / shimmer highlight on dark surfaces.
  static const Color shimmerDarkHighlight = Color(0xFF3A3A3A);

  /// Buffering / shimmer base color on light surfaces.
  static const Color shimmerLight = Color(0xFFEDEDED);

  /// Buffering / shimmer highlight on light surfaces.
  static const Color shimmerLightHighlight = Color(0xFFF7F7F7);

  /// Focus ring for keyboard / remote (TV) navigation on the player.
  static const Color focusRing = Color(0xFFFFFFFF);
}
