import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/tube_models.dart';
import '../data/tube_repository.dart';

/// Spotify-Class Music Streaming Player Screen for QuanTube
/// Features Spinning Album Vinyl, Synchronized Scrolling Lyrics,
/// Audio Scrubber, Background Audio Playback Simulator, and Playlist Queue.
/// Pure 120Hz Impeller acceleration with zero Skia clipPath.
class MusicPlayerScreen extends StatefulWidget {
  const MusicPlayerScreen({super.key});

  @override
  State<MusicPlayerScreen> createState() => _MusicPlayerScreenState();
}

class _MusicPlayerScreenState extends State<MusicPlayerScreen>
    with SingleTickerProviderStateMixin {
  late List<MusicTrack> _playlist;
  int _currentTrackIndex = 0;
  bool _isPlaying = true;
  double _currentSeconds = 0.0;
  bool _isLiked = false;
  bool _isShuffle = false;
  bool _isRepeat = false;
  bool _showLyricsView = false;

  late AnimationController _vinylController;
  Timer? _playbackTimer;
  final ScrollController _lyricsScrollController = ScrollController();

  MusicTrack get _currentTrack => _playlist[_currentTrackIndex];

  @override
  void initState() {
    super.initState();
    _playlist = TubeRepository.getMusicTracks();
    _isLiked = _currentTrack.isLiked;

    _vinylController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 16), // 33 RPM simulated smooth spin
    );

    if (_isPlaying) {
      _vinylController.repeat();
      _startPlaybackTimer();
    }
  }

  @override
  void dispose() {
    _vinylController.dispose();
    _playbackTimer?.cancel();
    _lyricsScrollController.dispose();
    super.dispose();
  }

  void _startPlaybackTimer() {
    _playbackTimer?.cancel();
    _playbackTimer = Timer.periodic(const Duration(milliseconds: 500), (timer) {
      if (!_isPlaying) return;

      setState(() {
        _currentSeconds += 0.5;
        if (_currentSeconds >= _currentTrack.durationSeconds) {
          if (_isRepeat) {
            _currentSeconds = 0.0;
          } else {
            _nextTrack();
          }
        }
      });

      if (_showLyricsView) {
        _autoScrollLyrics();
      }
    });
  }

  void _togglePlayPause() {
    setState(() {
      _isPlaying = !_isPlaying;
      if (_isPlaying) {
        _vinylController.repeat();
        _startPlaybackTimer();
      } else {
        _vinylController.stop();
        _playbackTimer?.cancel();
      }
    });
  }

  void _nextTrack() {
    setState(() {
      _currentTrackIndex = (_currentTrackIndex + 1) % _playlist.length;
      _currentSeconds = 0.0;
      _isLiked = _currentTrack.isLiked;
    });
  }

  void _prevTrack() {
    setState(() {
      if (_currentSeconds > 3) {
        _currentSeconds = 0.0;
      } else {
        _currentTrackIndex = (_currentTrackIndex - 1 + _playlist.length) % _playlist.length;
        _currentSeconds = 0.0;
        _isLiked = _currentTrack.isLiked;
      }
    });
  }

  void _seekTo(double seconds) {
    setState(() {
      _currentSeconds = seconds.clamp(0.0, _currentTrack.durationSeconds.toDouble());
    });
  }

  void _autoScrollLyrics() {
    final activeIndex = _getActiveLyricIndex();
    if (activeIndex != -1 && _lyricsScrollController.hasClients) {
      final targetOffset = activeIndex * 48.0;
      _lyricsScrollController.animateTo(
        targetOffset,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeOutCubic,
      );
    }
  }

  int _getActiveLyricIndex() {
    final lyrics = _currentTrack.lyrics;
    for (int i = lyrics.length - 1; i >= 0; i--) {
      if (_currentSeconds >= lyrics[i].timeSeconds) {
        return i;
      }
    }
    return 0;
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
        child: Column(
          children: [
            // Top App Bar
            _buildTopBar(),

            // Background Audio Simulator Telemetry Banner
            _buildBackgroundAudioPill(),

            // Center View (Spinning Vinyl vs Synchronized Lyrics)
            Expanded(
              child: _showLyricsView
                  ? _buildSynchronizedLyricsView()
                  : _buildVinylDiscView(),
            ),

            // Track Information Row
            _buildTrackInfoRow(),

            // Audio Scrubber Slider
            _buildAudioScrubber(),

            // Playback Control Buttons (Shuffle, Prev, Play, Next, Repeat)
            _buildPlaybackControls(),

            // Bottom Navigation Sheet Trigger (Queue / Lyrics toggle)
            _buildBottomBarActions(),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 28),
            onPressed: () {},
          ),
          Column(
            children: [
              const Text(
                'PLAYING FROM PLAYLIST',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: QuantColors.textMuted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _currentTrack.album,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.more_vert_rounded, color: Colors.white),
            onPressed: _showTrackOptionsMenu,
          ),
        ],
      ),
    );
  }

  Widget _buildBackgroundAudioPill() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: QuantColors.statusSuccess,
              boxShadow: [
                BoxShadow(
                  color: QuantColors.statusSuccess.withOpacity(0.6),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Text(
            'Background Audio Engine Active • Sovereign DSP Low-Power',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: QuantColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  /// Center Vinyl Disc with smooth animated rotation
  Widget _buildVinylDiscView() {
    return Center(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final size = (constraints.maxHeight * 0.85).clamp(240.0, 320.0);

          return RotationTransition(
            turns: _vinylController,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF101217),
                border: Border.all(color: const Color(0xFF252936), width: 3),
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.crimsonRed.withOpacity(0.2),
                    blurRadius: 30,
                    spreadRadius: 5,
                  ),
                  BoxShadow(
                    color: Colors.black.withOpacity(0.8),
                    blurRadius: 20,
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Subtle Vinyl Grooves rings
                  Container(
                    width: size * 0.85,
                    height: size * 0.85,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withOpacity(0.04), width: 1.5),
                    ),
                  ),
                  Container(
                    width: size * 0.70,
                    height: size * 0.70,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withOpacity(0.06), width: 1.5),
                    ),
                  ),
                  Container(
                    width: size * 0.55,
                    height: size * 0.55,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white.withOpacity(0.04), width: 1.5),
                    ),
                  ),

                  // Center Album Artwork Circle
                  Container(
                    width: size * 0.42,
                    height: size * 0.42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: QuantColors.crimsonRed, width: 2),
                      image: DecorationImage(
                        image: NetworkImage(_currentTrack.albumArtUrl),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),

                  // Center Turntable Spindle Hole
                  Container(
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: QuantColors.voidObsidian,
                      border: Border.all(color: Colors.white30, width: 1.5),
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

  /// Synchronized Scrolling Lyrics View
  Widget _buildSynchronizedLyricsView() {
    final lyrics = _currentTrack.lyrics;
    final activeIndex = _getActiveLyricIndex();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Synchronized Sovereign Lyrics',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.sovereignCyan,
                ),
              ),
              Text(
                'Tap line to jump',
                style: TextStyle(
                  fontSize: 11,
                  color: QuantColors.textMuted.withOpacity(0.8),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView.builder(
              controller: _lyricsScrollController,
              itemCount: lyrics.length,
              physics: const BouncingScrollPhysics(),
              itemBuilder: (context, index) {
                final line = lyrics[index];
                final isActive = index == activeIndex;

                return GestureDetector(
                  onTap: () => _seekTo(line.timeSeconds),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      line.text,
                      style: TextStyle(
                        fontSize: isActive ? 20 : 15,
                        fontWeight: isActive ? FontWeight.w800 : FontWeight.w500,
                        color: isActive ? Colors.white : QuantColors.textMuted,
                        height: 1.3,
                        shadows: isActive
                            ? [
                                BoxShadow(
                                  color: QuantColors.crimsonRed.withOpacity(0.6),
                                  blurRadius: 12,
                                ),
                              ]
                            : null,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrackInfoRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _currentTrack.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _currentTrack.artist,
                  style: const TextStyle(
                    fontSize: 14,
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              _isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              color: _isLiked ? QuantColors.crimsonRed : QuantColors.textMuted,
              size: 26,
            ),
            onPressed: () {
              setState(() {
                _isLiked = !_isLiked;
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAudioScrubber() {
    final totalDuration = _currentTrack.durationSeconds.toDouble();
    final clampedCurrent = _currentSeconds.clamp(0.0, totalDuration);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 4,
              activeTrackColor: QuantColors.crimsonRed,
              inactiveTrackColor: QuantColors.hairlineBorder,
              thumbColor: Colors.white,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
            ),
            child: Slider(
              value: clampedCurrent,
              max: totalDuration,
              onChanged: (val) {
                _seekTo(val);
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _formatTime(_currentSeconds),
                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                ),
                Text(
                  _currentTrack.formattedDuration,
                  style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlaybackControls() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Shuffle
          IconButton(
            icon: Icon(
              Icons.shuffle_rounded,
              color: _isShuffle ? QuantColors.crimsonRed : QuantColors.textMuted,
              size: 22,
            ),
            onPressed: () => setState(() => _isShuffle = !_isShuffle),
          ),

          // Previous
          IconButton(
            icon: const Icon(Icons.skip_previous_rounded, color: Colors.white, size: 36),
            onPressed: _prevTrack,
          ),

          // Play / Pause Circle
          GestureDetector(
            onTap: _togglePlayPause,
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: QuantColors.crimsonRed,
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.crimsonRed.withOpacity(0.4),
                    blurRadius: 18,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Icon(
                _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                color: Colors.white,
                size: 38,
              ),
            ),
          ),

          // Next
          IconButton(
            icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 36),
            onPressed: _nextTrack,
          ),

          // Repeat
          IconButton(
            icon: Icon(
              Icons.repeat_rounded,
              color: _isRepeat ? QuantColors.crimsonRed : QuantColors.textMuted,
              size: 22,
            ),
            onPressed: () => setState(() => _isRepeat = !_isRepeat),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBarActions() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Lyrics Toggle Button
          TextButton.icon(
            onPressed: () {
              setState(() {
                _showLyricsView = !_showLyricsView;
              });
            },
            icon: Icon(
              _showLyricsView ? Icons.album_rounded : Icons.lyrics_rounded,
              color: _showLyricsView ? QuantColors.crimsonRed : QuantColors.textSecondary,
              size: 18,
            ),
            label: Text(
              _showLyricsView ? 'Vinyl Disc' : 'Live Lyrics',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: _showLyricsView ? QuantColors.crimsonRed : QuantColors.textSecondary,
              ),
            ),
          ),

          // Playlist Queue Button
          IconButton(
            icon: const Icon(Icons.queue_music_rounded, color: QuantColors.textSecondary),
            onPressed: _showQueueBottomSheet,
          ),
        ],
      ),
    );
  }

  void _showQueueBottomSheet() {
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Text(
                    'Playlist Queue',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.textPrimary,
                    ),
                  ),
                ),
                const Divider(color: QuantColors.hairlineBorder),
                for (int i = 0; i < _playlist.length; i++) ...[
                  ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Image.network(
                        _playlist[i].albumArtUrl,
                        width: 44,
                        height: 44,
                        fit: BoxFit.cover,
                      ),
                    ),
                    title: Text(
                      _playlist[i].title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: i == _currentTrackIndex ? FontWeight.w700 : FontWeight.w500,
                        color: i == _currentTrackIndex ? QuantColors.crimsonRed : QuantColors.textPrimary,
                      ),
                    ),
                    subtitle: Text(
                      _playlist[i].artist,
                      style: const TextStyle(fontSize: 12, color: QuantColors.textMuted),
                    ),
                    trailing: Text(
                      _playlist[i].formattedDuration,
                      style: const TextStyle(fontSize: 11, color: QuantColors.textMuted),
                    ),
                    onTap: () {
                      setState(() {
                        _currentTrackIndex = i;
                        _currentSeconds = 0.0;
                        _isLiked = _playlist[i].isLiked;
                      });
                      Navigator.pop(context);
                    },
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  void _showTrackOptionsMenu() {
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
                  leading: const Icon(Icons.share_rounded, color: QuantColors.textPrimary),
                  title: const Text('Share Song Link', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () => Navigator.pop(context),
                ),
                ListTile(
                  leading: const Icon(Icons.playlist_add_rounded, color: QuantColors.textPrimary),
                  title: const Text('Add to Playlist', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () => Navigator.pop(context),
                ),
                ListTile(
                  leading: const Icon(Icons.download_rounded, color: QuantColors.textPrimary),
                  title: const Text('Download FLAC Lossless (24-bit/192kHz)', style: TextStyle(color: QuantColors.textPrimary)),
                  onTap: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
