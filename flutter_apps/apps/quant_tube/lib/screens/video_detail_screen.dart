import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Sovereign Video Detail & Player Screen for QuanTube
/// Features:
/// 1. SponsorBlock Segment Skipping:
///    - Sponsor (#F59E0B)
///    - Self-promo (#3B82F6)
///    - Intermission (#10B981)
///    - Auto-skip trigger with instant jump and HUD toast banner
///    - Interactive HUD toggle pill with bolt icon
/// 2. Floating Docked Mini-Player / PiP mode:
///    - Docked compact audio/video player with play/pause, close, and expand controls
/// 3. Strict 120Hz Impeller hardware acceleration with zero Skia clipPath.
/// 4. Strict ZERO raw Unicode emojis throughout.
class VideoDetailScreen extends StatefulWidget {
  final VideoItem video;
  final bool initialMiniPlayer;

  const VideoDetailScreen({
    super.key,
    required this.video,
    this.initialMiniPlayer = false,
  });

  @override
  State<VideoDetailScreen> createState() => _VideoDetailScreenState();
}

class _VideoDetailScreenState extends State<VideoDetailScreen> {
  late VideoItem _currentVideo;
  late SegmentSkipper _segmentSkipper;

  // Playback state
  bool _isPlaying = true;
  double _currentSeconds = 0.0;
  double _playbackSpeed = 1.0;
  String _selectedResolution = '1080p60 HD';
  bool _isMiniPlayerDocked = false;
  bool _showControls = true;
  Timer? _playbackTimer;
  Timer? _hideControlsTimer;

  // Segment Skip notification banner state
  String? _skipBannerText;
  double _lastSkippedStart = 0.0;
  Timer? _skipBannerTimer;

  // Interaction state
  bool _isLiked = false;
  late int _likesCount;
  bool _isDisliked = false;
  bool _isSubscribed = false;
  bool _isDescriptionExpanded = false;

  @override
  void initState() {
    super.initState();
    _currentVideo = widget.video;
    _likesCount = _currentVideo.likesCount;
    _segmentSkipper = SegmentSkipper(autoSkipEnabled: true);
    _isMiniPlayerDocked = widget.initialMiniPlayer;
    _startPlaybackTimer();
    _resetHideControlsTimer();
  }

  @override
  void dispose() {
    _playbackTimer?.cancel();
    _hideControlsTimer?.cancel();
    _skipBannerTimer?.cancel();
    super.dispose();
  }

  void _startPlaybackTimer() {
    _playbackTimer?.cancel();
    _playbackTimer = Timer.periodic(const Duration(milliseconds: 250), (timer) {
      if (!_isPlaying) return;

      setState(() {
        _currentSeconds += 0.25 * _playbackSpeed;
        if (_currentSeconds >= _currentVideo.durationSeconds) {
          _currentSeconds = _currentVideo.durationSeconds.toDouble();
          _isPlaying = false;
        } else {
          _checkSegmentSkipping();
        }
      });
    });
  }

  void _checkSegmentSkipping() {
    final result = _segmentSkipper.evaluatePosition(
      _currentSeconds,
      _currentVideo.segments,
    );

    if (result.shouldSkip && result.segment != null) {
      final seg = result.segment!;
      _lastSkippedStart = seg.startSeconds;
      _segmentSkipper.markSkipped(seg.id);
      _currentSeconds = result.targetSeconds;

      _showSkipBanner(
        'Auto-skipped ${seg.type.displayName} (${result.timeSavedSeconds.round()}s saved)',
      );
    }
  }

