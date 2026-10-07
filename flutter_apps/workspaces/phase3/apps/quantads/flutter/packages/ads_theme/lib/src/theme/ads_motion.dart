// ============================================================================
// ads_theme - motion tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `quant_motion.dart` (which ports
// `packages/brand/src/motion.ts`, SSOT).
//
// Mapping rules (same as foundation):
// - TS millisecond numbers → `Duration(milliseconds: …)`.
// - CSS `cubic-bezier(a, b, c, d)` strings → `Cubic(a, b, c, d)` constants.
// - TS spring parameter objects (`{damping, stiffness, mass}`) → the
//   immutable [AdsSpring] value type below, kept verbatim (Framer-Motion
//   convention); convert to `SpringDescription` per the notes when a
//   physics-based animation is needed.

import 'package:flutter/material.dart';

/// Motion durations, ported from `duration` in `packages/brand/src/motion.ts`.
abstract final class AdsDurations {
  AdsDurations._();

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
abstract final class AdsEasings {
  AdsEasings._();

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

/// Immutable spring parameters, ported from `spring` in
/// `packages/brand/src/motion.ts`.
///
/// Preserved verbatim so web and Flutter resolve the same constants from the
/// same source of truth. When a physics-based animation is required, convert
/// with a mass-normalized `SpringDescription` — see the per-spring notes.
@immutable
final class AdsSpring {
  /// Damping coefficient (Framer-Motion convention).
  final double damping;

  /// Stiffness coefficient (Framer-Motion convention).
  final double stiffness;

  /// Mass of the animated object.
  final double mass;

  /// Creates a spring parameter set.
  const AdsSpring({
    required this.damping,
    required this.stiffness,
    required this.mass,
  });

  /// Gentle spring for subtle transitions (modals, tooltips).
  ///
  /// Web parity: `{ damping: 20, stiffness: 100, mass: 1 }`. On Flutter,
  /// approximate with `CurvedAnimation(curve: AdsEasings.decelerate)` over
  /// [AdsDurations.moderate] unless a physics simulation is genuinely
  /// needed.
  static const AdsSpring gentle = AdsSpring(
    damping: 20,
    stiffness: 100,
    mass: 1,
  );

  /// Snappy spring for interactive feedback (buttons, toggles).
  ///
  /// Web parity: `{ damping: 30, stiffness: 400, mass: 0.8 }`. On Flutter,
  /// approximate with `CurvedAnimation(curve: AdsEasings.easeOut)` over
  /// [AdsDurations.fast].
  static const AdsSpring snappy = AdsSpring(
    damping: 30,
    stiffness: 400,
    mass: 0.8,
  );

  /// Bouncy spring for playful elements (notifications, badges, credit pops).
  ///
  /// Web parity: `{ damping: 10, stiffness: 200, mass: 1.2 }`. This is the
  /// one spring that genuinely benefits from a physics simulation: convert
  /// with a mass-normalized `SpringDescription` (flutter/physics.dart) in
  /// an `AnimationController.animateWith(SpringSimulation(…))`.
  static const AdsSpring bouncy = AdsSpring(
    damping: 10,
    stiffness: 200,
    mass: 1.2,
  );

  /// Stiff spring for quick responses (dropdowns, menus, sheet snaps).
  ///
  /// Web parity: `{ damping: 40, stiffness: 600, mass: 0.5 }`. On Flutter,
  /// approximate with `CurvedAnimation(curve: AdsEasings.easeOut)` over
  /// [AdsDurations.instant]–[AdsDurations.fast].
  static const AdsSpring stiff = AdsSpring(
    damping: 40,
    stiffness: 600,
    mass: 0.5,
  );

  @override
  String toString() =>
      'AdsSpring(damping: $damping, stiffness: $stiffness, mass: $mass)';
}
