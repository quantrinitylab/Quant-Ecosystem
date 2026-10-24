import 'package:flutter/material.dart';

import '../quant_mail_tokens.dart';

/// Pulses between two panel tones (opacity only). With reduce motion on it
/// stays static. Wrap skeleton shapes in it; it is hidden from semantics.
class QmShimmer extends StatefulWidget {
  const QmShimmer({super.key, required this.child});

  final Widget child;

  @override
  State<QmShimmer> createState() => _QmShimmerState();
}

class _QmShimmerState extends State<QmShimmer> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.55, end: 1).animate(
          CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
        ),
        child: widget.child,
      ),
    );
  }
}

class QmSkeletonBar extends StatelessWidget {
  const QmSkeletonBar({super.key, this.widthFactor = 1, this.height = 12});

  final double widthFactor;
  final double height;

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return FractionallySizedBox(
      widthFactor: widthFactor,
      alignment: Alignment.centerLeft,
      child: Container(
        height: height,
        decoration: BoxDecoration(color: t.panelRaised, borderRadius: BorderRadius.circular(6)),
      ),
    );
  }
}

/// Mail row placeholder: avatar circle and three bars (60/90/70 percent).
class QmMailRowSkeleton extends StatelessWidget {
  const QmMailRowSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(QmSpace.gutter + 4, 10, QmSpace.gutter, 10),
      child: SizedBox(
        height: 56,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(width: 40, height: 40, decoration: BoxDecoration(color: t.panelRaised, shape: BoxShape.circle)),
            const SizedBox(width: QmSpace.md),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  QmSkeletonBar(widthFactor: 0.6),
                  SizedBox(height: 8),
                  QmSkeletonBar(widthFactor: 0.9),
                  SizedBox(height: 8),
                  QmSkeletonBar(widthFactor: 0.7),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A list of [count] row skeletons.
class QmMailListSkeleton extends StatelessWidget {
  const QmMailListSkeleton({super.key, this.count = 8});

  final int count;

  @override
  Widget build(BuildContext context) {
    return QmShimmer(
      child: Column(
        children: <Widget>[for (int i = 0; i < count; i++) const QmMailRowSkeleton()],
      ),
    );
  }
}

/// Thread placeholder: header block and four body bars.
class QmThreadSkeleton extends StatelessWidget {
  const QmThreadSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final QuantMailTokens t = QuantMailTokens.of(context);
    return QmShimmer(
      child: Padding(
        padding: const EdgeInsets.all(QmSpace.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(width: 40, height: 40, decoration: BoxDecoration(color: t.panelRaised, shape: BoxShape.circle)),
                const SizedBox(width: QmSpace.md),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      QmSkeletonBar(widthFactor: 0.5),
                      SizedBox(height: 8),
                      QmSkeletonBar(widthFactor: 0.3),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: QmSpace.xl),
            const QmSkeletonBar(),
            const SizedBox(height: 12),
            const QmSkeletonBar(widthFactor: 0.95),
            const SizedBox(height: 12),
            const QmSkeletonBar(widthFactor: 0.85),
            const SizedBox(height: 12),
            const QmSkeletonBar(widthFactor: 0.6),
          ],
        ),
      ),
    );
  }
}
