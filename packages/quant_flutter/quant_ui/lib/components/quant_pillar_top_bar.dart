import 'package:flutter/material.dart';
import '../models/quant_pillar.dart';
import '../theme/quant_colors.dart';
import '../theme/quant_typography.dart';

/// Top 5-Pillar Squircle Mode Switcher
///
/// Provides luxury squircle tiles for switching between Mail, Calendar, Drive,
/// Contacts, and QuantGit. Features soft-glow box shadows, hairline borders,
/// spring transitions, and zero clipPath calls for Impeller optimization.
class QuantPillarTopBar extends StatelessWidget {
  final QuantPillar activePillar;
  final ValueChanged<QuantPillar> onPillarSelected;
  final EdgeInsetsGeometry padding;
  final List<QuantPillar> pillars;

  const QuantPillarTopBar({
    super.key,
    required this.activePillar,
    required this.onPillarSelected,
    this.padding = const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
    this.pillars = QuantPillar.values,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      color: QuantColors.voidObsidian,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: pillars.map((pillar) {
          final isSelected = pillar == activePillar;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3.0),
              child: _PillarTile(
                pillar: pillar,
                isSelected: isSelected,
                onTap: () => onPillarSelected(pillar),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _PillarTile extends StatefulWidget {
  final QuantPillar pillar;
  final bool isSelected;
  final VoidCallback onTap;

  const _PillarTile({
    required this.pillar,
    required this.isSelected,
    required this.onTap,
  });

  @override
  State<_PillarTile> createState() => _PillarTileState();
}

class _PillarTileState extends State<_PillarTile> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final pillar = widget.pillar;
    final isSelected = widget.isSelected;
    final accent = pillar.accentColor;

    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _isPressed ? 0.94 : (isSelected ? 1.02 : 1.0),
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutBack,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          height: 60,
          decoration: BoxDecoration(
            color: isSelected
                ? QuantColors.darkSlateCard
                : QuantColors.darkSlateCard.withOpacity(0.4),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isSelected
                  ? accent.withOpacity(0.7)
                  : QuantColors.hairlineBorder,
              width: isSelected ? 1.2 : 1.0,
            ),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: accent.withOpacity(0.24),
                      blurRadius: 14,
                      spreadRadius: 1,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : const [],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: isSelected
                      ? accent.withOpacity(0.16)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  isSelected ? pillar.icon : pillar.outlinedIcon,
                  size: 20,
                  color: isSelected ? accent : QuantColors.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                pillar.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: QuantTypography.pillarLabel.copyWith(
                  color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
                  fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
