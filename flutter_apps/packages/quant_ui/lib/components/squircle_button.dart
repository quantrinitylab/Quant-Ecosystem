import 'package:flutter/material.dart';
import '../theme/quant_colors.dart';
import '../theme/quant_typography.dart';

/// Smooth Squircle Action Button
///
/// Luxury action button with squircle curvature (BorderRadius.circular(14)),
/// zero clipPath calls, and full tactile feedback.
class SquircleButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color backgroundColor;
  final Color textColor;
  final bool isLoading;
  final double height;
  final EdgeInsetsGeometry padding;
  final bool isFullWidth;
  final BorderSide? border;

  const SquircleButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.backgroundColor = QuantColors.moltenAmber,
    this.textColor = Colors.white,
    this.isLoading = false,
    this.height = 48.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 20.0),
    this.isFullWidth = false,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    Widget button = SizedBox(
      height: height,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: textColor,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: border ?? BorderSide.none,
          ),
          padding: padding,
        ),
        onPressed: isLoading ? null : onPressed,
        child: isLoading
            ? SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(textColor),
                ),
              )
            : Row(
                mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: textColor),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    label,
                    style: QuantTypography.titleMedium.copyWith(
                      color: textColor,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
      ),
    );

    if (isFullWidth) {
      return SizedBox(
        width: double.infinity,
        child: button,
      );
    }

    return button;
  }
}
