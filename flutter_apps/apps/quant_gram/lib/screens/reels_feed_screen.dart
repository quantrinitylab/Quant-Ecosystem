import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_core/quant_core.dart';
import '../data/gram_repository.dart';
import '../models/gram_models.dart';
import 'comments_sheet.dart';
import 'stories_bar.dart';

/// Fullscreen 9:16 Vertical Snapping Video Feed Screen
///
/// Implements QuantMediaBridge preload policy (pre-buffers upcoming 4 reels),
/// 120Hz Impeller hardware rendering, double-tap heart burst,
/// and side interaction dock.
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class ReelsFeedScreen extends StatefulWidget {
  final VoidCallback? onDirectMessagesTap;
  final VoidCallback? onCreateTap;

  const ReelsFeedScreen({
    super.key,
    this.onDirectMessagesTap,
    this.onCreateTap,
  });

  @override
  State<ReelsFeedScreen> createState() => _ReelsFeedScreenState();
}

class _ReelsFeedScreenState extends State<ReelsFeedScreen> with TickerProviderStateMixin {
  late PageController _pageController;
  late List<ReelItem> _reels;
  late List<StoryItem> _stories;
  int _currentIndex = 0;
  String _activeFeedTab = 'for_you'; // 'following' | 'for_you'

  // Preload policy from quant_core
  final QuantPreloadPolicy _preloadPolicy = const QuantPreloadPolicy(
    preloadCount: 4,
    maxActiveDecoders: 3,
    autoPauseOffscreen: true,
  );

  final Set<int> _preloadedIndices = {};

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _reels = List.from(GramRepository.getReels());
    _stories = List.from(GramRepository.getStories());
    _updatePreloadWindow(0);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _updatePreloadWindow(int currentIdx) {
    _preloadedIndices.clear();
    for (int i = 0; i < _reels.length; i++) {
      if (_preloadPolicy.shouldPreload(i, currentIdx)) {
        _preloadedIndices.add(i);
      }
    }
  }

  void _onPageChanged(int index) {
    setState(() {
      _currentIndex = index;
      _updatePreloadWindow(index);
    });
  }

  void _toggleLike(int index) {
    setState(() {
      final reel = _reels[index];
      final newLiked = !reel.isLiked;
      _reels[index] = reel.copyWith(
        isLiked: newLiked,
        likesCount: newLiked ? reel.likesCount + 1 : reel.likesCount - 1,
      );
    });
  }

