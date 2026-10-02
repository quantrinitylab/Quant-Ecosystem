// ============================================================================
// quantcooks_core - motion tokens
// ============================================================================
//
// Motion for the QuantCooks editor canvas. Base durations/easings are the
// VERIFIED @quant/brand tokens from `package:quant_foundation`
// (packages/brand/src/motion.ts SSOT); canvas interactions add tighter,
// editor-tuned values.
//
// Token provenance:
// - Aliases of [QuantDurations]/[QuantEasings]/[QuantSpring] are VERIFIED.
// - [CooksSprings.snap], [CooksSprings.panel], [CooksDurations.panelSlide]
//   and [CooksEasings.scrub] are QuantCooks-specific — marked
//   TODO(UNVERIFIED). Spring params follow the Framer-Motion convention
//   (damping/stiffness/mass) like the foundation tokens.

import 'package:flutter/material.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Motion durations for the editor.
///
/// Scrub/playhead motion must respond within a frame budget; chrome
/// transitions reuse the brand ramp.
abstract final class CooksDurations {
  CooksDurations._();

  /// Scrub response — 50ms. Aliases [QuantDurations.instant]: the playhead
  /// follows the pointer with no perceptible lag.
  static const Duration scrub = QuantDurations.instant;

  /// Fast interaction — 100ms. Aliases [QuantDurations.fast].
  static const Duration fast = QuantDurations.fast;

  /// Snap settle — 200ms. Aliases [QuantDurations.normal]: magnetic snapping
  /// of clips to the playhead/markers resolves inside a normal transition.
  static const Duration snapSettle = QuantDurations.normal;

  /// Deliberate transition — 300ms. Aliases [QuantDurations.moderate].
  static const Duration moderate = QuantDurations.moderate;

  /// TODO(UNVERIFIED): duration assumed, confirm with design.
  /// Panel slide (inspector/effects drawer) — 250ms; slightly quicker than
  /// [moderate] so the canvas never feels blocked.
  static const Duration panelSlide = Duration(milliseconds: 250);

  /// Slow transition — 500ms. Aliases [QuantDurations.slow].
  static const Duration slow = QuantDurations.slow;
}

/// Easing curves for the editor.
abstract final class CooksEasings {
  CooksEasings._();

  /// Standard ease-out — [QuantEasings.easeOut].
  static const Curve easeOut = QuantEasings.easeOut;

  /// Standard ease-in — [QuantEasings.easeIn].
  static const Curve easeIn = QuantEasings.easeIn;

  /// Standard ease-in-out — [QuantEasings.easeInOut].
  static const Curve easeInOut = QuantEasings.easeInOut;

  /// Spring overshoot for snap emphasis — [QuantEasings.springBounce].
  static const Curve snapOvershoot = QuantEasings.springBounce;

  /// TODO(UNVERIFIED): curve assumed, confirm with design.
  /// Scrub curve — linear so playhead position tracks the pointer 1:1 with
  /// no easing distortion during drag.
  static const Curve scrub = QuantEasings.linear;

  /// Smooth deceleration for panel motion — [QuantEasings.decelerate].
  static const Curve decelerate = QuantEasings.decelerate;
}

/// Spring parameters for canvas interactions (Framer-Motion convention).
///
/// Like the foundation tokens, these are preserved verbatim; convert to a
/// mass-normalized `SpringDescription` (flutter/physics.dart) when a physics
/// simulation is genuinely needed (magnetic snap), otherwise approximate
/// with `CurvedAnimation` over the matching [CooksDurations].
abstract final class CooksSprings {
  CooksSprings._();

  /// Gentle spring — [QuantSpring.gentle] (tooltips, popovers).
  static const QuantSpring gentle = QuantSpring.gentle;

  /// Snappy spring — [QuantSpring.snappy] (buttons, toggles).
  static const QuantSpring snappy = QuantSpring.snappy;

  /// TODO(UNVERIFIED): params assumed, confirm with design.
  /// Magnetic snap spring — stiffer and lighter than [QuantSpring.snappy]
  /// so a dragged clip locks to the playhead with a crisp, non-bouncy
  /// settle. Web parity target: `{ damping: 26, stiffness: 520, mass: 0.7 }`.
  /// On Flutter, approximate with `CurvedAnimation(curve:
  /// CooksEasings.snapOvershoot)` over [CooksDurations.snapSettle] unless a
  /// physics simulation is genuinely needed.
  static const QuantSpring snap = QuantSpring(
    damping: 26,
    stiffness: 520,
    mass: 0.7,
  );

  /// TODO(UNVERIFIED): params assumed, confirm with design.
  /// Inspector/effects panel spring — softer than [snap] so panels glide
  /// rather than lock. Web parity target:
  /// `{ damping: 30, stiffness: 300, mass: 1.0 }`. On Flutter, approximate
  /// with `CurvedAnimation(curve: CooksEasings.decelerate)` over
  /// [CooksDurations.panelSlide].
  static const QuantSpring panel = QuantSpring(
    damping: 30,
    stiffness: 300,
    mass: 1.0,
  );
}
