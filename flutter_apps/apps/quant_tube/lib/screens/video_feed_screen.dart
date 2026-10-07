import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';
import 'video_player_screen.dart';

/// High-Performance Video Feed Screen for QuanTube
/// Pure 120Hz Impeller hardware acceleration with zero clipPath calls.
class VideoFeedScreen extends StatefulWidget {
  final VoidCallback? onSearchTap;
  final VoidCallback? onNotificationsTap;

  const VideoFeedScreen({
    super.key,
    this.onSearchTap,
    this.onNotificationsTap,
  });

  @override
  State<VideoFeedScreen> createState() => _VideoFeedScreenState();
}

class _VideoFeedScreenState extends State<VideoFeedScreen> {
  String _selectedCategory = 'All';

  @override
  Widget build(BuildContext context) {
    final videos = TubeRepository.getVideos(category: _selectedCategory);

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // Category selector chips bar (pinned below app bar)
          SliverToBoxAdapter(
            child: _buildCategoryChips(),
          ),

          // Sponsored / Ad-Free Sovereign Callout Capsule
          SliverToBoxAdapter(
            child: _buildSovereignFeatureBanner(),
          ),

          // Video Feed List
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final video = videos[index];
                  return _buildVideoCard(video);
                },
                childCount: videos.length,
              ),
            ),
          ),

          // Safe area bottom padding
          const SliverToBoxAdapter(
            child: SizedBox(height: 80),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryChips() {
    return Container(
      height: 48,
      margin: const EdgeInsets.only(top: 8, bottom: 4),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: TubeRepository.categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final cat = TubeRepository.categories[index];
          final isSelected = cat == _selectedCategory;

          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedCategory = cat;
              });
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? QuantColors.crimsonRed : QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected ? QuantColors.crimsonRed : QuantColors.hairlineBorder,
                  width: 1,
                ),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: QuantColors.crimsonRed.withOpacity(0.35),
                          blurRadius: 10,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Center(
                child: Text(
                  cat,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected ? Colors.white : QuantColors.textSecondary,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSovereignFeatureBanner() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: QuantColors.crimsonRed.withOpacity(0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.shield_outlined,
              color: QuantColors.crimsonRed,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SponsorBlock & Ad-Free Engine Active',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Automated segment-skipping for sponsors, intros, and outros with 0 buffer delay.',
                  style: TextStyle(
                    fontSize: 11,
                    color: QuantColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Text(
              'SOVEREIGN',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: QuantColors.statusSuccess,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoCard(VideoItem video) {
    return GestureDetector(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => VideoPlayerScreen(video: video),
          ),
        );
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 20),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 16:9 Thumbnail preview container
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Image with rounded corners
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
                    child: Image.network(
                      video.thumbnailUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: QuantColors.elevatedCard,
                        child: const Center(
                          child: Icon(
                            Icons.play_circle_fill_rounded,
                            color: QuantColors.crimsonRed,
                            size: 48,
                          ),
                        ),
                      ),
                    ),
                  ),

                  // Subtle gradient shadow at bottom
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 50,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            Colors.black.withOpacity(0.85),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // Duration Badge (bottom-right)
                  Positioned(
                    bottom: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.85),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: Colors.white24,
                          width: 0.5,
                        ),
                      ),
                      child: Text(
                        video.formattedDuration,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ),

                  // SponsorBlock protected chip (bottom-left)
                  if (video.hasSponsorBlockSegments)
                    Positioned(
                      bottom: 10,
                      left: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: QuantColors.moltenAmber.withOpacity(0.9),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.fast_forward_rounded,
                              size: 13,
                              color: Colors.white,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Auto-Skip Ready',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // Video Details Row
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Channel Avatar
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: QuantColors.hairlineBorder, width: 1),
                      image: DecorationImage(
                        image: NetworkImage(video.channelAvatarUrl),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Title and metadata
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          video.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: QuantColors.textPrimary,
                            height: 1.3,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Text(
                              video.channelTitle,
                              style: const TextStyle(
                                fontSize: 12,
                                color: QuantColors.textSecondary,
                              ),
                            ),
                            if (video.isChannelVerified) ...[
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.check_circle_rounded,
                                size: 14,
                                color: QuantColors.sovereignCyan,
                              ),
                            ],
                            const SizedBox(width: 6),
                            const Text(
                              '•',
                              style: TextStyle(
                                fontSize: 12,
                                color: QuantColors.textMuted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              video.formattedViews,
                              style: const TextStyle(
                                fontSize: 12,
                                color: QuantColors.textMuted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            const Text(
                              '•',
                              style: TextStyle(
                                fontSize: 12,
                                color: QuantColors.textMuted,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              video.uploadTimeAgo,
                              style: const TextStyle(
                                fontSize: 12,
                                color: QuantColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // 3-dot options menu
                  IconButton(
                    icon: const Icon(
                      Icons.more_vert_rounded,
                      color: QuantColors.textMuted,
                      size: 20,
                    ),
                    onPressed: () => _showVideoOptionsMenu(video),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showVideoOptionsMenu(VideoItem video) {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: const Icon(Icons.playlist_add_rounded, color: QuantColors.textPrimary),
                  title: const Text('Save to Watch Later', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Saved to Watch Later')),
                    );
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.share_rounded, color: QuantColors.textPrimary),
                  title: const Text('Share Sovereign Link', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () {
                    Navigator.pop(context);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.download_rounded, color: QuantColors.textPrimary),
                  title: const Text('Download 1080p Offline', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () {
                    Navigator.pop(context);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.block_rounded, color: QuantColors.statusError),
                  title: const Text('Not Interested', style: TextStyle(color: QuantColors.statusError)),
                  onTap: () {
                    Navigator.pop(context);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
