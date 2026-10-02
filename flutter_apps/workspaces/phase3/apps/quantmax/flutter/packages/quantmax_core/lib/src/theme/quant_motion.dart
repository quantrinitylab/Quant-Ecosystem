// ============================================================================
// quantmax_core - QuantMax 60fps motion spec
// ============================================================================
//
// Adapted from `packages/brand/src/motion.ts` (SSOT, see phase0
// `quant_motion.dart`), hardened for a short-video competitor: 60fps scroll
// and instant-feeling playback are the product, so this file makes the motion
// BUDGET explicit, not just the values.
//
// Frame budget (the law of this file):
// - 60fps → 16.6ms per frame. Flutter skips a frame past ~8ms of UI-thread
//   work, so:
//   - feed paging and like-burst run on the COMPOSITOR (transform/opacity
//     only); never animate layout, blur, or shadows during scroll.
//   - shimmer skeletons are gradients, never opacity-animated widgets.
//   - video crossfade is a single opacity layer swap, capped at 150ms.
// - If a device drops below 60fps on the feed, cut effects before touching
//   these durations: effects first, timing second (see [motionBudgetRules]).

import 'package:flutter/material.dart';

/// Feed-critical durations — the numbers the 60fps contract depends on.
abstract final class QuantMaxDurations {
  QuantMaxDurations._();

  // -- Feed paging -------------------------------------------------------------

  /// Vertical feed page snap: the video-to-video transition. Snappy enough
  /// to feel instant, slow enough to read as a page turn.
  static const Duration feedPageSnap = Duration(milliseconds: 220);

  /// Feed page settle: trailing settle after [feedPageSnap] releases the
  /// gesture (overscroll absorb).
  static const Duration feedPageSettle = Duration(milliseconds: 120);

  // -- Playback ------------------------------------------------------------------

  /// Video-to-video crossfade on instant switch — single opacity layer.
  static const Duration videoCrossfade = Duration(milliseconds: 150);

  /// Player control fade (play/pause icon, progress bar auto-hide).
  static const Duration controlsFade = Duration(milliseconds: 180);

  // -- Like burst (double-tap heart) -----------------------------------------------

  /// Heart scale pop-in: 0.6 → 1.25 with overshoot.
  static const Duration likePopIn = Duration(milliseconds: 200);

  /// Ring burst fade-out after the pop.
  static const Duration likeRingFade = Duration(milliseconds: 250);

  /// Hold at full scale before fading.
  static const Duration likeHold = Duration(milliseconds: 120);

  // -- Loading / skeleton -----------------------------------------------------------

  /// One shimmer sweep across a feed skeleton card.
  static const Duration shimmerSweep = Duration(milliseconds: 1200);

  /// Skeleton → real video swap.
  static const Duration skeletonSwap = Duration(milliseconds: 150);

  // -- Sheets / overlays ---------------------------------------------------------------

  /// Comment sheet slide-up.
  static const Duration commentSheet = Duration(milliseconds: 300);

  /// Share sheet / action sheet slide-up.
  static const Duration actionSheet = Duration(milliseconds: 280);

  /// Toast / snackbar lifetime on screen.
  static const Duration toastLifetime = Duration(milliseconds: 2400);

  // -- Micro-interactions ----------------------------------------------------------------

  /// Tab switch underline slide (For You / Following).
  static const Duration tabSlide = Duration(milliseconds: 200);

  /// Icon press ripple / scale feedback.
  static const Duration pressFeedback = Duration(milliseconds: 100);

  /// Follow → Following pill state change.
  static const Duration followFlip = Duration(milliseconds: 180);
}

/// Feed-critical easing curves.
abstract final class QuantMaxCurves {
  QuantMaxCurves._();

  /// Page snap: fast start, gentle stop — `cubic-bezier(0.22, 0.61, 0.36, 1)`.
  /// Pairs with [QuantMaxDurations.feedPageSnap].
  static const Curve pageSnap = Cubic(0.22, 0.61, 0.36, 1.0);

  /// Standard enter: `cubic-bezier(0, 0, 0.2, 1)`.
  static const Curve easeOut = Cubic(0.0, 0.0, 0.2, 1.0);

  /// Like-burst overshoot: `cubic-bezier(0.34, 1.56, 0.64, 1)`.
  static const Curve heartPop = Cubic(0.34, 1.56, 0.64, 1.0);

  /// Linear — shimmer sweeps and the music ticker only.
  static const Curve linear = Cubic(0.0, 0.0, 1.0, 1.0);