  void _showSkipBanner(String text) {
    _skipBannerTimer?.cancel();
    setState(() {
      _skipBannerText = text;
    });
    _skipBannerTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) {
        setState(() {
          _skipBannerText = null;
        });
      }
    });
  }

  void _undoSegmentSkip() {
    setState(() {
      _currentSeconds = _lastSkippedStart;
      _skipBannerText = null;
    });
  }

  void _resetHideControlsTimer() {
    _hideControlsTimer?.cancel();
    if (_isPlaying) {
      _hideControlsTimer = Timer(const Duration(seconds: 4), () {
        if (mounted) {
          setState(() {
            _showControls = false;
          });
        }
      });
    }
  }

  void _togglePlayPause() {
    setState(() {
      _isPlaying = !_isPlaying;
      if (_isPlaying) {
        _resetHideControlsTimer();
      } else {
        _showControls = true;
      }
    });
  }

  void _seekBy(double deltaSeconds) {
    setState(() {
      _currentSeconds = (_currentSeconds + deltaSeconds).clamp(
        0.0,
        _currentVideo.durationSeconds.toDouble(),
      );
      _checkSegmentSkipping();
    });
    _resetHideControlsTimer();
  }

  void _dockToMiniPlayer() {
    setState(() {
      _isMiniPlayerDocked = true;
    });
  }

  void _expandFromMiniPlayer() {
    setState(() {
      _isMiniPlayerDocked = false;
      _showControls = true;
    });
    _resetHideControlsTimer();
  }

  void _closeMiniPlayer() {
    _playbackTimer?.cancel();
    Navigator.of(context).maybePop();
  }

  String _formatTime(double sec) {
    final s = sec.round();
    final m = s ~/ 60;
    final remSec = s % 60;
    final remSecStr = remSec < 10 ? '0$remSec' : '$remSec';
    return '$m:$remSecStr';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Stack(
          children: [
            // Main Video Detail Screen Viewport & Body
            if (!_isMiniPlayerDocked)
              Column(
                children: [
                  // Full 16:9 Viewport
                  _buildPlayerViewport(),

                  // Scrollable Video Details, Actions, Comments & Recommendations
                  Expanded(
                    child: ListView(
                      physics: const BouncingScrollPhysics(),
                      padding: EdgeInsets.zero,
                      children: [
                        _buildVideoMetadataSection(),
                        const Divider(color: QuantColors.hairlineBorder, height: 1),
                        _buildChannelBar(),
                        const Divider(color: QuantColors.hairlineBorder, height: 1),
                        _buildSegmentLegendChips(),
                        const Divider(color: QuantColors.hairlineBorder, height: 1),
                        _buildCommentsPreview(),
                        const Divider(color: QuantColors.hairlineBorder, height: 1),
                        _buildRecommendationsSection(),
                      ],
                    ),
                  ),
                ],
              )
            else
              // Background placeholder when docked in mini-player mode
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.picture_in_picture_alt_rounded,
                      color: QuantColors.sovereignCyan,
                      size: 48,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Mini-Player Active (Background Audio/Video)',
                      style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _expandFromMiniPlayer,
                      icon: const Icon(Icons.open_in_full_rounded, size: 18),
                      label: const Text('Expand Full Player'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: QuantColors.crimsonRed,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),

            // Floating Mini-Player / PiP Mode (Docked Compact View)
            if (_isMiniPlayerDocked)
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: FloatingMiniPlayer(
                  video: _currentVideo,
                  isPlaying: _isPlaying,
                  currentSeconds: _currentSeconds,
                  onPlayPause: _togglePlayPause,
                  onExpand: _expandFromMiniPlayer,
                  onClose: _closeMiniPlayer,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlayerViewport() {
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: GestureDetector(
        onTap: () {
          setState(() {
            _showControls = !_showControls;
            if (_showControls) _resetHideControlsTimer();
          });
        },
        behavior: HitTestBehavior.opaque,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Video Background / Simulated Stream Viewport
            Container(
              color: Colors.black,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    _currentVideo.thumbnailUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(
                        Icons.videocam_rounded,
                        color: QuantColors.crimsonRed,
                        size: 54,
                      ),
                    ),
                  ),
                  if (_showControls || !_isPlaying)
                    Container(color: Colors.black.withOpacity(0.55)),
                ],
              ),
            ),

            // Floating Segment-Skip Toast Banner
            if (_skipBannerText != null)
              Positioned(
                top: 14,
                left: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateCard.withOpacity(0.95),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFF59E0B), width: 1),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFF59E0B).withOpacity(0.25),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.fast_forward_rounded,
                        color: Color(0xFFF59E0B),
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _skipBannerText!,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _undoSegmentSkip,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          'UNDO',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: QuantColors.sovereignCyan,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // Controls Overlay
            if (_showControls || !_isPlaying) ...[
              // Top Bar inside Player
              Positioned(
                top: 8,
                left: 8,
                right: 8,
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                    const Spacer(),

                    // Auto-skip HUD toggle pill
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          _segmentSkipper.autoSkipEnabled = !_segmentSkipper.autoSkipEnabled;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            duration: const Duration(seconds: 1),
                            content: Text(
                              _segmentSkipper.autoSkipEnabled
                                  ? 'SponsorBlock Auto-Skip Enabled'
                                  : 'SponsorBlock Auto-Skip Disabled',
                            ),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: _segmentSkipper.autoSkipEnabled
                              ? const Color(0xFFF59E0B).withOpacity(0.25)
                              : Colors.black54,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: _segmentSkipper.autoSkipEnabled
                                ? const Color(0xFFF59E0B)
                                : Colors.white24,
                            width: 0.8,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.bolt_rounded,
                              size: 14,
                              color: _segmentSkipper.autoSkipEnabled
                                  ? const Color(0xFFF59E0B)
                                  : Colors.white60,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _segmentSkipper.autoSkipEnabled ? 'Auto-Skip ON' : 'Auto-Skip OFF',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: _segmentSkipper.autoSkipEnabled
                                    ? const Color(0xFFF59E0B)
                                    : Colors.white60,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),

                    // PiP Mini-Player Toggle button
                    IconButton(
                      icon: const Icon(Icons.picture_in_picture_alt_rounded, color: Colors.white, size: 20),
                      onPressed: _dockToMiniPlayer,
                      tooltip: 'Dock Mini-Player (PiP)',
                    ),

                    // Quality / Resolution Dialog Button
                    IconButton(
                      icon: const Icon(Icons.hd_rounded, color: Colors.white, size: 22),
                      onPressed: _showResolutionPickerDialog,
                      tooltip: 'Resolution',
                    ),
                  ],
                ),
              ),

              // Center Playback Controls
              Center(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.replay_10_rounded, color: Colors.white, size: 36),
                      onPressed: () => _seekBy(-10),
                    ),
                    const SizedBox(width: 24),
                    GestureDetector(
                      onTap: _togglePlayPause,
                      child: Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.crimsonRed,
                          boxShadow: [
                            BoxShadow(
                              color: QuantColors.crimsonRed.withOpacity(0.5),
                              blurRadius: 16,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: Icon(
                          _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 34,
                        ),
                      ),
                    ),
                    const SizedBox(width: 24),
                    IconButton(
                      icon: const Icon(Icons.forward_10_rounded, color: Colors.white, size: 36),
                      onPressed: () => _seekBy(10),
                    ),
                  ],
                ),
              ),

              // Bottom Timeline Scrubber with Visual Segments
              Positioned(
                bottom: 8,
                left: 12,
                right: 12,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildSegmentTimeline(),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${_formatTime(_currentSeconds)} / ${_currentVideo.formattedDuration}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          '${_selectedResolution.split(' ')[0]} • ${_playbackSpeed}x',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white70,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Custom Visual Timeline with SponsorBlock segment colors:
  /// Sponsor #F59E0B, Self-promo #3B82F6, Intermission #10B981
  Widget _buildSegmentTimeline() {
    final totalDuration = _currentVideo.durationSeconds.toDouble();
    final progressFraction = totalDuration > 0
        ? (_currentSeconds / totalDuration).clamp(0.0, 1.0)
        : 0.0;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;

        return GestureDetector(
          onHorizontalDragUpdate: (details) {
            final localX = details.localPosition.dx.clamp(0.0, width);
            final newSeconds = (localX / width) * totalDuration;
            setState(() {
              _currentSeconds = newSeconds;
              _checkSegmentSkipping();
            });
          },
          onTapDown: (details) {
            final localX = details.localPosition.dx.clamp(0.0, width);
            final newSeconds = (localX / width) * totalDuration;
            setState(() {
              _currentSeconds = newSeconds;
              _checkSegmentSkipping();
            });
          },
          child: Container(
            height: 22,
            alignment: Alignment.center,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Base track
                Container(
                  height: 4,
                  width: width,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Visual Timeline Segments:
                // Sponsor (#F59E0B), Self-promo (#3B82F6), Intermission (#10B981)
                for (final seg in _currentVideo.segments)
                  Positioned(
                    left: (seg.startSeconds / totalDuration) * width,
                    width: ((seg.endSeconds - seg.startSeconds) / totalDuration) * width,
                    top: 0,
                    bottom: 0,
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: seg.type.indicatorColor,
                        borderRadius: BorderRadius.circular(2),
                        boxShadow: [
                          BoxShadow(
                            color: seg.type.indicatorColor.withOpacity(0.5),
                            blurRadius: 4,
                          ),
                        ],
                      ),
                    ),
                  ),

                // Played Progress Bar
                Container(
                  height: 4,
                  width: width * progressFraction,
                  decoration: BoxDecoration(
                    color: QuantColors.crimsonRed,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Scrubber Indicator Head
                Positioned(
                  left: (width * progressFraction) - 6,
                  top: -4,
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black54,
                          blurRadius: 4,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSegmentLegendChips() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Timeline Chapters & SponsorBlock Segments',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: QuantColors.textSecondary,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _buildLegendPill('Sponsor', const Color(0xFFF59E0B), Icons.campaign_rounded),
              _buildLegendPill('Self-promo', const Color(0xFF3B82F6), Icons.star_border_rounded),
              _buildLegendPill('Intermission', const Color(0xFF10B981), Icons.hourglass_empty_rounded),
              _buildLegendPill('Intro', QuantColors.statusSuccess, Icons.play_circle_outline_rounded),
              _buildLegendPill('Outro', QuantColors.obsidianPurple, Icons.stop_circle_outlined),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLegendPill(String label, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.6), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVideoMetadataSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _currentVideo.title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: QuantColors.textPrimary,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: () {
              setState(() {
                _isDescriptionExpanded = !_isDescriptionExpanded;
              });
            },
            child: Row(
              children: [
                Text(
                  '${_currentVideo.formattedViews} • ${_currentVideo.uploadTimeAgo}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: QuantColors.textMuted,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _isDescriptionExpanded ? 'Show less' : '...more',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.sovereignCyan,
                  ),
                ),
              ],
            ),
          ),
          if (_isDescriptionExpanded) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                _currentVideo.description,
                style: const TextStyle(
                  fontSize: 13,
                  color: QuantColors.textSecondary,
                  height: 1.45,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChannelBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundImage: NetworkImage(_currentVideo.channelAvatarUrl),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      _currentVideo.channelTitle,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    if (_currentVideo.isChannelVerified) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.verified_rounded, size: 14, color: QuantColors.sovereignCyan),
                    ],
                  ],
                ),
                Text(
                  _currentVideo.channelHandle,
                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () {
              setState(() {
                _isSubscribed = !_isSubscribed;
              });
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: _isSubscribed ? QuantColors.darkSlateCard : QuantColors.crimsonRed,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            ),
            child: Text(
              _isSubscribed ? 'Subscribed' : 'Subscribe',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommentsPreview() {
    final comments = TubeRepository.getCommentsForVideo(_currentVideo.id);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Comments (${_currentVideo.commentsCount})',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
              const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white70),
            ],
          ),
          const SizedBox(height: 10),
          if (comments.isNotEmpty)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundImage: NetworkImage(comments.first.authorAvatarUrl),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    comments.first.content,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: QuantColors.textSecondary),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildRecommendationsSection() {
    final recs = TubeRepository.getRecommendedVideos(_currentVideo.id);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Up Next & Recommendations',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: QuantColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          for (final rec in recs)
            GestureDetector(
              onTap: () {
                setState(() {
                  _currentVideo = rec;
                  _currentSeconds = 0.0;
                  _isPlaying = true;
                  _isLiked = false;
                  _likesCount = rec.likesCount;
                  _isDisliked = false;
                  _skipBannerText = null;
                  _segmentSkipper.reset();
                });
                _startPlaybackTimer();
                _resetHideControlsTimer();
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        rec.thumbnailUrl,
                        width: 110,
                        height: 68,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rec.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${rec.channelTitle} • ${rec.formattedViews}',
                            style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showResolutionPickerDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          title: const Text('Select Stream Quality', style: TextStyle(color: Colors.white, fontSize: 16)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: VideoResolution.standards.map((r) {
              return ListTile(
                title: Text(r.label, style: const TextStyle(color: Colors.white, fontSize: 14)),
                trailing: _selectedResolution == r.label
                    ? const Icon(Icons.check_rounded, color: QuantColors.crimsonRed)
                    : null,
                onTap: () {
                  setState(() {
                    _selectedResolution = r.label;
                  });
                  Navigator.pop(context);
                },
              );
            }).toList(),
          ),
        );
      },
    );
  }
}

