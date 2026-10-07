import 'package:flutter/material.dart';
import '../components/quant_pillar_top_bar.dart';
import '../models/quant_pillar.dart';

/// Top Squircle Switcher component providing rapid tab-switching across the
/// 5 Sovereign Pillars (Mail, Calendar, Drive, Contacts, QuantGit).
class SquircleSwitcher extends StatelessWidget {
  final QuantPillar activePillar;
  final ValueChanged<QuantPillar> onPillarChanged;
  final EdgeInsetsGeometry padding;

  const SquircleSwitcher({
    super.key,
    required this.activePillar,
    required this.onPillarChanged,
    this.padding = const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
  });

  @override
  Widget build(BuildContext context) {
    return QuantPillarTopBar(
      activePillar: activePillar,
      onPillarSelected: onPillarChanged,
      padding: padding,
    );
  }
}
