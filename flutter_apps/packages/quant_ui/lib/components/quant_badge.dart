import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';


enum QuantBadgeVariant {
  success,
  warning,
  error,
  info,
  amber,
  purple,
  cyan,
  neutral,
}

/// Precision Obsidian Micro Badge
///
/// Used for latency telemetry (<5ms), security markers (E2EE), unread
/// counters, and priority tags.
class QuantBadge extends StatelessWidget {
  final String label;
  final QuantBadgeVariant variant;
  final IconData? leadingIcon;
  final VoidCallback? onTap;

  const QuantBadge({
    super.key,
    required this.label,
    this.variant = QuantBadgeVariant.success,
    this.leadingIcon,
    this.onTap,
  });

  Color _resolveColor() {
    switch (variant) {
      case QuantBadgeVariant.success:
        return QuantColors.statusSuccess;
      case QuantBadgeVariant.warning:
        return QuantColors.statusWarning;
      case QuantBadgeVariant.error:
        return QuantColors.statusError;
      case QuantBadgeVariant.info:
        return QuantColors.statusInfo;
      case QuantBadgeVariant.amber:
        return QuantColors.moltenAmber;
      case QuantBadgeVariant.purple:
        return QuantColors.obsidianPurple;
      case QuantBadgeVariant.cyan:
        return QuantColors.sovereignCyan;
      case QuantBadgeVariant.neutral:
        return QuantColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _resolveColor();

    Widget badge = Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: color.withOpacity(0.32),
          width: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leadingIcon != null) ...[
            Icon(leadingIcon, size: 11, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: QuantTypography.labelSpeed.copyWith(
              color: color,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );

    if (onTap != null) {
      return GestureDetector(
        onTap: onTap,
        child: badge,
      );
    }

    return badge;
  }
}
