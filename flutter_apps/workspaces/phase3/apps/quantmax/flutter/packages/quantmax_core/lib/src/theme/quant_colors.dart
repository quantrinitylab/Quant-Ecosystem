// ============================================================================
// quantmax_core - QuantMax color tokens
// ============================================================================
//
// Adapted from `packages/brand/src/colors.ts` + `packages/brand/src/apps.ts`
// (SSOT, see phase0 `quant_colors.dart`). QuantMax is the short-video /
// discovery face of the Quant ecosystem, so this file leans dark-first:
// the video feed runs on pure black for OLED contrast, and the brand accent
// is the QuantMax app amber `#F59E0B` (from `apps.ts`, same ramp as
// `semantic.warning`) — the signature vibrant accent across short-video UI.
//
// Mapping rules:
// - TS hex strings → `Color(0xFF…)` compile-time constants.
// - All values are `const` so they can be used in `const` widget trees.
// - On-video overlays use [onVideo] colors, NOT theme foreground: video
//   thumbnails vary in brightness, so caption/username text pins to white
//   over a scrim gradient (see [scrimStops]) for guaranteed legibility.

import 'package:flutter/material.dart';

/// QuantMax color tokens, adapted from the `@quant/brand` SSOT.
///
/// Dark is the default theme; the feed canvas is pure black (`feedCanvas`)
/// for OLED power savings and maximum video contrast. Non-feed screens
/// (profile, settings, auth) use the raised [canvasDark] so the feed stays
/// the deepest surface in the product.
abstract final class QuantMaxColors {
  QuantMaxColors._();

  // -- Primary accent (QuantMax amber) ramp ---------------------------------
  //
  // `apps.ts` quantmax accent: `#F59E0B` (identical to `semantic.warning`).
  // This is the vibrant signature accent: CTA buttons, active tab, progress
  // bars, badges, focus rings.

  /// `primary.50`
  static const Color primary50 = Color(0xFFFFFBEB);

  /// `primary.100`
  static const Color primary100 = Color(0xFFFEF3C7);

  /// `primary.200`
  static const Color primary200 = Color(0xFFFDE68A);

  /// `primary.300`
  static const Color primary300 = Color(0xFFFCD34D);

  /// `primary.400`
  static const Color primary400 = Color(0xFFFBBF24);

  /// `primary.500` — the QuantMax app accent (`apps.ts`).
  static const Color primary500 = Color(0xFFF59E0B);

  /// `primary.600` — pressed / emphasis on light theme (AA on white).
  static const Color primary600 = Color(0xFFD97706);

  /// `primary.700` — light-theme primary for text/icons on white.
  static const Color primary700 = Color(0xFFB45309);

  /// `primary.800`
  static const Color primary800 = Color(0xFF92400E);

  /// `primary.900`
  static const Color primary900 = Color(0xFF78350F);

  /// `primary.950`
  static const Color primary950 = Color(0xFF451A03);

  // -- Feed / dark-first surfaces --------------------------------------------

  /// Feed canvas — pure black. The default scaffold background for every
  /// video surface (feed, player, viewer) in the dark theme.
  static const Color feedCanvas = Color(0xFF000000);

  /// `surface.dark` — canvas for NON-feed dark screens (profile, settings,
  /// auth), one step above [feedCanvas].
  static const Color canvasDark = Color(0xFF090A0C);

  /// `surface.darkElevated` — sheets, comment drawers, cards (dark).
  static const Color surfaceDarkElevated = Color(0xFF111318);

  /// `surface.darkOverlay` — raised chips, pills, tooltips (dark).
  static const Color surfaceDarkOverlay = Color(0xFF16181D);

  /// Border default (dark).
  static const Color borderDark = Color(0xFF282C35);

  // -- Light-mode counterparts ------------------------------------------------

  /// `surface.light` — canvas, light theme background.
  static const Color canvasLight = Color(0xFFFFFFFF);

  /// `surface.lightElevated` — sheets, cards (light).
  static const Color surfaceLightElevated = Color(0xFFF8F9FA);

  /// `surface.lightOverlay` — chips, pills (light).
  static const Color surfaceLightOverlay = Color(0xFFF1F3F5);

  /// Border default (light).
  static const Color borderLight = Color(0xFFE2E8F0);

  /// Foreground (light theme).
  static const Color foregroundLight = Color(0xFF0F172A);

  /// Muted foreground (light theme).
  static const Color mutedForegroundLight = Color(0xFF64748B);

  /// Foreground (dark theme).
  static const Color foregroundDark = Color(0xFFF5F5F5);

  /// Muted foreground (dark theme).
  static const Color mutedForegroundDark = Color(0xFFA1A4AC);

  // -- Semantic: engagement ----------------------------------------------------

  /// Like / heart — filled when the viewer liked the video
  /// (`semantic.error.500`).
  static const Color likeHeart = Color(0xFFEF4444);

  /// Heart burst fill on the double-tap animation.
  static const Color likeHeartBurst = Color(0xFFFCA5A5);

  /// Live badge red — recording/live indicator (`semantic.error.600`).
  static const Color liveBadge = Color(0xFFDC2626);

  /// Verified checkmark blue (`semantic.info.500`).
  static const Color verified = Color(0xFF3B82F6);

  /// Success green (`semantic.success.500`) — upload complete, etc.
  static const Color success = Color(0xFF22C55E);

  /// Error red (`semantic.error.600`) — failures, destructive actions.
  static const Color error = Color(0xFFDC2626);

  // -- On-video overlay colors --------------------------------------------------

  /// Text pinned on top of video: always white, independent of theme.
  static const Color onVideoPrimary = Color(0xFFFFFFFF);

  /// Secondary on-video text (timestamps, counts) — white at 70%.
  static const Color onVideoSecondary = Color(0xB3FFFFFF);

  /// Tertiary on-video text (music ticker prefix, placeholders) —
  /// white at 55%.
  static const Color onVideoTertiary = Color(0x8CFFFFFF);

  /// Icon buttons floating over video (heart, comment, share) — idle state.
  static const Color onVideoIcon = Color(0xFFFFFFFF);

  /// Bottom scrim gradient stops, bottom → top. The caption/music zone sits
  /// on video: `[0.65 black, transparent]`.
  static const List<Color> scrimStops = <Color>[
    Color(0xA6000000),
    Color(0x00000000),
  ];

  /// Top scrim gradient stops, top → bottom, for the viewer app bar zone.
  static const List<Color> scrimStopsTop = <Color>[
    Color(0x80000000),
    Color(0x00000000),
  ];

  /// Playback progress bar track over video — white at 25%.
  static const Color progressTrackOnVideo = Color(0x40FFFFFF);

  /// Skeleton shimmer base / highlight for feed loading cards (dark).
  static const Color shimmerBase = Color(0xFF16181D);
  static const Color shimmerHighlight = Color(0xFF282C35);
}
