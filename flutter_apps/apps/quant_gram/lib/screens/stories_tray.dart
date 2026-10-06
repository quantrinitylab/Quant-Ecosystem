import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/gram_models.dart';

/// Sovereign 24-Hour Ephemeral Stories Tray
/// Features glowing gradient squircle borders, segmented countdown progress,
/// tap-to-advance / tap-to-rewind, and long-press hold pause.
///
/// STRICT INVARIANTS:
/// - 100% ZERO raw Unicode emojis (pure Material 3 vector icons only).
/// - 100% ZERO Skia clipPath method invocations (hardware-accelerated BorderRadius).
class StoriesTray extends StatefulWidget {
  final List<StoryItem> stories;
  final ValueChanged<StoryItem>? onStoryTap;
  final VoidCallback? onAddStoryTap;

  const StoriesTray({
    super.key,
    required this.stories,
    this.onStoryTap,
    this.onAddStoryTap,
  });

  @override
  State<StoriesTray> createState() => _StoriesTrayState();
}

class _StoriesTrayState extends State<StoriesTray> {
  void _openStoryViewer(BuildContext context, int initialIndex) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: true,
        barrierColor: Colors.black.withOpacity(0.92),
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
      height: 112,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: widget.stories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final story = widget.stories[index];
          final isCurrentUser = index == 0;

          return GestureDetector(
            onTap: () {
              if (isCurrentUser && widget.onAddStoryTap != null) {
                widget.onAddStoryTap!();
              } else {
                if (widget.onStoryTap != null) {
                  widget.onStoryTap!(story);
                }
                _openStoryViewer(context, index);
              }
            },
            child: SizedBox(
              width: 76,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Glowing Gradient Squircle Border Container
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      // Outer Glowing Squircle Border
                      Container(
                        width: 70,
                        height: 70,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: story.isUnwatched && !isCurrentUser
                              ? [
                                  BoxShadow(
                                    color: (story.hasCloseFriendsBorder
                                            ? QuantColors.neonGreen
                                            : QuantColors.sunriseRose)
                                        .withOpacity(0.35),
                                    blurRadius: 10,
                                    spreadRadius: 1,
                                  ),
                                ]
                              : null,
                          gradient: isCurrentUser
                              ? null
                              : story.hasCloseFriendsBorder
                                  ? const LinearGradient(
                                      colors: [
                                        QuantColors.neonGreen,
                                        Color(0xFF10B981),
                                      ],
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
                              ? Border.all(
                                  color: QuantColors.hairlineBorder,
                                  width: 1.8,
                                )
                              : null,
                        ),
                      ),

                      // Inner Obsidian Gap Squircle for High-Contrast Luxury Feel
                      Container(
                        width: 64,
                        height: 64,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(19),
                          color: QuantColors.voidObsidian,
                        ),
                      ),

                      // Story Creator Avatar Squircle
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(17),
                          color: QuantColors.elevatedCard,
                          image: DecorationImage(
                            image: NetworkImage(story.avatarUrl),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),

                      // 'Add Story' Gradient Pill for Current User
                      if (isCurrentUser)
                        Positioned(
                          right: 1,
                          bottom: 1,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                colors: [
                                  QuantColors.sunriseRose,
                                  QuantColors.moltenAmber,
                                ],
                              ),
                              border: Border.all(
                                color: QuantColors.voidObsidian,
                                width: 2,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: QuantColors.sunriseRose.withOpacity(0.5),
                                  blurRadius: 6,
                                ),
                              ],
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
                  const SizedBox(height: 6),

