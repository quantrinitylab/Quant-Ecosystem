import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../data/cooks_repository.dart';
import '../models/cooks_models.dart';

/// Sovereign CapCut-Killer Viral Video Templates Screen.
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (120Hz Impeller acceleration).
class TemplatesScreen extends StatefulWidget {
  final ValueChanged<CooksTemplate>? onSelectTemplate;

  const TemplatesScreen({super.key, this.onSelectTemplate});

  @override
  State<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends State<TemplatesScreen> {
  String _selectedCategory = 'All';
  final List<String> _categories = const [
    'All',
    'Viral Reels',
    'Tech & Reviews',
    'Action & Travel',
    'Education & AI',
  ];

  @override
  Widget build(BuildContext context) {
    final templates = CooksRepository.getTemplates();
    final filtered = _selectedCategory == 'All'
        ? templates
        : templates.where((t) => t.category == _selectedCategory).toList();

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar
            _buildTopBar(),

            // Category Filter Chips
            _buildCategoryChips(),

            // Templates Grid
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(16.0),
                physics: const BouncingScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.65,
                ),
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final tmpl = filtered[index];
                  return _buildTemplateCard(tmpl);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sunriseRose, QuantColors.moltenAmber],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.auto_fix_high_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Viral Templates',
                    style: QuantTypography.titleMedium.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Beat-Synced Auto-Cut Presets',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Search Button
          IconButton(
            icon: const Icon(Icons.search_rounded, size: 22),
            color: QuantColors.textSecondary,
            onPressed: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryChips() {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateSurface,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final cat = _categories[index];
          final isSelected = _selectedCategory == cat;

          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: InkWell(
              onTap: () => setState(() => _selectedCategory = cat),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: isSelected
                      ? QuantColors.moltenAmber.withOpacity(0.2)
                      : QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: isSelected
                        ? QuantColors.moltenAmber
                        : QuantColors.hairlineBorder,
                  ),
                ),
                child: Text(
                  cat,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                    color: isSelected ? QuantColors.moltenAmber : QuantColors.textSecondary,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTemplateCard(CooksTemplate tmpl) {
    return InkWell(
      onTap: () {
        widget.onSelectTemplate?.call(tmpl);
        _showUseTemplateDialog(tmpl);
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Thumbnail preview area
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: tmpl.thumbnailColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(13)),
                  gradient: LinearGradient(
                    colors: [
                      tmpl.thumbnailColor,
                      tmpl.thumbnailColor.withOpacity(0.4),
                    ],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: Stack(
                  children: [
                    Center(
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.4),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 26,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          tmpl.aspectRatio.label,
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${tmpl.durationSec}s',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: QuantColors.moltenAmber,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Information details
            Padding(
              padding: const EdgeInsets.all(10.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tmpl.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.music_note_rounded, size: 12, color: QuantColors.textMuted),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          tmpl.musicName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            color: QuantColors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${tmpl.clipsCount} Clips',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: QuantColors.sovereignCyan,
                        ),
                      ),
                      Text(
                        '${(tmpl.usesCount / 1000).toStringAsFixed(1)}k uses',
                        style: const TextStyle(
                          fontSize: 10,
                          color: QuantColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showUseTemplateDialog(CooksTemplate tmpl) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: Text(
            'Load Template into Studio?',
            style: QuantTypography.titleMedium,
          ),
          content: Text(
            'This will auto-populate your timeline with ${tmpl.clipsCount} beat-matched clip slots and synchronize with "${tmpl.musicName}".',
            style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
            ),
            SquircleButton(
              label: 'Apply Template',
              backgroundColor: QuantColors.moltenAmber,
              textColor: QuantColors.voidObsidian,
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: QuantColors.darkSlateCard,
                    content: Text(
                      'Template "${tmpl.title}" loaded into Studio timeline.',
                      style: const TextStyle(color: QuantColors.textPrimary),
                    ),
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }
}