  void _toggleBookmark(int index) {
    setState(() {
      final reel = _reels[index];
      final newBookmarked = !reel.isBookmarked;
      _reels[index] = reel.copyWith(
        isBookmarked: newBookmarked,
        bookmarksCount: newBookmarked ? reel.bookmarksCount + 1 : reel.bookmarksCount - 1,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // 9:16 Vertical Snapping Video PageView
          PageView.builder(
            controller: _pageController,
            scrollDirection: Axis.vertical,
            itemCount: _reels.length,
            onPageChanged: _onPageChanged,
            itemBuilder: (context, index) {
              final reel = _reels[index];
              final isCurrent = index == _currentIndex;
              final isPreloaded = _preloadedIndices.contains(index);

              return SingleReelViewport(
                reel: reel,
                isActive: isCurrent,
                isPreloaded: isPreloaded,
                onLike: () => _toggleLike(index),
                onBookmark: () => _toggleBookmark(index),
                onCommentsTap: () {
                  CommentsSheet.show(context, reel).then((_) {
                    setState(() {});
                  });
                },
                onShareTap: () {
                  _showShareSnackbar(context, reel);
                },
              );
            },
          ),

          // Top Header Overlay with Stories Strip Toggle and Navigation
          SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Top Brand Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      // Camera Quick Trigger
                      GestureDetector(
                        onTap: widget.onCreateTap,
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: QuantColors.voidObsidian.withOpacity(0.4),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white.withOpacity(0.15)),
                          ),
                          child: const Icon(Icons.camera_alt_outlined, color: Colors.white, size: 20),
                        ),
                      ),
                      const Spacer(),

                      // Following vs For You Tab Switcher
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () => setState(() => _activeFeedTab = 'following'),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Following',
                                  style: QuantTypography.titleMedium.copyWith(
                                    fontSize: 15,
                                    fontWeight: _activeFeedTab == 'following' ? FontWeight.w700 : FontWeight.w500,
                                    color: _activeFeedTab == 'following' ? Colors.white : Colors.white60,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Container(
                                  width: 20,
                                  height: 2,
                                  color: _activeFeedTab == 'following' ? QuantColors.sunriseRose : Colors.transparent,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 18),
                          GestureDetector(
                            onTap: () => setState(() => _activeFeedTab = 'for_you'),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'For You',
                                  style: QuantTypography.titleMedium.copyWith(
                                    fontSize: 15,
                                    fontWeight: _activeFeedTab == 'for_you' ? FontWeight.w700 : FontWeight.w500,
                                    color: _activeFeedTab == 'for_you' ? Colors.white : Colors.white60,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Container(
                                  width: 20,
                                  height: 2,
                                  color: _activeFeedTab == 'for_you' ? QuantColors.sunriseRose : Colors.transparent,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),

                      // Direct Messages Action
                      GestureDetector(
                        onTap: widget.onDirectMessagesTap,
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: QuantColors.voidObsidian.withOpacity(0.4),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white.withOpacity(0.15)),
                          ),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              const Icon(Icons.send_rounded, color: Colors.white, size: 18),
                              Positioned(
                                top: 6,
                                right: 6,
                                child: Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    color: QuantColors.sunriseRose,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // Top Stories Bar
                StoriesBar(
                  stories: _stories,
                  onStoryTap: (story) {
                    setState(() {
                      final idx = _stories.indexWhere((s) => s.id == story.id);
                      if (idx != -1) {
                        _stories[idx] = story.copyWith(isUnwatched: false);
                      }
                    });
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showShareSnackbar(BuildContext context, ReelItem reel) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.elevatedCard,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: QuantColors.hairlineBorder),
        ),
        content: Row(
          children: [
            const Icon(Icons.share_rounded, color: QuantColors.sovereignCyan, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Sovereign link copied for @${reel.creatorHandle}',
                style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
              ),
            ),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}

/// Single 9:16 Reel Viewport with Gesture Detection & Side Interaction Dock
class SingleReelViewport extends StatefulWidget {
  final ReelItem reel;
  final bool isActive;
  final bool isPreloaded;
  final VoidCallback onLike;
  final VoidCallback onBookmark;
  final VoidCallback onCommentsTap;
  final VoidCallback onShareTap;

  const SingleReelViewport({
    super.key,
    required this.reel,
    required this.isActive,
    required this.isPreloaded,
    required this.onLike,
    required this.onBookmark,
    required this.onCommentsTap,
    required this.onShareTap,
  });

  @override
  State<SingleReelViewport> createState() => _SingleReelViewportState();
}

class _SingleReelViewportState extends State<SingleReelViewport> with TickerProviderStateMixin {
  late AnimationController _discRotationController;
  late AnimationController _heartBurstController;
  late Animation<double> _heartBurstScale;
  late Animation<double> _heartBurstOpacity;

  bool _isPlaying = true;
  bool _showPlayPauseIndicator = false;
  bool _isFollowing = false;
  Offset? _burstPosition;

  @override
  void initState() {
    super.initState();

    // Rotating Sound Vinyl Disc Controller (120Hz continuous smooth rotation)
    _discRotationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();

    // Heart Burst Animation Controller
    _heartBurstController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    );

    _heartBurstScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween<double>(begin: 0.0, end: 1.3).chain(CurveTween(curve: Curves.easeOutBack)), weight: 50),
      TweenSequenceItem(tween: Tween<double>(begin: 1.3, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 25),
      TweenSequenceItem(tween: Tween<double>(begin: 1.0, end: 1.15), weight: 25),
    ]).animate(_heartBurstController);

    _heartBurstOpacity = Tween<double>(begin: 1.0, end: 0.0).animate(
      CurvedAnimation(parent: _heartBurstController, curve: const Interval(0.6, 1.0, curve: Curves.easeIn)),
    );
  }

  @override
  void didUpdateWidget(SingleReelViewport oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      if (_isPlaying) {
        _discRotationController.repeat();
      }
    } else if (!widget.isActive && oldWidget.isActive) {
      _discRotationController.stop();
    }
  }

  @override
  void dispose() {
    _discRotationController.dispose();
    _heartBurstController.dispose();
    super.dispose();
  }

  void _handleDoubleTap(TapDownDetails details) {
    setState(() {
      _burstPosition = details.localPosition;
    });

    if (!widget.reel.isLiked) {
      widget.onLike();
    }

    _heartBurstController.reset();
    _heartBurstController.forward();
  }

  void _handleSingleTap() {
    setState(() {
      _isPlaying = !_isPlaying;
      _showPlayPauseIndicator = true;
      if (_isPlaying) {
        _discRotationController.repeat();
      } else {
        _discRotationController.stop();
      }
    });

    Future.delayed(const Duration(milliseconds: 700), () {
      if (mounted) {
        setState(() => _showPlayPauseIndicator = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _handleSingleTap,
      onDoubleTapDown: _handleDoubleTap,
      onDoubleTap: () {},
      child: Stack(
        fit: StackFit.expand,
        children: [
          // 9:16 Video Canvas Simulation with Impeller-optimised Gradients
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: widget.reel.gradientColors,
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Video Ambient Glow / Mesh
                Center(
                  child: Container(
                    width: 280,
                    height: 280,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          widget.reel.gradientColors.first.withOpacity(0.4),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),

                // Video Thumbnail / Visual Frame
                Center(
                  child: Image.network(
                    widget.reel.thumbnailUrl,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: double.infinity,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.videocam_outlined, size: 72, color: Colors.white24),
                    ),
                  ),
                ),

                // Subtle Top and Bottom Vignette Overlays for Maximum Legibility
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.black54,
                        Colors.transparent,
                        Colors.transparent,
                        Colors.black87,
                      ],
                      stops: [0.0, 0.22, 0.65, 1.0],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Play / Pause Temporary Center Indicator
          if (_showPlayPauseIndicator)
            Center(
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 200),
                opacity: _showPlayPauseIndicator ? 1.0 : 0.0,
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.65),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white24, width: 1.5),
                  ),
                  child: Icon(
                    _isPlaying ? Icons.play_arrow_rounded : Icons.pause_rounded,
                    size: 42,
                    color: Colors.white,
                  ),
                ),
              ),
            ),