/// Floating Mini-Player / PiP Mode Widget:
/// Docked compact audio/video player with play/pause, close, and expand controls.
class FloatingMiniPlayer extends StatelessWidget {
  final VideoItem video;
  final bool isPlaying;
  final double currentSeconds;
  final VoidCallback onPlayPause;
  final VoidCallback onExpand;
  final VoidCallback onClose;

  const FloatingMiniPlayer({
    super.key,
    required this.video,
    required this.isPlaying,
    required this.currentSeconds,
    required this.onPlayPause,
    required this.onExpand,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final totalDuration = video.durationSeconds.toDouble();
    final progressFraction = totalDuration > 0
        ? (currentSeconds / totalDuration).clamp(0.0, 1.0)
        : 0.0;

    return GestureDetector(
      onTap: onExpand,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 68,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder, width: 1.2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.55),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Stack(
          children: [
            // Top hairline progress indicator
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
                child: LinearProgressIndicator(
                  value: progressFraction,
                  backgroundColor: Colors.white12,
                  valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.crimsonRed),
                  minHeight: 2.5,
                ),
              ),
            ),

            // Content row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: Row(
                children: [
                  // 16:9 Thumbnail preview
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 82,
                      height: 48,
                      child: Image.network(
                        video.thumbnailUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: Colors.black45,
                          child: const Icon(Icons.play_arrow_rounded, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),

                  // Video title & channel handle
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          video.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${video.channelTitle} • 120Hz',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Action controls: Play/Pause, Expand, Close
                  IconButton(
                    icon: Icon(
                      isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 24,
                    ),
                    onPressed: onPlayPause,
                    tooltip: isPlaying ? 'Pause' : 'Play',
                  ),
                  IconButton(
                    icon: const Icon(Icons.open_in_full_rounded, color: Colors.white70, size: 20),
                    onPressed: onExpand,
                    tooltip: 'Expand Player',
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 20),
                    onPressed: onClose,
                    tooltip: 'Close Mini-Player',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