  /// Sheet enter/exit: `cubic-bezier(0.32, 0.72, 0, 1)` — weighted start,
  /// soft landing.
  static const Curve sheet = Cubic(0.32, 0.72, 0.0, 1.0);
}

/// Music ticker scroll speed, in logical px per second. The ticker animation
/// duration is computed per caption length (`width / tickerSpeed`), never
/// hardcoded, so long titles scroll at a readable constant speed.
abstract final class QuantMaxTicker {
  QuantMaxTicker._();

  /// 60 logical px/sec.
  static const double scrollSpeedPxPerSec = 60.0;

  /// Pause before a ticker loop restarts.
  static const Duration loopPause = Duration(milliseconds: 800);
}

/// The explicit 60fps motion budget. Widget code MUST follow these rules;
/// they are documented here so reviewers and the arch-review program can
/// check against them.
abstract final class QuantMaxMotionBudget {
  QuantMaxMotionBudget._();

  /// Feed pages (`PageView` / custom pager): animate transform only.
  /// No `BackdropFilter`, no animated shadows, no layout animations while
  /// a page transition is running.
  static const String ruleFeedCompositorOnly =
      'feed paging: transform/opacity only, no blur/shadow/layout';

  /// Like-burst: exactly one scale layer + one opacity ring. Both must be
  /// `RepaintBoundary`-wrapped so the video layer beneath does not repaint.
  static const String ruleLikeBurstLayers =
      'like burst: 1 scale + 1 opacity layer, RepaintBoundary-wrapped';

  /// Skeleton shimmer: gradient sweep on one layer; never animate the
  /// opacity of skeleton widgets (forces full-tree repaint).
  static const String ruleShimmerGradient =
      'shimmer: gradient sweep only, no opacity animation';

  /// Degradation order on low-end devices: (1) disable shimmer, (2) drop
  /// the like-burst ring, (3) shorten [QuantMaxDurations.feedPageSnap] is
  /// FORBIDDEN — never shorten paging to fake smoothness.
  static const String ruleDegradationOrder =
      'degrade effects first; never shorten feedPageSnap';
}

/// Feed motion values as a [ThemeExtension], so widgets can read durations
/// from the theme (`Theme.of(context).extension<QuantMaxMotion>()`).
@immutable
final class QuantMaxMotion extends ThemeExtension<QuantMaxMotion> {
  /// Vertical feed page snap.
  final Duration feedPageSnap;

  /// Like-burst heart pop-in.
  final Duration likePopIn;

  /// Like-burst ring fade.
  final Duration likeRingFade;

  /// Shimmer sweep.
  final Duration shimmerSweep;

  /// Comment sheet slide.
  final Duration commentSheet;

  /// Creates the theme motion extension.
  const QuantMaxMotion({
    this.feedPageSnap = QuantMaxDurations.feedPageSnap,
    this.likePopIn = QuantMaxDurations.likePopIn,
    this.likeRingFade = QuantMaxDurations.likeRingFade,
    this.shimmerSweep = QuantMaxDurations.shimmerSweep,
    this.commentSheet = QuantMaxDurations.commentSheet,
  });

  @override
  QuantMaxMotion copyWith({
    Duration? feedPageSnap,
    Duration? likePopIn,
    Duration? likeRingFade,
    Duration? shimmerSweep,
    Duration? commentSheet,
  }) {
    return QuantMaxMotion(
      feedPageSnap: feedPageSnap ?? this.feedPageSnap,
      likePopIn: likePopIn ?? this.likePopIn,
      likeRingFade: likeRingFade ?? this.likeRingFade,
      shimmerSweep: shimmerSweep ?? this.shimmerSweep,
      commentSheet: commentSheet ?? this.commentSheet,
    );
  }

  @override
  QuantMaxMotion lerp(covariant QuantMaxMotion? other, double t) {
    if (other == null) {
      return this;
    }
    return QuantMaxMotion(
      feedPageSnap: _lerpDuration(feedPageSnap, other.feedPageSnap, t),
      likePopIn: _lerpDuration(likePopIn, other.likePopIn, t),
      likeRingFade: _lerpDuration(likeRingFade, other.likeRingFade, t),
      shimmerSweep: _lerpDuration(shimmerSweep, other.shimmerSweep, t),
      commentSheet: _lerpDuration(commentSheet, other.commentSheet, t),
    );
  }
}

/// Linearly interpolates two [Duration]s ([Duration.lerp] does not exist on
/// the SDK type, so the arithmetic is done on microseconds).
Duration _lerpDuration(Duration a, Duration b, double t) => Duration(
      microseconds:
          (a.inMicroseconds + (b.inMicroseconds - a.inMicroseconds) * t)
              .round(),
    );
