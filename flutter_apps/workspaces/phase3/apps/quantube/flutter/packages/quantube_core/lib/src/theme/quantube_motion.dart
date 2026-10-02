// ============================================================================
// quantube_core - motion tokens for playback UI
// ============================================================================
//
// Copy-adapt of `quant_foundation` motion
// (`phase0/foundation/lib/src/theme/quant_motion.dart`):
// - the base [QuanTubeDurations] / [QuanTubeEasings] ramps are preserved from
//   the brand motion tokens so app chrome animates like the ecosystem,
// - [QuanTubePlayerMotion] adds playback-specific constants: mini-player
//   expand/collapse, sheet transitions (quality/share/download options),
//   shimmer loops for thumbnail skeletons, and control auto-hide.
//
// Performance note: all of these use `CurvedAnimation` with cheap `Cubic`
// curves. No springs, no custom painters, no per-frame shaders on the player
// path — the video texture owns the GPU budget.

import 'package:flutter/material.dart';

/// Motion durations, ported from `duration` in `packages/brand/src/motion.ts`.
abstract final class QuanTubeDurations {
  QuanTubeDurations._();

  /// Instant feedback — 50ms.
  static const Duration instant = Duration(milliseconds: 50);

  /// Fast interaction — 100ms.
  static const Duration fast = Duration(milliseconds: 100);

  /// Normal transition — 200ms. Default for most UI transitions.
  static const Duration normal = Duration(milliseconds: 200);

  /// Deliberate transition — 300ms.
  static const Duration moderate = Duration(milliseconds: 300);

  /// Slow / cinematic transition — 500ms.
  static const Duration slow = Duration(milliseconds: 500);

  /// Very slow / dramatic — 800ms.
  static const Duration glacial = Duration(milliseconds: 800);
}

/// Motion easing curves, ported from `easing` in `packages/brand/src/motion.ts`.
abstract final class QuanTubeEasings {
  QuanTubeEasings._();

  /// Standard ease-out for enter transitions: `cubic-bezier(0, 0, 0.2, 1)`.
  static const Curve easeOut = Cubic(0.0, 0.0, 0.2, 1.0);

  /// Standard ease-in for exit transitions: `cubic-bezier(0.4, 0, 1, 1)`.
  static const Curve easeIn = Cubic(0.4, 0.0, 1.0, 1.0);

  /// Standard ease-in-out for move transitions: `cubic-bezier(0.4, 0, 0.2, 1)`.
  static const Curve easeInOut = Cubic(0.4, 0.0, 0.2, 1.0);

  /// Spring-like overshoot for emphasis: `cubic-bezier(0.34, 1.56, 0.64, 1)`.
  static const Curve springBounce = Cubic(0.34, 1.56, 0.64, 1.0);

  /// Smooth deceleration for a natural feel: `cubic-bezier(0, 0, 0, 1)`.
  static const Curve decelerate = Cubic(0.0, 0.0, 0.0, 1.0);

  /// Linear, for continuous animations: `cubic-bezier(0, 0, 1, 1)`.
  static const Curve linear = Cubic(0.0, 0.0, 1.0, 1.0);
}

/// Playback-UI motion constants for QuanTube.
///
/// Named duration + curve pairs so player screens stay consistent without
/// sprinkling magic numbers. Everything here is a cheap tween — the video
/// frame path is never asked to animate UI at 60fps beyond these.
abstract final class QuanTubePlayerMotion {
  QuanTubePlayerMotion._();

  // -- Player chrome ------------------------------------------------------------

  /// Duration of the auto-hide fade for player controls (play/pause, seek,
  /// top and bottom bars).
  static const Duration controlsAutoHide = Duration(seconds: 3);

  /// Fade in/out of the player controls overlay — snappy so it never feels
  /// like it lags a tap.
  static const Duration controlsFade = Duration(milliseconds: 150);

  /// Curve for the controls fade.
  static const Curve controlsFadeCurve = QuanTubeEasings.easeOut;

  /// Duration for scrubber interactions: the seek-bar thumb scales up on
  /// touch-down, back down on release.
  static const Duration scrubberThumb = Duration(milliseconds: 120);

  /// Curve for scrubber thumb scaling.
  static const Curve scrubberThumbCurve = QuanTubeEasings.easeInOut;

  // -- Mini-player ---------------------------------------------------------------

  /// Expand/collapse between the mini-player and the full watch screen.
  static const Duration miniPlayerExpand = Duration(milliseconds: 350);

  /// Curve for the mini-player drag + expand animation.
  static const Curve miniPlayerExpandCurve = QuanTubeEasings.easeInOut;

  /// Swipe-to-dismiss duration for the mini-player.
  static const Duration miniPlayerDismiss = Duration(milliseconds: 200);

  // -- Sheets ---------------------------------------------------------------------

  /// Slide-up for bottom sheets (quality picker, playback speed, share,
  /// download options, add-to-playlist).
  static const Duration sheetEnter = Duration(milliseconds: 280);

  /// Slide-down dismiss for bottom sheets.
  static const Duration sheetExit = Duration(milliseconds: 200);

  /// Curve for sheet enter transitions.
  static const Curve sheetEnterCurve = QuanTubeEasings.easeOut;

  /// Curve for sheet exit transitions.
  static const Curve sheetExitCurve = QuanTubeEasings.easeIn;

  // -- Skeleton / shimmer -----------------------------------------------------------

  /// One shimmer sweep across a thumbnail skeleton (feed loading state).
  static const Duration shimmerSweep = Duration(milliseconds: 1400);

  /// Curve for the shimmer sweep: linear so the highlight band moves at a
  /// constant speed.
  static const Curve shimmerCurve = QuanTubeEasings.linear;

  /// Fade between the skeleton placeholder and the loaded thumbnail.
  static const Duration thumbnailCrossfade = Duration(milliseconds: 250);
}
