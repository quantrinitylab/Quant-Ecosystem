import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Official Quant AI logo — animated.
///
/// White melting ghost face + purple neon ring (user-approved brand asset).
///
/// Animations (all transform/opacity only, GPU-friendly):
/// - Gentle float: the ghost bobs up and down continuously.
/// - Ring glow pulse: purple halo breathes around the logo.
/// - Thinking state: faster, stronger pulse + subtle wobble while the AI
///   is working.
/// NOTE: eye-blink is not possible on the raster asset; it would need a
/// vector redraw of the mark. Float + glow deliver the "alive" feel.
class QuantAiLogo extends StatefulWidget {
  final double size;
  final bool thinking;

  const QuantAiLogo({
    super.key,
    this.size = 40.0,
    this.thinking = false,
  });

  @override
  State<QuantAiLogo> createState() => _QuantAiLogoState();
}

class _QuantAiLogoState extends State<QuantAiLogo>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value * 2 * math.pi;
        // Gentle vertical float.
        final dy = math.sin(t) * 2.5;
        // Glow phase 0..1.
        final speed = widget.thinking ? 3.0 : 1.0;
        final glow = 0.5 + 0.5 * math.sin(t * speed - math.pi / 2);
        // Subtle wobble while thinking.
        final wobble = widget.thinking ? math.sin(t * 2) * 0.06 : 0.0;

        final baseOpacity = widget.thinking ? 0.35 : 0.22;
        final pulseAmp = widget.thinking ? 0.25 : 0.18;
        final baseBlur = widget.thinking ? 12.0 : 8.0;
        final blurAmp = widget.thinking ? 8.0 : 5.0;

        return Transform.translate(
          offset: Offset(0, dy),
          child: Transform.rotate(
            angle: wobble,
            child: Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFA855F7)
                        .withOpacity(baseOpacity + pulseAmp * glow),
                    blurRadius: baseBlur + blurAmp * glow,
                    spreadRadius: 1.0,
                  ),
                ],
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/quant-ai-logo.jpg',
                  width: widget.size,
                  height: widget.size,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: const Color(0xFF1A0B2E),
                    alignment: Alignment.center,
                    child: Icon(
                      Icons.smart_toy_rounded,
                      color: const Color(0xFFA855F7),
                      size: widget.size * 0.5,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
