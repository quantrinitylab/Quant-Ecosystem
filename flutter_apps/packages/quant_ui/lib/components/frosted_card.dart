import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/quant_colors.dart';

/// Frosted Glass Obsidian Card Widget
///
/// High-performance obsidian card container utilizing Skia/Impeller
/// hardware-accelerated BackdropFilter with zero clipPath calls.
class FrostedCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? borderColor;
  final Color? backgroundColor;
  final double borderRadius;
  final double blurAmount;
  final List<BoxShadow>? boxShadow;

  const FrostedCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16.0),
    this.onTap,
    this.borderColor,
    this.backgroundColor,
    this.borderRadius = 16.0,
    this.blurAmount = 12.0,
    this.boxShadow,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveBorderColor = borderColor ?? QuantColors.hairlineBorder;
    final effectiveBgColor = backgroundColor ?? QuantColors.darkSlateCard.withOpacity(0.85);

    Widget cardContent = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: effectiveBgColor,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(
          color: effectiveBorderColor,
          width: 1.0,
        ),
        boxShadow: boxShadow,
      ),
      child: child,
    );

    if (blurAmount > 0) {
      cardContent = ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurAmount, sigmaY: blurAmount),
          child: cardContent,
        ),
      );
    }

    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(borderRadius),
          splashColor: QuantColors.moltenAmber.withOpacity(0.1),
          highlightColor: Colors.white.withOpacity(0.04),
          child: cardContent,
        ),
      );
    }

    return cardContent;
  }
}
