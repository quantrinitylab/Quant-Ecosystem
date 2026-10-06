import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Sovereign Video Player Screen for QuanTube
/// Segment-Skipping (SponsorBlock Parity), PiP, Speed Selector, Resolution Picker,
/// Comments Bottom Sheet, and Recommendations List.
/// Pure 120Hz Impeller acceleration with zero Skia clipPath.
class VideoPlayerScreen extends StatefulWidget {
  final VideoItem video;

  const VideoPlayerScreen({
    super.key,
    required this.video,
  });

  @override
  State<VideoPlayerScreen> createState() => _VideoPlayerScreenState();
}

class _VideoPlayerScreenState extends State<VideoPlayerScreen> {
  late VideoItem _currentVideo;
  late SegmentSkipper _segmentSkipper;

  // Playback state
  bool _isPlaying = true;
  double _currentSeconds = 0.0;
  double _playbackSpeed = 1.0;
  String _selectedResolution = '1080p60 HD';
  bool _isPiPActive = false;
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

  void _loadRecommendedVideo(VideoItem nextVideo) {
    setState(() {
      _currentVideo = nextVideo;
      _currentSeconds = 0.0;
      _isPlaying = true;
      _isLiked = false;
      _likesCount = nextVideo.likesCount;
      _isDisliked = false;
      _skipBannerText = null;
      _segmentSkipper.reset();
    });
    _startPlaybackTimer();
    _resetHideControlsTimer();
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
            Column(
              children: [
                // Video Player Viewport (16:9)
                _buildPlayerViewport(),

                // Video Details, Actions, Comments & Recommendations
                Expanded(
                  child: ListView(
                    physics: const BouncingScrollPhysics(),
                    padding: EdgeInsets.zero,
                    children: [
                      _buildVideoMetadataSection(),
                      const Divider(color: QuantColors.hairlineBorder, height: 1),
                      _buildChannelBar(),
                      const Divider(color: QuantColors.hairlineBorder, height: 1),
                      _buildCommentsPreview(),
                      const Divider(color: QuantColors.hairlineBorder, height: 1),
                      _buildRecommendationsSection(),
                    ],
                  ),
                ),
              ],
            ),

            // Floating Mini-Player / PiP Mode (Docked compact player)
            if (_isPiPActive)
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: _buildFloatingMiniPlayer(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildFloatingMiniPlayer() {
    final totalDuration = _currentVideo.durationSeconds.toDouble();
    final progressFraction = totalDuration > 0
        ? (_currentSeconds / totalDuration).clamp(0.0, 1.0)
        : 0.0;

    return Container(
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
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 82,
                    height: 48,
                    child: Image.network(
                      _currentVideo.thumbnailUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: Colors.black45,
                        child: const Icon(Icons.play_arrow_rounded, color: Colors.white),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),

                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _currentVideo.title,
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
                        '${_currentVideo.channelTitle} • 120Hz',
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

                // Controls: Play/Pause, Expand, Close
                IconButton(
                  icon: Icon(
                    _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                  onPressed: _togglePlayPause,
                  tooltip: _isPlaying ? 'Pause' : 'Play',
                ),
                IconButton(
                  icon: const Icon(Icons.open_in_full_rounded, color: Colors.white70, size: 20),
                  onPressed: () {
                    setState(() {
                      _isPiPActive = false;
                      _showControls = true;
                    });
                  },
                  tooltip: 'Expand Player',
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 20),
                  onPressed: () {
                    setState(() {
                      _isPiPActive = false;
                    });
                  },
                  tooltip: 'Close Mini-Player',
                ),
              ],
            ),
          ),
        ],
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
                  // Dimmed overlay when controls are visible
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
                    border: Border.all(color: QuantColors.moltenAmber, width: 1),
                    boxShadow: [
                      BoxShadow(
                        color: QuantColors.moltenAmber.withOpacity(0.25),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.fast_forward_rounded,
                        color: QuantColors.moltenAmber,
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
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    const Spacer(),

                    // Auto-skip toggle pill
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
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _segmentSkipper.autoSkipEnabled
                              ? QuantColors.moltenAmber.withOpacity(0.25)
                              : Colors.black54,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _segmentSkipper.autoSkipEnabled
                                ? QuantColors.moltenAmber
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
                                  ? QuantColors.moltenAmber
                                  : Colors.white60,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Auto-Skip',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: _segmentSkipper.autoSkipEnabled
                                  ? QuantColors.moltenAmber
                                  : Colors.white60,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),

                    // Speed selector button
                    IconButton(
                      icon: const Icon(Icons.speed_rounded, color: Colors.white, size: 20),
                      onPressed: _showSpeedSelectorDialog,
                      tooltip: 'Playback Speed',
                    ),

                    // Resolution picker button
                    IconButton(
                      icon: const Icon(Icons.hd_rounded, color: Colors.white, size: 22),
                      onPressed: _showResolutionPickerDialog,
                      tooltip: 'Quality / Resolution',
                    ),

                    // PiP Toggle button
                    IconButton(
                      icon: Icon(
                        _isPiPActive ? Icons.picture_in_picture_alt_rounded : Icons.picture_in_picture_rounded,
                        color: _isPiPActive ? QuantColors.sovereignCyan : Colors.white,
                        size: 20,
                      ),
                      onPressed: () {
                        setState(() {
                          _isPiPActive = !_isPiPActive;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            duration: const Duration(seconds: 1),
                            content: Text(_isPiPActive ? 'Picture-in-Picture Active' : 'Picture-in-Picture Closed'),
                          ),
                        );
                      },
                      tooltip: 'Picture-in-Picture',
                    ),
                  ],
                ),
              ),

              // Center Playback Controls (Rewind 10, Play/Pause, Forward 10)
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

              // Bottom Timeline Scrubber with Colored Segments
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

  /// Custom Timeline with colored segment highlights for Sponsor, Intro, Outro
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
            height: 20,
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

                // SponsorBlock & Chapter Colored Segment Highlights
                for (final seg in _currentVideo.segments)
                  Positioned(
                    left: (seg.startSeconds / totalDuration) * width,
                    width: ((seg.endSeconds - seg.startSeconds) / totalDuration) * width,
                    top: 0,
                    bottom: 0,
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: seg.type.indicatorColor.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                // Played Progress Line
                Container(
                  height: 4,
                  width: width * progressFraction,
                  decoration: BoxDecoration(
                    color: QuantColors.crimsonRed,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Scrub Head Dot
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

  Widget _buildVideoMetadataSection() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title
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

          // Metadata line with views & upload date
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

          // Expandable description
          if (_isDescriptionExpanded) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder, width: 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _currentVideo.description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: QuantColors.textSecondary,
                      height: 1.45,
                    ),
                  ),
                  if (_currentVideo.segments.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    const Text(
                      'SponsorBlock Markers:',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.moltenAmber,
                      ),
                    ),
                    const SizedBox(height: 6),
                    for (final seg in _currentVideo.segments)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          children: [
                            Icon(seg.type.icon, size: 14, color: seg.type.indicatorColor),
                            const SizedBox(width: 6),
                            Text(
                              '${_formatTime(seg.startSeconds)} - ${_formatTime(seg.endSeconds)}: ${seg.title}',
                              style: TextStyle(
                                fontSize: 11,
                                color: seg.type.indicatorColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ],

          const SizedBox(height: 14),

          // Action buttons bar (Like, Dislike, Share, Download, Save)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                // Like / Dislike pill
                Container(
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: QuantColors.hairlineBorder, width: 1),
                  ),
                  child: Row(
                    children: [
                      InkWell(
                        onTap: () {
                          setState(() {
                            _isLiked = !_isLiked;
                            if (_isLiked) {
                              _likesCount++;
                              _isDisliked = false;
                            } else {
                              _likesCount--;
                            }
                          });
                        },
                        borderRadius: const BorderRadius.horizontal(left: Radius.circular(20)),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Row(
                            children: [
                              Icon(
                                _isLiked ? Icons.thumb_up_alt_rounded : Icons.thumb_up_off_alt_rounded,
                                size: 18,
                                color: _isLiked ? QuantColors.crimsonRed : QuantColors.textPrimary,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                '$_likesCount',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: _isLiked ? QuantColors.crimsonRed : QuantColors.textPrimary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Container(width: 1, height: 18, color: QuantColors.hairlineBorder),
                      InkWell(
                        onTap: () {
                          setState(() {
                            _isDisliked = !_isDisliked;
                            if (_isDisliked && _isLiked) {
                              _isLiked = false;
                              _likesCount--;
                            }
                          });
                        },
                        borderRadius: const BorderRadius.horizontal(right: Radius.circular(20)),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Icon(
                            _isDisliked ? Icons.thumb_down_alt_rounded : Icons.thumb_down_off_alt_rounded,
                            size: 18,
                            color: _isDisliked ? Colors.white : QuantColors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),

                // Share button
                _buildPlayerActionButton(
                  icon: Icons.share_rounded,
                  label: 'Share',
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Sovereign link copied to clipboard')),
                    );
                  },
                ),
                const SizedBox(width: 8),

                // Download 1080p button
                _buildPlayerActionButton(
                  icon: Icons.download_rounded,
                  label: 'Download',
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Starting lossless sovereign download...')),
                    );
                  },
                ),
                const SizedBox(width: 8),

                // Remix / Clip button
                _buildPlayerActionButton(
                  icon: Icons.content_cut_rounded,
                  label: 'Clip',
                  onTap: () {},
                ),
                const SizedBox(width: 8),

                // Save to playlist
                _buildPlayerActionButton(
                  icon: Icons.bookmark_border_rounded,
                  label: 'Save',
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Added to QuanTube Library')),
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlayerActionButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: QuantColors.textPrimary),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: QuantColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChannelBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: QuantColors.hairlineBorder, width: 1),
              image: DecorationImage(
                image: NetworkImage(_currentVideo.channelAvatarUrl),
                fit: BoxFit.cover,
              ),
            ),
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
                      const Icon(
                        Icons.check_circle_rounded,
                        size: 14,
                        color: QuantColors.sovereignCyan,
                      ),
                    ],
                  ],
                ),
                Text(
                  '${_currentVideo.channelHandle} • 2.45M subscribers',
                  style: const TextStyle(
                    fontSize: 11,
                    color: QuantColors.textMuted,
                  ),
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
              backgroundColor: _isSubscribed ? QuantColors.elevatedCard : QuantColors.crimsonRed,
              foregroundColor: Colors.white,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: BorderSide(
                  color: _isSubscribed ? QuantColors.hairlineBorder : Colors.transparent,
                ),
              ),
            ),
            child: Text(
              _isSubscribed ? 'Subscribed' : 'Subscribe',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommentsPreview() {
    final comments = TubeRepository.getCommentsForVideo(_currentVideo.id);
    final topComment = comments.isNotEmpty ? comments.first : null;

    return InkWell(
      onTap: _showCommentsBottomSheet,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text(
                  'Comments',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${_currentVideo.commentsCount}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: QuantColors.textMuted,
                  ),
                ),
                const Spacer(),
                const Icon(
                  Icons.unfold_more_rounded,
                  size: 18,
                  color: QuantColors.textMuted,
                ),
              ],
            ),
            if (topComment != null) ...[
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      image: DecorationImage(
                        image: NetworkImage(topComment.authorAvatarUrl),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      topComment.content,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: QuantColors.textSecondary,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showCommentsBottomSheet() {
    final comments = TubeRepository.getCommentsForVideo(_currentVideo.id);

    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.65,
          minChildSize: 0.4,
          maxChildSize: 0.92,
          expand: false,
          builder: (context, scrollController) {
            return Column(
              children: [
                // Sheet drag handle
                Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Sheet Header
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      const Text(
                        'Comments',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${_currentVideo.commentsCount}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: QuantColors.textMuted,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: Colors.white70),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ),
                const Divider(color: QuantColors.hairlineBorder, height: 1),

                // Comments List
                Expanded(
                  child: ListView.separated(
                    controller: scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: comments.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 16),
                    itemBuilder: (context, index) {
                      final comment = comments[index];
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              image: DecorationImage(
                                image: NetworkImage(comment.authorAvatarUrl),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      comment.authorName,
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: QuantColors.textPrimary,
                                      ),
                                    ),
                                    if (comment.isChannelOwner) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                                        decoration: BoxDecoration(
                                          color: QuantColors.crimsonRed.withOpacity(0.2),
                                          borderRadius: BorderRadius.circular(4),
                                        ),
                                        child: const Text(
                                          'CREATOR',
                                          style: TextStyle(
                                            fontSize: 9,
                                            fontWeight: FontWeight.w800,
                                            color: QuantColors.crimsonRed,
                                          ),
                                        ),
                                      ),
                                    ],
                                    const SizedBox(width: 6),
                                    Text(
                                      comment.timeAgo,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: QuantColors.textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  comment.content,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: QuantColors.textSecondary,
                                    height: 1.35,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    Icon(
                                      comment.isLiked ? Icons.thumb_up_alt_rounded : Icons.thumb_up_off_alt_rounded,
                                      size: 14,
                                      color: comment.isLiked ? QuantColors.crimsonRed : QuantColors.textMuted,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      '${comment.likesCount}',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: QuantColors.textMuted,
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                    Text(
                                      'Reply (${comment.repliesCount})',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: QuantColors.sovereignCyan,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),

                // Add comment input
                SafeArea(
                  top: false,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: const BoxDecoration(
                      color: QuantColors.voidObsidian,
                      border: Border(top: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
                    ),
                    child: Row(
                      children: [
                        const Expanded(
                          child: TextField(
                            decoration: InputDecoration(
                              hintText: 'Add a sovereign comment...',
                              hintStyle: TextStyle(fontSize: 13, color: QuantColors.textMuted),
                              border: InputBorder.none,
                              isDense: true,
                            ),
                            style: TextStyle(fontSize: 13, color: Colors.white),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send_rounded, color: QuantColors.crimsonRed),
                          onPressed: () {},
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildRecommendationsSection() {
    final recommendations = TubeRepository.getRecommendedVideos(_currentVideo.id);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Up Next & Recommendations',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: QuantColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          for (final nextVid in recommendations)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GestureDetector(
                onTap: () => _loadRecommendedVideo(nextVid),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Small thumbnail
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: 120,
                        height: 70,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.network(
                              nextVid.thumbnailUrl,
                              fit: BoxFit.cover,
                            ),
                            Positioned(
                              bottom: 4,
                              right: 4,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: Colors.black87,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  nextVid.formattedDuration,
                                  style: const TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            nextVid.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: QuantColors.textPrimary,
                              height: 1.25,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            nextVid.channelTitle,
                            style: const TextStyle(
                              fontSize: 11,
                              color: QuantColors.textMuted,
                            ),
                          ),
                          Text(
                            '${nextVid.formattedViews} • ${nextVid.uploadTimeAgo}',
                            style: const TextStyle(
                              fontSize: 10,
                              color: QuantColors.textMuted,
                            ),
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

  void _showSpeedSelectorDialog() {
    const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: const Text(
            'Playback Speed',
            style: TextStyle(fontSize: 16, color: QuantColors.textPrimary),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: speeds.map((speed) {
              final isSelected = speed == _playbackSpeed;
              return ListTile(
                title: Text(
                  '${speed}x ${speed == 1.0 ? "(Normal)" : ""}',
                  style: TextStyle(
                    fontSize: 13,
                    color: isSelected ? QuantColors.crimsonRed : QuantColors.textPrimary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_rounded, color: QuantColors.crimsonRed, size: 20)
                    : null,
                onTap: () {
                  setState(() {
                    _playbackSpeed = speed;
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

  void _showResolutionPickerDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          title: const Text(
            'Quality & Resolution',
            style: TextStyle(fontSize: 16, color: QuantColors.textPrimary),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: VideoResolution.standards.map((res) {
              final isSelected = _selectedResolution.startsWith(res.id);
              return ListTile(
                title: Text(
                  res.label,
                  style: TextStyle(
                    fontSize: 13,
                    color: isSelected ? QuantColors.crimsonRed : QuantColors.textPrimary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_rounded, color: QuantColors.crimsonRed, size: 20)
                    : null,
                onTap: () {
                  setState(() {
                    _selectedResolution = res.label;
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
