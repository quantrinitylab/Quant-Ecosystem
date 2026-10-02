import 'package:flutter/material.dart';
import '../components/quant_ai_capsule.dart';
import '../theme/quant_colors.dart';

/// Dynamic Island Capsule for real-time AI status, audio activity, and sub-5ms sync telemetry.
class DynamicIslandCapsule extends StatelessWidget {
  final String title;
  final String statusText;
  final VoidCallback? onTap;
  final Color beaconColor;
  final bool isPulsing;
  final IconData? leadingIcon;

  const DynamicIslandCapsule({
    super.key,
    this.title = 'Quant AI Copilot',
    this.statusText = '<5ms E2EE',
    this.onTap,
    this.beaconColor = QuantColors.moltenAmber,
    this.isPulsing = true,
    this.leadingIcon = Icons.auto_awesome_rounded,
  });

  @override
  Widget build(BuildContext context) {
    return QuantAiCapsule(
      title: title,
      statusText: statusText,
      onTap: onTap,
      beaconColor: beaconColor,
      isPulsing: isPulsing,
      leadingIcon: leadingIcon,
    );
  }
}
