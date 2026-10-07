// ============================================================================
// quantube_app - shimmer skeleton for the home feed (QuanTube)
// ============================================================================
//
// Mirrors the [VideoCard] layout (16:9 thumbnail block + avatar/title row)
// with theme-driven shimmer blocks, so the loading state has the same
// footprint as the loaded feed — no layout jump when data arrives.
//
// Shimmer colors come from [QuanTubeColors] (dark/light aware), so the
// skeleton matches the active theme automatically.

import 'package:flutter/material.dart';
import 'package:quantube_core/quantube_core.dart';

/// Loading skeleton for the home feed: a scrollable list of shimmering
/// video-card placeholders with the same geometry as [VideoCard].
class FeedSkeleton extends StatelessWidget {
  const FeedSkeleton({super.key, this.itemCount = 4});

  /// Number of placeholder cards to render. Small and bounded — this is a
  /// loading hint, not an infinite list.
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: itemCount,
      itemBuilder: (BuildContext context, int index) {
        return const _SkeletonCard();
      },
    );
  }
}

/// One shimmering placeholder card: 16:9 thumbnail block + avatar + 2 text
/// lines — the same boxes [VideoCard] occupies.
class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        const AspectRatio(
          aspectRatio: 16 / 9,
          child: _ShimmerBox(),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const _ShimmerBox(
                width: 36,
                height: 36,
                borderRadius: BorderRadius.all(Radius.circular(18)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const <Widget>[
                    _ShimmerBox(height: 16),
                    SizedBox(height: 8),
                    _ShimmerBox(height: 12, widthFactor: 0.6),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A single shimmering block. Animates a highlight band across the block
/// using theme colors (no image assets, no heavy painters — the video
/// texture owns the GPU budget on the player path; the feed keeps it too).
class _ShimmerBox extends StatefulWidget {
  const _ShimmerBox({
    this.width,
    this.height,
    this.widthFactor,
    this.borderRadius =
        const BorderRadius.all(Radius.circular(8)),
  });

  final double? width;
  final double? height;
  final double? widthFactor;
  final BorderRadius borderRadius;

  @override
  State<_ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<_ShimmerBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      // Shimmer loop constant (brand motion token, shimmerCycle 1500ms).
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final Brightness brightness = Theme.of(context).brightness;
    final Color base = brightness == Brightness.dark
        ? QuanTubeColors.shimmerDark
        : QuanTubeColors.shimmerLight;
    final Color highlight = brightness == Brightness.dark
        ? QuanTubeColors.shimmerDarkHighlight
        : QuanTubeColors.shimmerLightHighlight;

    return AnimatedBuilder(
      animation: _controller,
      builder: (BuildContext context, Widget? child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (Rect bounds) {
            final double w = bounds.width;
            if (w <= 0) {
              return LinearGradient(
                colors: <Color>[base, base],
              ).createShader(bounds);
            }
            // Highlight band sweeps left -> right once per loop. Stops are
            // clamped to [0,1] and re-sorted so the gradient is always valid
            // (clamping alone could make them non-monotonic at the edges).
            final double center = (_controller.value * 2.4 - 0.7) * w;
            final double edge = w * 0.35;
            final double s0 = ((center - edge) / w).clamp(0.0, 1.0);
            final double s1 = (center / w).clamp(0.0, 1.0);
            final double s2 = ((center + edge) / w).clamp(0.0, 1.0);
            final List<double> stops = <double>[s0, s1, s2]..sort();
            return LinearGradient(
              colors: <Color>[base, highlight, base],
              stops: stops,
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: base,
          borderRadius: widget.borderRadius,
        ),
        child: widget.widthFactor != null
            ? FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: widget.widthFactor,
                child: Container(
                  decoration: BoxDecoration(
                    color: base,
                    borderRadius: widget.borderRadius,
                  ),
                ),
              )
            : null,
      ),
    );
  }
}
