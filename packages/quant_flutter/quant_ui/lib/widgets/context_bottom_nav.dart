import 'package:flutter/material.dart';
import '../components/context_bottom_nav_bar.dart';
import '../models/quant_pillar.dart';

/// Context-Specific Adaptive Bottom Navigation Bar for Quant Ecosystem.
class ContextBottomNav extends StatelessWidget {
  final QuantPillar activePillar;
  final int selectedIndex;
  final ValueChanged<int> onTabSelected;
  final Map<String, int>? badges;
  final bool showLabels;

  const ContextBottomNav({
    super.key,
    required this.activePillar,
    required this.selectedIndex,
    required this.onTabSelected,
    this.badges,
    this.showLabels = true,
  });

  @override
  Widget build(BuildContext context) {
    return ContextBottomNavBar(
      activePillar: activePillar,
      selectedIndex: selectedIndex,
      onTabSelected: onTabSelected,
      badges: badges,
      showLabels: showLabels,
    );
  }
}
