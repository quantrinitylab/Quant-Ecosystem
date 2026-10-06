import 'package:flutter/material.dart';
import '../models/quant_pillar.dart';
import 'package:quant_theme/quant_theme.dart';


/// Context-Specific Bottom Navigation Bar for Quant Unified Ecosystem
///
/// Dynamically renders 5 contextual sub-views per active pillar:
/// - Mail: Inbox, Priority, Teams, Sent, Archive
/// - Calendar: Agenda, Month, Booking, QuantMeet, Reminders
/// - Drive: My Files, Shared, Vault (E2EE), Starred, Cleaner (FastCDC)
/// - Contacts: Contacts, VIPs, Companies, AI Dedup, Circles
/// - QuantGit: Repos, PRs, Issues, Actions, Copilot
///
/// Hardware-accelerated with zero clipPath calls and zero raw Unicode emojis.
class ContextBottomNavBar extends StatelessWidget {
  final QuantPillar activePillar;
  final int selectedIndex;
  final ValueChanged<int> onTabSelected;
  final Map<String, int>? badges;
  final bool showLabels;

  const ContextBottomNavBar({
    super.key,
    required this.activePillar,
    required this.selectedIndex,
    required this.onTabSelected,
    this.badges,
    this.showLabels = true,
  });

  @override
  Widget build(BuildContext context) {
    final subViews = activePillar.subViews;
    final accent = activePillar.accentColor;

    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(
            color: QuantColors.hairlineBorder,
            width: 1.0,
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Container(
          height: showLabels ? 64 : 52,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(subViews.length, (index) {
              final subView = subViews[index];
              final isSelected = index == selectedIndex;
              final badgeCount = badges?[subView.id] ?? 0;

              return Expanded(
                child: _NavBarItem(
                  subView: subView,
                  isSelected: isSelected,
                  accentColor: accent,
                  badgeCount: badgeCount,
                  showLabel: showLabels,
                  onTap: () => onTabSelected(index),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _NavBarItem extends StatefulWidget {
  final PillarSubView subView;
  final bool isSelected;
  final Color accentColor;
  final int badgeCount;
  final bool showLabel;
  final VoidCallback onTap;

  const _NavBarItem({
    required this.subView,
    required this.isSelected,
    required this.accentColor,
    required this.badgeCount,
    required this.showLabel,
    required this.onTap,
  });

  @override
  State<_NavBarItem> createState() => _NavBarItemState();
}

class _NavBarItemState extends State<_NavBarItem> {
  bool _isPressed = false;

  @override
  Widget build(BuildContext context) {
    final isSelected = widget.isSelected;
    final accent = widget.accentColor;
    final subView = widget.subView;

    return GestureDetector(
      onTapDown: (_) => setState(() => _isPressed = true),
      onTapUp: (_) => setState(() => _isPressed = false),
      onTapCancel: () => setState(() => _isPressed = false),
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _isPressed ? 0.92 : (isSelected ? 1.0 : 0.98),
        duration: const Duration(milliseconds: 160),
        curve: Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          decoration: BoxDecoration(
            color: isSelected
                ? accent.withOpacity(0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected
                  ? accent.withOpacity(0.3)
                  : Colors.transparent,
              width: 1.0,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(
                    subView.icon,
                    size: 22,
                    color: isSelected ? accent : QuantColors.textSecondary,
                  ),
                  if (widget.badgeCount > 0)
                    Positioned(
                      top: -4,
                      right: -8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: QuantColors.crimsonRed,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: QuantColors.crimsonRed.withOpacity(0.4),
                              blurRadius: 4,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                        child: Text(
                          widget.badgeCount > 99 ? '99+' : '${widget.badgeCount}',
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            height: 1.1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              if (widget.showLabel) ...[
                const SizedBox(height: 3),
                Text(
                  subView.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    letterSpacing: -0.1,
                    color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
