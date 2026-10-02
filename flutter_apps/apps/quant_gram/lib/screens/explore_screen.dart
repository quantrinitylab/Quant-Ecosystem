import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../data/gram_repository.dart';
import '../models/gram_models.dart';
import 'profile_matrix_screen.dart';

/// Explore & Discovery Screen for QuantGram
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final TextEditingController _searchController = TextEditingController();
  final List<String> _categories = [
    'Trending',
    'Impeller 120Hz',
    'QuantAI',
    'Sovereignty',
    'Architecture',
    'Audio Synth',
    'Mobile Dev',
  ];
  int _selectedCategoryIndex = 0;
  late List<ReelItem> _reels;

  @override
  void initState() {
    super.initState();
    _reels = GramRepository.getReels();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Search Bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search_rounded, color: QuantColors.textSecondary, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Search sovereign creators, tags, and sounds...',
                          hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                    ),
                    if (_searchController.text.isNotEmpty)
                      GestureDetector(
                        onTap: () => setState(() => _searchController.clear()),
                        child: const Icon(Icons.close_rounded, size: 18, color: QuantColors.textMuted),
                      ),
                  ],
                ),
              ),
            ),

            // Horizontal Filter Categories
            SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                itemCount: _categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final isSelected = index == _selectedCategoryIndex;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedCategoryIndex = index),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected ? QuantColors.sunriseRose : QuantColors.darkSlateCard,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isSelected ? QuantColors.sunriseRose : QuantColors.hairlineBorder,
                        ),
                      ),
                      child: Text(
                        _categories[index],
                        style: QuantTypography.bodySmall.copyWith(
                          color: isSelected ? Colors.white : QuantColors.textSecondary,
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),

            // Masonry-style Explore Grid
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(1.5),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 1.5,
                  mainAxisSpacing: 1.5,
                  childAspectRatio: 0.68,
                ),
                itemCount: _reels.length * 3,
                itemBuilder: (context, index) {
                  final reel = _reels[index % _reels.length];
                  final isVideo = index % 2 == 0;

                  return GestureDetector(
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialBarPageRoute(reel: reel),
                      );
                    },
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(
                          reel.thumbnailUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: QuantColors.elevatedCard,
                            child: const Icon(Icons.broken_image_outlined, color: Colors.white24),
                          ),
                        ),
                        if (isVideo)
                          Positioned(
                            top: 6,
                            right: 6,
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Icon(
                                Icons.smart_display_rounded,
                                color: Colors.white,
                                size: 14,
                              ),
                            ),
                          ),
                        Positioned(
                          left: 6,
                          bottom: 6,
                          child: Row(
                            children: [
                              const Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 14,
                                shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                              ),
                              const SizedBox(width: 2),
                              Text(
                                '${(reel.viewsCount / 1000).toStringAsFixed(0)}K',
                                style: QuantTypography.bodySmall.copyWith(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  shadows: const [Shadow(color: Colors.black, blurRadius: 4)],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
