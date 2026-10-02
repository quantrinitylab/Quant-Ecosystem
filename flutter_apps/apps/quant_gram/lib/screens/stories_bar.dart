import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/gram_models.dart';

/// Horizontal 24-Hour Ephemeral Stories Strip with Luxury Gradient Rings
/// Strictly ZERO raw Unicode emojis throughout this file.
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class StoriesBar extends StatefulWidget {
  final List<StoryItem> stories;
  final ValueChanged<StoryItem>? onStoryTap;

  const StoriesBar({
    super.key,
    required this.stories,
    this.onStoryTap,
  });

  @override
  State<StoriesBar> createState() => _StoriesBarState();
}

class _StoriesBarState extends State<StoriesBar> {
  void _openStoryViewer(BuildContext context, int initialIndex) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: true,
        barrierColor: Colors.black.withOpacity(0.9),
        pageBuilder: (context, animation, secondaryAnimation) {
          return FadeTransition(
            opacity: animation,
            child: StoryViewerScreen(
              stories: widget.stories,
              initialIndex: initialIndex,
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 104,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: widget.stories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final story = widget.stories[index];
          final isCurrentUser = index == 0;

          return GestureDetector(
            onTap: () {
              if (widget.onStoryTap != null) {
                widget.onStoryTap!(story);
              }
              _openStoryViewer(context, index);
            },
            child: SizedBox(
              width: 72,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      // Luxury Outer Gradient Ring
                      Container(
                        width: 68,
                        height: 68,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: isCurrentUser
                              ? null
                              : story.hasCloseFriendsBorder
                                  ? const LinearGradient(
                                      colors: [QuantColors.neonGreen, Color(0xFF10B981)],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    )
                                  : story.isUnwatched
                                      ? const LinearGradient(
                                          colors: [
                                            QuantColors.sunriseRose,
                                            QuantColors.moltenAmber,
                                            QuantColors.sunsetGold,
                                          ],
                                          begin: Alignment.topLeft,
                                          end: Alignment.bottomRight,
                                        )
                                      : null,
                          border: isCurrentUser || !story.isUnwatched
                              ? Border.all(color: QuantColors.hairlineBorder, width: 2)
                              : null,
                        ),
                      ),
                      // Inner Black Gap Ring for Contrast
                      Container(
                        width: 62,
                        height: 62,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.voidObsidian,
                        ),
                      ),
                      // Story Creator Avatar
                      Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.elevatedCard,
                          image: DecorationImage(
                            image: NetworkImage(story.avatarUrl),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                      // 'Add Story' Blue/Rose Pill for Current User
                      if (isCurrentUser)
                        Positioned(
                          right: 2,
                          bottom: 2,
                          child: Container(
                            width: 20,
                            height: 20,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: QuantColors.sunriseRose,
                              border: Border.all(
                                color: QuantColors.voidObsidian,
                                width: 2,
                              ),
                            ),
                            child: const Icon(
                              Icons.add_rounded,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    story.username,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: QuantTypography.bodySmall.copyWith(
                      color: story.isUnwatched ? QuantColors.textPrimary : QuantColors.textMuted,
                      fontSize: 11,
                      fontWeight: story.isUnwatched ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Fullscreen 24-Hour Ephemeral Story Viewer Screen
class StoryViewerScreen extends StatefulWidget {
  final List<StoryItem> stories;
  final int initialIndex;

  const StoryViewerScreen({
    super.key,
    required this.stories,
    this.initialIndex = 0,
  });

  @override
  State<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends State<StoryViewerScreen> with SingleTickerProviderStateMixin {
  late int _currentIndex;
  late AnimationController _progressController;
  final TextEditingController _replyController = TextEditingController();
  bool _isLiked = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 5),
    );

    _progressController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _nextStory();
      }
    });

    _progressController.forward();
  }

  @override
  void dispose() {
    _progressController.dispose();
    _replyController.dispose();
    super.dispose();
  }

  void _nextStory() {
    if (_currentIndex < widget.stories.length - 1) {
      setState(() {
        _currentIndex++;
        _isLiked = false;
      });
      _progressController.reset();
      _progressController.forward();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _prevStory() {
    if (_currentIndex > 0) {
      setState(() {
        _currentIndex--;
        _isLiked = false;
      });
      _progressController.reset();
      _progressController.forward();
    } else {
      _progressController.reset();
      _progressController.forward();
    }
  }

  @override
  Widget build(BuildContext context) {
    final story = widget.stories[_currentIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: GestureDetector(
          onTapDown: (details) {
            final screenWidth = MediaQuery.of(context).size.width;
            if (details.globalPosition.dx < screenWidth * 0.3) {
              _prevStory();
            } else if (details.globalPosition.dx > screenWidth * 0.7) {
              _nextStory();
            } else {
              if (_progressController.isAnimating) {
                _progressController.stop();
              } else {
                _progressController.forward();
              }
            }
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Story Background Visual Container
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: story.backgroundGradient,
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian.withOpacity(0.6),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: QuantColors.hairlineBorder),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: QuantColors.sunriseRose, width: 2),
                            image: DecorationImage(
                              image: NetworkImage(story.avatarUrl),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          story.username,
                          style: QuantTypography.titleLarge.copyWith(
                            color: QuantColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          story.storyCaption.isNotEmpty
                              ? story.storyCaption
                              : 'Sovereign 120Hz Impeller Video Story',
                          textAlign: TextAlign.center,
                          style: QuantTypography.bodyMedium.copyWith(
                            color: QuantColors.textSecondary,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Top Controls Overlay (Progress Bars + User Header)
              Positioned(
                top: 8,
                left: 12,
                right: 12,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Segmented Progress Bar Strip
                    Row(
                      children: List.generate(widget.stories.length, (index) {
                        return Expanded(
                          child: Container(
                            height: 3,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(2),
                              color: Colors.white.withOpacity(0.25),
                            ),
                            child: AnimatedBuilder(
                              animation: _progressController,
                              builder: (context, _) {
                                double progress = 0.0;
                                if (index < _currentIndex) {
                                  progress = 1.0;
                                } else if (index == _currentIndex) {
                                  progress = _progressController.value;
                                }
                                return FractionallySizedBox(
                                  alignment: Alignment.centerLeft,
                                  widthFactor: progress,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(2),
                                      color: Colors.white,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 12),

                    // User Header Row
                    Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            image: DecorationImage(
                              image: NetworkImage(story.avatarUrl),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              story.username,
                              style: QuantTypography.titleMedium.copyWith(
                                color: Colors.white,
                                fontSize: 13,
                              ),
                            ),
                            Text(
                              story.timestampText,
                              style: QuantTypography.bodySmall.copyWith(
                                color: Colors.white70,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
                          onPressed: () {},
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.white),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Bottom Interaction Strip (Send Message / Like / Share)
              Positioned(
                bottom: 16,
                left: 16,
                right: 16,
                child: Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 46,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: QuantColors.voidObsidian.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        alignment: Alignment.centerLeft,
                        child: TextField(
                          controller: _replyController,
                          style: QuantTypography.bodyMedium.copyWith(color: Colors.white),
                          decoration: InputDecoration(
                            hintText: 'Send message to ${story.username}...',
                            hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    GestureDetector(
                      onTap: () {
                        setState(() => _isLiked = !_isLiked);
                      },
                      child: Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.voidObsidian.withOpacity(0.7),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Icon(
                          _isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                          color: _isLiked ? QuantColors.sunriseRose : Colors.white,
                          size: 22,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: QuantColors.voidObsidian.withOpacity(0.7),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: const Icon(
                        Icons.send_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
