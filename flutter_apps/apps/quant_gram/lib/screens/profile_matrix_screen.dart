import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../data/gram_repository.dart';
import '../models/gram_models.dart';

/// Creator Profile Screen with 4-Tab Content Matrix
/// (Reels, Saved, Liked, Tagged)
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class ProfileMatrixScreen extends StatefulWidget {
  final VoidCallback? onSettingsTap;

  const ProfileMatrixScreen({
    super.key,
    this.onSettingsTap,
  });

  @override
  State<ProfileMatrixScreen> createState() => _ProfileMatrixScreenState();
}

class _ProfileMatrixScreenState extends State<ProfileMatrixScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late CreatorProfile _profile;
  late List<ReelItem> _allReels;

  final List<Map<String, String>> _highlights = [
    {'title': 'Impeller', 'img': 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150'},
    {'title': 'Swarm', 'img': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=150'},
    {'title': 'Tokens', 'img': 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=150'},
    {'title': 'Sub-5ms', 'img': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150'},
    {'title': 'EKS 20', 'img': 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=150'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _profile = GramRepository.getProfile();
    _allReels = GramRepository.getReels();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        title: Row(
          children: [
            const Icon(Icons.lock_outline_rounded, size: 16, color: QuantColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              _profile.handle,
              style: QuantTypography.titleLarge.copyWith(
                color: QuantColors.textPrimary,
                fontSize: 18,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.verified_rounded,
              color: QuantColors.sovereignCyan,
              size: 16,
            ),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: QuantColors.textSecondary,
              size: 20,
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_box_outlined, color: QuantColors.textPrimary),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.menu_rounded, color: QuantColors.textPrimary),
            onPressed: widget.onSettingsTap,
          ),
        ],
      ),
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) {
          return [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),

                    // Top Avatar & Metrics Row
                    Row(
                      children: [
                        // Avatar with Luxury Gradient Ring
                        Container(
                          width: 86,
                          height: 86,
                          padding: const EdgeInsets.all(3),
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [
                                QuantColors.sunriseRose,
                                QuantColors.moltenAmber,
                                QuantColors.sunsetGold,
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                          ),
                          child: Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: QuantColors.voidObsidian,
                              border: Border.all(color: QuantColors.voidObsidian, width: 2),
                              image: DecorationImage(
                                image: NetworkImage(_profile.avatarUrl),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 24),

                        // Metrics (Posts, Followers, Following)
                        Expanded(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _buildMetricItem('${_profile.postsCount}', 'Posts'),
                              _buildMetricItem(_formatMetric(_profile.followersCount), 'Followers'),
                              _buildMetricItem('${_profile.followingCount}', 'Following'),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Display Name & Verified Title
                    Text(
                      _profile.displayName,
                      style: QuantTypography.titleMedium.copyWith(
                        color: QuantColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),

                    // Creator Bio Text
                    Text(
                      _profile.bio,
                      style: QuantTypography.bodyMedium.copyWith(
                        color: QuantColors.textSecondary,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 6),

                    // Website Link Pill
                    Row(
                      children: [
                        const Icon(Icons.link_rounded, size: 14, color: QuantColors.sovereignCyan),
                        const SizedBox(width: 4),
                        Text(
                          _profile.websiteUrl,
                          style: QuantTypography.bodySmall.copyWith(
                            color: QuantColors.sovereignCyan,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Action Buttons Row (Edit Profile & Share Profile)
                    Row(
                      children: [
                        Expanded(
                          child: SquircleButton(
                            label: 'Edit Profile',
                            height: 38,
                            backgroundColor: QuantColors.darkSlateCard,
                            textColor: QuantColors.textPrimary,
                            border: const BorderSide(color: QuantColors.hairlineBorder),
                            onPressed: () {},
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: SquircleButton(
                            label: 'Share Profile',
                            height: 38,
                            backgroundColor: QuantColors.darkSlateCard,
                            textColor: QuantColors.textPrimary,
                            border: const BorderSide(color: QuantColors.hairlineBorder),
                            onPressed: () {},
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: QuantColors.darkSlateCard,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: QuantColors.hairlineBorder),
                          ),
                          child: const Icon(
                            Icons.insights_rounded,
                            size: 18,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Story Highlights Carousel Strip
                    SizedBox(
                      height: 84,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _highlights.length + 1,
                        separatorBuilder: (_, __) => const SizedBox(width: 14),
                        itemBuilder: (context, index) {
                          if (index == 0) {
                            return Column(
                              children: [
                                Container(
                                  width: 58,
                                  height: 58,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(color: QuantColors.hairlineBorder),
                                    color: QuantColors.elevatedCard,
                                  ),
                                  child: const Icon(
                                    Icons.add_rounded,
                                    color: QuantColors.textPrimary,
                                    size: 24,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'New',
                                  style: QuantTypography.bodySmall.copyWith(fontSize: 11),
                                ),
                              ],
                            );
                          }

                          final highlight = _highlights[index - 1];
                          return Column(
                            children: [
                              Container(
                                width: 58,
                                height: 58,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: QuantColors.activeBorder),
                                  image: DecorationImage(
                                    image: NetworkImage(highlight['img']!),
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                highlight['title']!,
                                style: QuantTypography.bodySmall.copyWith(
                                  fontSize: 11,
                                  color: QuantColors.textPrimary,
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),

            // Persistent 4-Tab Matrix Bar
            SliverPersistentHeader(
              pinned: true,
              delegate: _SliverAppBarDelegate(
                TabBar(
                  controller: _tabController,
                  indicatorColor: QuantColors.sunriseRose,
                  indicatorWeight: 2,
                  labelColor: QuantColors.sunriseRose,
                  unselectedLabelColor: QuantColors.textMuted,
                  tabs: const [
                    Tab(icon: Icon(Icons.grid_on_rounded, size: 22)),
                    Tab(icon: Icon(Icons.bookmark_border_rounded, size: 22)),
                    Tab(icon: Icon(Icons.favorite_border_rounded, size: 22)),
                    Tab(icon: Icon(Icons.person_pin_outlined, size: 22)),
                  ],
                ),
              ),
            ),
          ];
        },
        body: TabBarView(
          controller: _tabController,
          children: [
            // Tab 1: Creator Reels Grid
            _buildReelsGrid(_allReels),

            // Tab 2: Saved Reels Grid
            _buildReelsGrid(_allReels.reversed.toList()),

            // Tab 3: Liked Reels Grid
            _buildReelsGrid(_allReels.where((r) => r.isLiked).toList().isEmpty
                ? _allReels.sublist(0, 3)
                : _allReels.where((r) => r.isLiked).toList()),

            // Tab 4: Tagged Photos/Reels Grid
            _buildReelsGrid(_allReels.sublist(1, 4)),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricItem(String count, String label) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          count,
          style: QuantTypography.titleLarge.copyWith(
            fontSize: 17,
            fontWeight: FontWeight.w700,
            color: QuantColors.textPrimary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: QuantTypography.bodySmall.copyWith(
            fontSize: 12,
            color: QuantColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildReelsGrid(List<ReelItem> reels) {
    if (reels.isEmpty) {
      return Center(
        child: Text(
          'No reels in this matrix yet',
          style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textMuted),
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(1.5),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 1.5,
        mainAxisSpacing: 1.5,
        childAspectRatio: 0.65, // 9:16 Aspect ratio simulation in grid
      ),
      itemCount: reels.length,
      itemBuilder: (context, index) {
        final reel = reels[index];
        return GestureDetector(
          onTap: () {
            // View selected reel in fullscreen
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
                  child: const Icon(Icons.videocam_outlined, color: Colors.white24),
                ),
              ),

              // Bottom Play Count Indicator
              Positioned(
                left: 6,
                bottom: 6,
                child: Row(
                  children: [
                    const Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 16,
                      shadows: [Shadow(color: Colors.black, blurRadius: 4)],
                    ),
                    const SizedBox(width: 2),
                    Text(
                      _formatMetric(reel.viewsCount),
                      style: QuantTypography.bodySmall.copyWith(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        shadows: const [Shadow(color: Colors.black, blurRadius: 4)],
                      ),
                    ),
                  ],
                ),
              ),

              // Top Pinned Indicator (if first item)
              if (index == 0)
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
                      Icons.push_pin_rounded,
                      color: Colors.white,
                      size: 13,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  String _formatMetric(int count) {
    if (count >= 1000000) {
      return '${(count / 1000000).toStringAsFixed(1)}M';
    } else if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(0)}K';
    }
    return count.toString();
  }
}

/// Custom Sliver Delegate for Sticky TabBar
class _SliverAppBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;

  _SliverAppBarDelegate(this.tabBar);

  @override
  double get minExtent => tabBar.preferredSize.height;
  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: QuantColors.voidObsidian,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(_SliverAppBarDelegate oldDelegate) {
    return false;
  }
}

/// Simple modal route to preview a single selected reel
class MaterialBarPageRoute extends PageRouteBuilder {
  final ReelItem reel;

  MaterialBarPageRoute({required this.reel})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) {
            return Scaffold(
              backgroundColor: Colors.black,
              appBar: AppBar(
                backgroundColor: Colors.black,
                elevation: 0,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                  onPressed: () => Navigator.of(context).pop(),
                ),
                title: Text(
                  'Reels',
                  style: QuantTypography.titleMedium.copyWith(color: Colors.white),
                ),
              ),
              body: Center(
                child: AspectRatio(
                  aspectRatio: 9 / 16,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(reel.thumbnailUrl, fit: BoxFit.cover),
                      Center(
                        child: Container(
                          width: 60,
                          height: 60,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.black54,
                          ),
                          child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 36),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
}