                  // Username Caption
                  Text(
                    story.username,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: QuantTypography.bodySmall.copyWith(
                      color: story.isUnwatched
                          ? QuantColors.textPrimary
                          : QuantColors.textMuted,
                      fontSize: 11,
                      fontWeight:
                          story.isUnwatched ? FontWeight.w600 : FontWeight.w400,
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
/// Features Segmented Countdown Progress Indicator across Slices,
/// tap-to-advance (right 70%), tap-to-rewind (left 30%), and press-to-pause.
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

class _StoryViewerScreenState extends State<StoryViewerScreen>
    with SingleTickerProviderStateMixin {
  late int _currentUserStoryIndex;
  late int _currentSliceIndex;
  late int _totalSlices;
  late AnimationController _sliceProgressController;
  final TextEditingController _replyController = TextEditingController();
  bool _isLiked = false;
  bool _isPaused = false;

  @override
  void initState() {
    super.initState();
    _currentUserStoryIndex = widget.initialIndex;
    _currentSliceIndex = 0;
    _totalSlices = widget.stories[_currentUserStoryIndex].slicesCount;

    _sliceProgressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4500),
    );

    _sliceProgressController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _advanceSlice();
      }
    });

    _sliceProgressController.forward();
  }

  @override
  void dispose() {
    _sliceProgressController.dispose();
    _replyController.dispose();
    super.dispose();
  }

  void _advanceSlice() {
    if (_currentSliceIndex < _totalSlices - 1) {
      setState(() {
        _currentSliceIndex++;
      });
      _sliceProgressController.reset();
      _sliceProgressController.forward();
    } else {
      _nextStory();
    }
  }

  void _rewindSlice() {
    if (_currentSliceIndex > 0) {
      setState(() {
        _currentSliceIndex--;
      });
      _sliceProgressController.reset();
      _sliceProgressController.forward();
    } else {
      _prevStory();
    }
  }

  void _nextStory() {
    if (_currentUserStoryIndex < widget.stories.length - 1) {
      setState(() {
        _currentUserStoryIndex++;
        _currentSliceIndex = 0;
        _totalSlices = widget.stories[_currentUserStoryIndex].slicesCount;
        _isLiked = false;
      });
      _sliceProgressController.reset();
      _sliceProgressController.forward();
    } else {
      Navigator.of(context).pop();
    }
  }

  void _prevStory() {
    if (_currentUserStoryIndex > 0) {
      setState(() {
        _currentUserStoryIndex--;
        _currentSliceIndex = 0;
        _totalSlices = widget.stories[_currentUserStoryIndex].slicesCount;
        _isLiked = false;
      });
      _sliceProgressController.reset();
      _sliceProgressController.forward();
    } else {
      _sliceProgressController.reset();
      _sliceProgressController.forward();
    }
  }

  void _pauseProgress() {
    setState(() => _isPaused = true);
    _sliceProgressController.stop();
  }

  void _resumeProgress() {
    setState(() => _isPaused = false);
    _sliceProgressController.forward();
  }

  @override
  Widget build(BuildContext context) {
    final story = widget.stories[_currentUserStoryIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: GestureDetector(
          onLongPressStart: (_) => _pauseProgress(),
          onLongPressEnd: (_) => _resumeProgress(),
          onTapDown: (details) {
            final screenWidth = MediaQuery.of(context).size.width;
            if (details.globalPosition.dx < screenWidth * 0.3) {
              _rewindSlice();
            } else if (details.globalPosition.dx > screenWidth * 0.7) {
              _advanceSlice();
            } else {
              if (_isPaused) {
                _resumeProgress();
              } else {
                _pauseProgress();
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
                      color: QuantColors.voidObsidian.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: QuantColors.hairlineBorder,
                        width: 1.2,
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Squircle Creator Profile Badge
                        Container(
                          width: 84,
                          height: 84,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(26),
                            border: Border.all(
                              color: story.hasCloseFriendsBorder
                                  ? QuantColors.neonGreen
                                  : QuantColors.sunriseRose,
                              width: 2.5,
                            ),
                            image: DecorationImage(
                              image: NetworkImage(story.avatarUrl),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              story.username,
                              style: QuantTypography.titleLarge.copyWith(
                                color: QuantColors.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (story.hasCloseFriendsBorder) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: QuantColors.neonGreen.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: QuantColors.neonGreen,
                                    width: 0.8,
                                  ),
                                ),
                                child: Text(
                                  'Close Friends',
                                  style: QuantTypography.bodySmall.copyWith(
                                    color: QuantColors.neonGreen,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          story.storyCaption.isNotEmpty
                              ? story.storyCaption
                              : 'Sovereign 120Hz Impeller Video Story · Segment ${_currentSliceIndex + 1}/$_totalSlices',
                          textAlign: TextAlign.center,
                          style: QuantTypography.bodyMedium.copyWith(
                            color: QuantColors.textSecondary,
                            height: 1.5,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Segment Slice Badge
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: QuantColors.darkSlateCard,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: QuantColors.hairlineBorder),
                          ),
                          child: Text(
                            'Slice ${_currentSliceIndex + 1} of $_totalSlices · Expires in ${story.expiresInHours}h',
                            style: QuantTypography.bodySmall.copyWith(
                              color: QuantColors.textMuted,
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Top Segmented Countdown Progress Indicator Strip & User Header
              Positioned(
                top: 8,
                left: 12,
                right: 12,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Segmented Countdown Progress Bars for Each Story Slice
                    Row(
                      children: List.generate(_totalSlices, (sliceIdx) {
                        return Expanded(
                          child: Container(
                            height: 3.5,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(2),
                              color: Colors.white.withOpacity(0.25),
                            ),
                            child: AnimatedBuilder(
                              animation: _sliceProgressController,
                              builder: (context, _) {
                                double progress = 0.0;
                                if (sliceIdx < _currentSliceIndex) {
                                  progress = 1.0;
                                } else if (sliceIdx == _currentSliceIndex) {
                                  progress = _sliceProgressController.value;
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
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
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
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${story.timestampText} · Slice ${_currentSliceIndex + 1}/$_totalSlices',
                              style: QuantTypography.bodySmall.copyWith(
                                color: Colors.white70,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        const Spacer(),
                        IconButton(
                          icon: const Icon(Icons.more_vert_rounded,
                              color: Colors.white, size: 20),
                          onPressed: () {},
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded,
                              color: Colors.white, size: 20),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Bottom Interaction Strip (Direct Reply / Like / Share)
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
                          color: QuantColors.voidObsidian.withOpacity(0.75),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        alignment: Alignment.centerLeft,
                        child: TextField(
                          controller: _replyController,
                          style: QuantTypography.bodyMedium.copyWith(
                            color: Colors.white,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Reply to ${story.username}...',
                            hintStyle: QuantTypography.bodySmall.copyWith(
                              color: QuantColors.textMuted,
                            ),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    GestureDetector(
                      onTap: () {
                        setState(() => _isLiked = !_isLiked);
                      },
                      child: Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.voidObsidian.withOpacity(0.75),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Icon(
                          _isLiked
                              ? Icons.favorite_rounded
                              : Icons.favorite_border_rounded,
                          color: _isLiked
                              ? QuantColors.sunriseRose
                              : Colors.white,
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
                        color: QuantColors.voidObsidian.withOpacity(0.75),
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
