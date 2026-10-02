import 'package:flutter/material.dart';
import '../theme/quant_colors.dart';
import '../theme/quant_typography.dart';

/// Dynamic Island "Quant AI Live Capsule"
///
/// Frosted obsidian pill (#090A0E) with a pulsing molten beacon dot (#FF8C42),
/// real-time status telemetry, and interactive tap callback to invoke
/// Quanty Copilot / Sovereign Agent OS.
class QuantAiCapsule extends StatefulWidget {
  final String title;
  final String statusText;
  final VoidCallback? onTap;
  final Color beaconColor;
  final bool isPulsing;
  final IconData? leadingIcon;

  const QuantAiCapsule({
    super.key,
    this.title = 'Quant AI Copilot',
    String? statusText,
    String? speedText,
    this.onTap,
    this.beaconColor = QuantColors.moltenAmber,
    this.isPulsing = true,
    this.leadingIcon = Icons.auto_awesome_rounded,
  }) : statusText = statusText ?? speedText ?? '<5ms E2EE';

  @override
  State<QuantAiCapsule> createState() => _QuantAiCapsuleState();
}

class _QuantAiCapsuleState extends State<QuantAiCapsule>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );

    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOut,
    );

    if (widget.isPulsing) {
      _pulseController.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant QuantAiCapsule oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isPulsing != oldWidget.isPulsing) {
      if (widget.isPulsing) {
        _pulseController.repeat(reverse: true);
      } else {
        _pulseController.stop();
        _pulseController.value = 1.0;
      }
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final beaconColor = widget.beaconColor;

    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _isPressed ? 0.96 : 1.0,
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOutCubic,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: QuantColors.hairlineBorder,
              width: 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: beaconColor.withOpacity(0.14),
                blurRadius: 14,
                spreadRadius: 1,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pulsing Beacon Dot
              AnimatedBuilder(
                animation: _pulseAnimation,
                builder: (context, child) {
                  final pulseVal = widget.isPulsing ? _pulseAnimation.value : 1.0;
                  return Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: beaconColor.withOpacity(0.3 * pulseVal),
                        ),
                      ),
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: beaconColor,
                          boxShadow: [
                            BoxShadow(
                              color: beaconColor.withOpacity(0.6 * pulseVal),
                              blurRadius: 6,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(width: 8),

              // Optional Leading AI Icon
              if (widget.leadingIcon != null) ...[
                Icon(
                  widget.leadingIcon,
                  size: 14,
                  color: beaconColor,
                ),
                const SizedBox(width: 6),
              ],

              // Capsule Title
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                  color: QuantColors.textPrimary,
                ),
              ),
              const SizedBox(width: 8),

              // Live Status Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: QuantColors.statusSuccess.withOpacity(0.3),
                    width: 0.5,
                  ),
                ),
                child: Text(
                  widget.statusText,
                  style: QuantTypography.labelSpeed.copyWith(
                    fontSize: 10,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