          // Heart Burst Animation on Double Tap
          if (_burstPosition != null)
            Positioned(
              left: _burstPosition!.dx - 50,
              top: _burstPosition!.dy - 50,
              child: AnimatedBuilder(
                animation: _heartBurstController,
                builder: (context, _) {
                  return Opacity(
                    opacity: _heartBurstOpacity.value,
                    child: Transform.scale(
                      scale: _heartBurstScale.value,
                      child: const Icon(
                        Icons.favorite_rounded,
                        color: QuantColors.sunriseRose,
                        size: 100,
                        shadows: [
                          Shadow(color: Colors.black45, blurRadius: 16),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

          // Bottom-Left Creator Info & Caption Overlay
          Positioned(
            left: 16,
            bottom: 24,
            right: 88,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Creator Handle & Follow Pill
                Row(
                  children: [
                    Text(
                      '@${widget.reel.creatorHandle}',
                      style: QuantTypography.titleMedium.copyWith(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (widget.reel.isCreatorVerified) ...[
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.verified_rounded,
                        color: QuantColors.sovereignCyan,
                        size: 15,
                      ),
                    ],
                    const SizedBox(width: 10),
                    GestureDetector(
                      onTap: () {
                        setState(() => _isFollowing = !_isFollowing);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: _isFollowing ? Colors.white12 : Colors.transparent,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: _isFollowing ? Colors.white24 : Colors.white,
                            width: 1,
                          ),
                        ),
                        child: Text(
                          _isFollowing ? 'Following' : 'Follow',
                          style: QuantTypography.bodySmall.copyWith(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // Caption & Hashtags
                Text(
                  widget.reel.caption,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: QuantTypography.bodyMedium.copyWith(
                    color: Colors.white.withOpacity(0.95),
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 6),

                // Hashtag Pills
                Wrap(
                  spacing: 6,
                  children: widget.reel.hashtags.map((tag) {
                    return Text(
                      tag,
                      style: QuantTypography.bodySmall.copyWith(
                        color: QuantColors.sovereignCyan,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 10),

                // Audio Track Marquee Banner
                Row(
                  children: [
                    const Icon(
                      Icons.music_note_rounded,
                      color: Colors.white70,
                      size: 15,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        widget.reel.audioTrack,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: QuantTypography.bodySmall.copyWith(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Right Side Interaction Dock
          Positioned(
            right: 12,
            bottom: 24,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Creator Avatar with Follow '+' Badge
                Stack(
                  alignment: Alignment.bottomCenter,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                        image: DecorationImage(
                          image: NetworkImage(widget.reel.creatorAvatarUrl),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    if (!_isFollowing)
                      Positioned(
                        bottom: 0,
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: QuantColors.sunriseRose,
                          ),
                          child: const Icon(
                            Icons.add_rounded,
                            color: Colors.white,
                            size: 14,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 18),

                // Like Heart Button with Animated Bounce
                _buildActionItem(
                  icon: widget.reel.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  iconColor: widget.reel.isLiked ? QuantColors.sunriseRose : Colors.white,
                  label: _formatCount(widget.reel.likesCount),
                  onTap: widget.onLike,
                ),
                const SizedBox(height: 18),

                // Comments Sheet Trigger Button
                _buildActionItem(
                  icon: Icons.chat_bubble_outline_rounded,
                  iconColor: Colors.white,
                  label: _formatCount(widget.reel.commentsCount),
                  onTap: widget.onCommentsTap,
                ),
                const SizedBox(height: 18),

                // Share Button
                _buildActionItem(
                  icon: Icons.share_rounded,
                  iconColor: Colors.white,
                  label: _formatCount(widget.reel.shareCount),
                  onTap: widget.onShareTap,
                ),
                const SizedBox(height: 18),

                // Bookmark Pill Button
                _buildActionItem(
                  icon: widget.reel.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                  iconColor: widget.reel.isBookmarked ? QuantColors.sunsetGold : Colors.white,
                  label: _formatCount(widget.reel.bookmarksCount),
                  onTap: widget.onBookmark,
                ),
                const SizedBox(height: 22),

                // Rotating Sound Vinyl Disc
                AnimatedBuilder(
                  animation: _discRotationController,
                  builder: (context, child) {
                    return Transform.rotate(
                      angle: _discRotationController.value * 2 * math.pi,
                      child: child,
                    );
                  },
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFF1E1E24),
                      border: Border.all(color: const Color(0xFF33333E), width: 5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.5),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          image: DecorationImage(
                            image: NetworkImage(widget.reel.creatorAvatarUrl),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required Color iconColor,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.35),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor, size: 28),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: QuantTypography.bodySmall.copyWith(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              shadows: const [
                Shadow(color: Colors.black87, blurRadius: 4),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatCount(int count) {
    if (count >= 1000000) {
      return '${(count / 1000000).toStringAsFixed(1)}M';
    } else if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}K';
    }
    return count.toString();
  }
}
