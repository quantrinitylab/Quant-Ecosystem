// ============================================================================
// gram_core - motion tokens
// ============================================================================
//
// Adapted from `quant_foundation`'s `QuantDurations` / `QuantEasings` /
// `QuantSpring`, re-voiced for QuantGram: feed scroll, hero transitions,
// story progress, and shimmer placeholders are the animations that define
// this app, so they get first-class tokens alongside the standard set.
//
// Mapping rules (kept from the foundation port):
// - TS millisecond numbers -> `Duration(milliseconds: ...)`.
// - CSS `cubic-bezier(a, b, c, d)` strings -> `Cubic(a, b, c, d)` constants.
// - Framer-Motion `{ damping, stiffness, mass }` spring objects -> the
//   immutable [GramSpring] value type (see its docs for Flutter conversion
//   notes).

import 'package:flutter/material.dart';

/// Motion durations for QuantGram.
abstract final class GramDurations {
  GramDurations._();

  /// Instant feedback — 50ms.
  static const Duration instant = Duration(milliseconds: 50);

  /// Fast interaction — 100ms. Default for taps and toggles.
  static const Duration fast = Duration(milliseconds: 100);

  /// Normal transition — 200ms. Default for most UI transitions.
  static const Duration normal = Duration(milliseconds: 200);

  /// Deliberate transition — 300ms.
  static const Duration moderate = Duration(milliseconds: 300);

  /// Slow / cinematic transition — 500ms.
  static const Duration slow = Duration(milliseconds: 500);

  // -- QuantGram-specific ----------------------------------------------------

  /// Hero flight (feed -> post detail, viewer opens) — 500ms with
  /// [GramEasings.decelerate] for a cinematic feel.
  static const Duration heroFlight = Duration(milliseconds: 500);

  /// One story segment's progress — 5s, linear ([GramEasings.linear]).
  ///
  /// The canonical per-segment story duration; long-press pause and segment
  /// skipping build on this single token.
  static const Duration storyProgress = Duration(seconds: 5);

  /// One shimmer sweep cycle (skeleton placeholders) — 1500ms with
  /// [GramEasings.easeInOut], repeating.
  static const Duration shimmerCycle = Duration(milliseconds: 1500);

  /// Double-tap like burst — 300ms with [GramEasings.springBounce].
  static const Duration likeBurst = Duration(milliseconds: 300);
}

/// Motion easing curves for QuantGram.
abstract final class GramEasings {
  GramEasings._();

  /// Standard ease-out for enter transitions: `cubic-bezier(0, 0, 0.2, 1)`.
  static const Curve easeOut = Cubic(0.0, 0.0, 0.2, 1.0);

  /// Standard ease-in for exit transitions: `cubic-bezier(0.4, 0, 1, 1)`.
  static const Curve easeIn = Cubic(0.4, 0.0, 1.0, 1.0);

  /// Standard ease-in-out for move transitions: `cubic-bezier(0.4, 0, 0.2, 1)`.
  static const Curve easeInOut = Cubic(0.4, 0.0, 0.2, 1.0);

  /// Spring-like overshoot for emphasis: `cubic-bezier(0.34, 1.56, 0.64, 1)`.
  ///
  /// Pairs with [GramDurations.likeBurst] for the double-tap like burst.
  static const Curve springBounce = Cubic(0.34, 1.56, 0.64, 1.0);

  /// Smooth deceleration for a natural feel: `cubic-bezier(0, 0, 0, 1)`.
  ///
  /// Pairs with [GramDurations.heroFlight] for hero transitions.
  static const Curve decelerate = Cubic(0.0, 0.0, 0.0, 1.0);

  /// Linear, for continuous animations: `cubic-bezier(0, 0, 1, 1)`.
  ///
  /// Pairs with [GramDurations.storyProgress] and
  /// [GramDurations.shimmerCycle].
  static const Curve linear = Cubic(0.0, 0.0, 1.0, 1.0);
}

/// Immutable spring parameters, adapted from `quant_foundation`'s
/// `QuantSpring` (Framer-Motion `{ damping, stiffness, mass }` convention).
///
/// Preserved verbatim from the brand motion tokens so web and Flutter resolve
/// the same constants. When a physics-based animation is required, convert
/// with a mass-normalized `SpringDescription` (flutter/physics.dart) in an
/// `AnimationController.animateWith(SpringSimulation(...))`; for web-parity
/// screens prefer a `CurvedAnimation` with the matching [GramEasings] curve
/// (see the per-spring notes).
@immutable
final class GramSpring {
  /// Damping coefficient (Framer-Motion convention).
  final double damping;

  /// Stiffness coefficient (Framer-Motion convention).
  final double stiffness;

  /// Mass of the animated object.
  final double mass;

  /// Creates a spring parameter set.
  const GramSpring({
    required this.damping,
    required this.stiffness,
    required this.mass,
  });

  /// Gentle spring for subtle transitions (modals, tooltips).
  ///
  /// Approximate with `CurvedAnimation(curve: GramEasings.decelerate)` over
  /// [GramDurations.moderate] unless a physics simulation is genuinely
  /// needed.
  static const GramSpring gentle = GramSpring(
    damping: 20,
    stiffness: 100,
    mass: 1,
  );

  /// Snappy spring for interactive feedback (like button, toggles).
  ///
  /// Approximate with `CurvedAnimation(curve: GramEasings.easeOut)` over
  /// [GramDurations.fast].
  static const GramSpring snappy = GramSpring(
    damping: 30,
    stiffness: 400,
    mass: 0.8,
  );

  /// Bouncy spring for playful elements (notifications, badges, like burst).
  ///
  /// Genuinely benefits from a physics simulation: convert with a
  /// mass-normalized `SpringDescription` (flutter/physics.dart) in an
  /// `AnimationController.animateWith(SpringSimulation(...))`. Otherwise
  /// `CurvedAnimation(curve: GramEasings.springBounce)` over
  /// [GramDurations.likeBurst].
  static const GramSpring bouncy = GramSpring(
    damping: 10,
    stiffness: 200,
    mass: 1.2,
  );

  /// Stiff spring for quick responses (dropdowns, menus).
  ///
  /// Approximate with `CurvedAnimation(curve: GramEasings.easeOut)` over
  /// [GramDurations.instant]–[GramDurations.fast].
  static const GramSpring stiff = GramSpring(
    damping: 40,
    stiffness: 600,
    mass: 0.5,
  );

  @override
  String toString() =>
      'GramSpring(damping: $damping, stiffness: $stiffness, mass: $mass)';
}
