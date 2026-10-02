// Sovereign Quant Ecosystem - QuanTube Audio Player Dock
// Persistent 56dp Docked Audio Player with Spinning Vinyl Animation.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & hardware acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Persistent 56dp docked audio player widget (Spotify & YouTube Music class).
/// Features:
/// - 56dp fixed height docked container with obsidian glass aesthetic.
/// - Continuous spinning vinyl album disc powered by [AnimationController].
/// - 0 Skia clipPath invocations (uses pure BoxDecoration & CircleBorder).
/// - Embedded micro-scrubber progress line.
/// - Play/Pause, Skip Next, Skip Previous, and Like toggles.
/// - Expand-to-full-screen trigger for seamless handoff to [MusicPlayerScreen].
class AudioPlayerDock extends StatefulWidget {
  final MusicTrack? track;
  final bool isPlaying;
  final double currentSeconds;
  final VoidCallback? onPlayPause;
  final VoidCallback? onNext;
  final VoidCallback? onPrevious;
  final VoidCallback? onExpand;
  final VoidCallback? onClose;
  final ValueChanged<double>? onSeek;

  const AudioPlayerDock({
    super.key,
    this.track,
    this.isPlaying = true,
    this.currentSeconds = 42.0,
    this.onPlayPause,
    this.onNext,
    this.onPrevious,
    this.onExpand,
    this.onClose,
    this.onSeek,
  });

  @override
  State<AudioPlayerDock> createState() => _AudioPlayerDockState();
}

class _AudioPlayerDockState extends State<AudioPlayerDock>
    with SingleTickerProviderStateMixin {
  late AnimationController _vinylAnimationController;
  late bool _internalIsPlaying;
  late bool _isLiked;

  MusicTrack get _activeTrack =>
      widget.track ?? TubeRepository.getMusicTracks().first;

  @override
  void initState() {
    super.initState();
    _internalIsPlaying = widget.isPlaying;
    _isLiked = _activeTrack.isLiked;

    _vinylAnimationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
    );

    if (_internalIsPlaying) {
      _vinylAnimationController.repeat();
    }
  }

  @override
  void didUpdateWidget(covariant AudioPlayerDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isPlaying != oldWidget.isPlaying) {
      _internalIsPlaying = widget.isPlaying;
      if (_internalIsPlaying) {
        _vinylAnimationController.repeat();
      } else {
        _vinylAnimationController.stop();
      }
    }
    if (widget.track != oldWidget.track) {
      _isLiked = _activeTrack.isLiked;
    }
  }

  @override
  void dispose() {
    _vinylAnimationController.dispose();
    super.dispose();
  }

  void _handlePlayPauseToggle() {
    setState(() {
      _internalIsPlaying = !_internalIsPlaying;
      if (_internalIsPlaying) {
        _vinylAnimationController.repeat();
      } else {
        _vinylAnimationController.stop();
      }
    });
    widget.onPlayPause?.call();
  }

  void _handleLikeToggle() {
    setState(() {
      _isLiked = !_isLiked;
    });
  }

  @override
  Widget build(BuildContext context) {
    final track = _activeTrack;
    final totalDuration = track.durationSeconds > 0
        ? track.durationSeconds.toDouble()
        : 214.0;
    final progressFraction = (widget.currentSeconds / totalDuration).clamp(0.0, 1.0);

    return GestureDetector(
      onTap: widget.onExpand,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          border: const Border(
            top: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: Column(
          children: [
            // Micro-scrubber timeline bar (1.8dp height, 0 clipPath)
            _buildScrubberBar(progressFraction),

            // Main Dock Content Row (54.2dp remaining)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Row(
                  children: [
                    // Spinning Vinyl Disc Album Art (40dp)
                    _buildSpinningVinylDisc(track),
                    const SizedBox(width: 10),

                    // Track Title & Artist
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            track.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: QuantColors.textPrimary,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 1),
                          Text(
                            '${track.artist} • Lossless 120Hz',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: QuantColors.sovereignCyan,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Favorite / Like Heart Button
                    IconButton(
                      icon: Icon(
                        _isLiked
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: _isLiked ? QuantColors.crimsonRed : Colors.white60,
                        size: 20,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      onPressed: _handleLikeToggle,
                      tooltip: 'Like Sovereign Track',
                    ),

                    // Skip Previous Button
                    if (widget.onPrevious != null)
                      IconButton(
                        icon: const Icon(
                          Icons.skip_previous_rounded,
                          color: Colors.white70,
                          size: 22,
                        ),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                        onPressed: widget.onPrevious,
                        tooltip: 'Previous Track',
                      ),

                    // Play / Pause Action Button
                    IconButton(
                      icon: Icon(
                        _internalIsPlaying
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 28,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                      onPressed: _handlePlayPauseToggle,
                      tooltip: _internalIsPlaying ? 'Pause' : 'Play',
                    ),

                    // Skip Next Button
                    IconButton(
                      icon: const Icon(
                        Icons.skip_next_rounded,
                        color: Colors.white70,
                        size: 22,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                      onPressed: widget.onNext,
                      tooltip: 'Next Track',
                    ),

                    // Expand to Full Screen Trigger Button
                    IconButton(
                      icon: const Icon(
                        Icons.open_in_full_rounded,
                        color: Colors.white60,
                        size: 16,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
                      onPressed: widget.onExpand,
                      tooltip: 'Expand Full Player',
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Embedded slim scrubber timeline bar (0 clipPath, pure BoxDecoration)
  Widget _buildScrubberBar(double fraction) {
    return SizedBox(
      height: 1.8,
      width: double.infinity,
      child: Stack(
        children: [
          Container(
            color: QuantColors.hairlineBorder,
          ),
          FractionallySizedBox(
            widthFactor: fraction,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    QuantColors.crimsonRed,
                    QuantColors.moltenAmber,
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Spinning vinyl album disc with micro grooves and center art.
  /// 0 clipPath method calls throughout (uses pure BoxDecoration & CircleBorder).
  Widget _buildSpinningVinylDisc(MusicTrack track) {
    return RotationTransition(
      turns: _vinylAnimationController,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF10131A),
          border: Border.all(color: const Color(0xFF282E3D), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: QuantColors.crimsonRed.withOpacity(0.25),
              blurRadius: 8,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Outer vinyl groove ring
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withOpacity(0.06),
                  width: 1.0,
                ),
              ),
            ),

            // Inner vinyl groove ring
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withOpacity(0.08),
                  width: 1.0,
                ),
              ),
            ),

            // Center Album Artwork Circle
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: QuantColors.crimsonRed, width: 1.2),
                image: DecorationImage(
                  image: NetworkImage(track.albumArtUrl),
                  fit: BoxFit.cover,
                ),
              ),
            ),

            // Center Turntable Spindle Hole
            Container(
              width: 4.5,
              height: 4.5,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: QuantColors.voidObsidian,
                border: Border.all(color: Colors.white70, width: 0.6),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
