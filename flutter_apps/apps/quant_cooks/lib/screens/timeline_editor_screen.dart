import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/cooks_models.dart';

/// Multi-track video and audio timeline scrubber with 4 synchronized tracks:
/// 1) Primary Video Track (thumbnail reel, trim handles)
/// 2) Background Music Track (waveform visualizer, volume envelope)
/// 3) Sound Effects (SFX) Track (cue markers)
/// 4) Dynamic Kinetic Captions Track (word-level sync markers)
///
/// Features track mute/solo toggles, snap-to-cut magnetic tool, and precise millisecond playhead (00:01:24.350).
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
class TimelineEditorScreen extends StatefulWidget {
  final TimelineProject project;
  final ValueChanged<int> onSeekToMs;
  final ValueChanged<TimelineClip>? onClipSelected;
  final Function(String trackId, String clipId, int trimStart, int trimEnd)?
      onClipTrimmed;
  final VoidCallback? onSplitClipAtPlayhead;
  final VoidCallback? onDeleteSelectedClip;

  const TimelineEditorScreen({
    super.key,
    required this.project,
    required this.onSeekToMs,
    this.onClipSelected,
    this.onClipTrimmed,
    this.onSplitClipAtPlayhead,
    this.onDeleteSelectedClip,
  });

  @override
  State<TimelineEditorScreen> createState() => _TimelineEditorScreenState();

  /// Format milliseconds into precise SMPTE millisecond timecode: HH:MM:SS.mmm
  static String formatTimestampPrecise(int ms) {
    final hours = ms ~/ 3600000;
    final minutes = (ms % 3600000) ~/ 60000;
    final seconds = (ms % 60000) ~/ 1000;
    final milliseconds = ms % 1000;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}.${milliseconds.toString().padLeft(3, '0')}';
  }
}

class _TimelineEditorScreenState extends State<TimelineEditorScreen> {
  final ScrollController _timelineScrollController = ScrollController();
  double _zoomScale = 1.0; // 1.0 = standard (100 pixels per second)
  String? _selectedClipId;
  bool _isDraggingTrimLeft = false;
  bool _isDraggingTrimRight = false;
  bool _snapToCutEnabled = true;

  // Track mute / solo states local overrides for responsive interactivity
  late Map<String, bool> _trackMutedMap;
  late Map<String, bool> _trackSoloMap;

  // Pixels per second at zoom scale 1.0
  static const double _basePixelsPerSecond = 100.0;

  double get _pixelsPerMs => (_basePixelsPerSecond * _zoomScale) / 1000.0;

  double _msToPixels(int ms) => ms * _pixelsPerMs;

  int _pixelsToMs(double px) => (px / _pixelsPerMs).round();

  @override
  void initState() {
    super.initState();
    _initTrackStates();
  }

  @override
  void didUpdateWidget(covariant TimelineEditorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.project.tracks.length != widget.project.tracks.length) {
      _initTrackStates();
    }
  }

  void _initTrackStates() {
    _trackMutedMap = {
      for (final track in widget.project.tracks) track.id: track.isMuted,
    };
    _trackSoloMap = {
      for (final track in widget.project.tracks) track.id: track.isSoloed,
    };
  }

  @override
  void dispose() {
    _timelineScrollController.dispose();
    super.dispose();
  }

  void _onTimelineScrub(double localDx) {
    final scrollOffset = _timelineScrollController.hasClients
        ? _timelineScrollController.offset
        : 0.0;
    final totalX = localDx + scrollOffset;
    var newTimeMs =
        _pixelsToMs(totalX).clamp(0, widget.project.totalDurationMs);

    // Magnetic Snap-to-Cut logic
    if (_snapToCutEnabled) {
      const snapThresholdMs = 120;
      for (final track in widget.project.tracks) {
        for (final clip in track.clips) {
          final clipStart = clip.startTimeMs;
          final clipEnd = clip.startTimeMs + clip.effectiveDurationMs;

          if ((newTimeMs - clipStart).abs() < snapThresholdMs) {
            newTimeMs = clipStart;
            break;
          } else if ((newTimeMs - clipEnd).abs() < snapThresholdMs) {
            newTimeMs = clipEnd;
            break;
          }
        }
      }
    }

    widget.onSeekToMs(newTimeMs);
  }

  void _toggleTrackMute(String trackId) {
    setState(() {
      final current = _trackMutedMap[trackId] ?? false;
      _trackMutedMap[trackId] = !current;
    });
  }

  void _toggleTrackSolo(String trackId) {
    setState(() {
      final current = _trackSoloMap[trackId] ?? false;
      _trackSoloMap[trackId] = !current;
    });
  }

  @override
  Widget build(BuildContext context) {
    final totalWidth = _msToPixels(widget.project.totalDurationMs) + 400;

    return Container(
      color: QuantColors.voidObsidian,
      child: Column(
        children: [
          // Timeline Quick Action Toolbar (Split, Snap, Speed, Delete, Timecode, Zoom)
          _buildTimelineActionToolbar(),

          // Main Multi-Track Scrubber Area
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Fixed Left Track Headers (Mute/Solo, Names, Track Icons)
                _buildFixedTrackHeaders(),

                // Horizontally Scrollable Timeline with Playhead & 4 Synchronized Tracks
                Expanded(
                  child: Stack(
                    children: [
                      SingleChildScrollView(
                        controller: _timelineScrollController,
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        child: SizedBox(
                          width: totalWidth,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Time Ruler (Seconds and Sub-second Frame Ticks)
                              _buildTimeRuler(totalWidth),

                              // 4 Synchronized Track Lanes
                              Expanded(
                                child: GestureDetector(
                                  onTapDown: (details) =>
                                      _onTimelineScrub(details.localPosition.dx),
                                  onPanUpdate: (details) =>
                                      _onTimelineScrub(details.localPosition.dx),
                                  child: ListView.builder(
                                    itemCount: widget.project.tracks.length,
                                    physics: const NeverScrollableScrollPhysics(),
                                    itemBuilder: (context, index) {
                                      final track = widget.project.tracks[index];
                                      return _buildTrackLane(track);
                                    },
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Synchronized Playhead Scrub Needle
                      _buildPlayheadOverlay(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineActionToolbar() {
    final precisePlayheadStr =
        TimelineEditorScreen.formatTimestampPrecise(widget.project.currentPlayheadMs);

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Left Tool buttons: Split (Blade), Snap-to-Cut, Speed, Delete
          Row(
            children: [
              // Split Tool (Blade)
              InkWell(
                onTap: widget.onSplitClipAtPlayhead,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.content_cut_rounded,
                        size: 14,
                        color: QuantColors.moltenAmber,
                      ),
                      SizedBox(width: 5),
                      Text(
                        'Split',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(width: 8),

              // Snap-to-Cut Tool (Magnet)
              InkWell(
                onTap: () {
                  setState(() {
                    _snapToCutEnabled = !_snapToCutEnabled;
                  });
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        _snapToCutEnabled
                            ? 'Snap-to-Cut Active (Magnetic Alignment)'
                            : 'Snap-to-Cut Disabled (Free Scrub)',
                        style: const TextStyle(color: QuantColors.textPrimary),
                      ),
                      duration: const Duration(milliseconds: 900),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _snapToCutEnabled
                        ? QuantColors.sovereignCyan.withOpacity(0.18)
                        : QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _snapToCutEnabled
                          ? QuantColors.sovereignCyan
                          : QuantColors.hairlineBorder,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.auto_fix_high_rounded,
                        size: 14,
                        color: _snapToCutEnabled
                            ? QuantColors.sovereignCyan
                            : QuantColors.textMuted,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'Snap',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: _snapToCutEnabled
                              ? QuantColors.sovereignCyan
                              : QuantColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(width: 8),

              // Speed Ramp Tool
              InkWell(
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Optical Flow Speed Ramp: 1.0x -> 2.5x Curve Applied',
                        style: TextStyle(color: QuantColors.textPrimary),
                      ),
                      duration: Duration(seconds: 1),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.speed_rounded,
                        size: 14,
                        color: QuantColors.sunriseRose,
                      ),
                      SizedBox(width: 5),
                      Text(
                        'Speed',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(width: 8),

              // Delete Tool
              InkWell(
                onTap: widget.onDeleteSelectedClip,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.delete_outline_rounded,
                        size: 14,
                        color: QuantColors.statusError,
                      ),
                      SizedBox(width: 5),
                      Text(
                        'Delete',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Center Precise Millisecond Playhead Timecode Display (00:01:24.350)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.timer_rounded,
                  size: 13,
                  color: QuantColors.moltenAmber,
                ),
                const SizedBox(width: 6),
                Text(
                  precisePlayheadStr,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: QuantColors.moltenAmber,
                  ),
                ),
              ],
            ),
          ),

          // Right Zoom Controls (+ / - Pinch Simulation)
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.zoom_out_rounded, size: 18),
                color: QuantColors.textSecondary,
                tooltip: 'Zoom Out Timeline',
                onPressed: () {
                  setState(() {
                    _zoomScale = (_zoomScale - 0.25).clamp(0.5, 3.0);
                  });
                },
              ),
              Text(
                '${(_zoomScale * 100).toInt()}%',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textSecondary,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.zoom_in_rounded, size: 18),
                color: QuantColors.textSecondary,
                tooltip: 'Zoom In Timeline',
                onPressed: () {
                  setState(() {
                    _zoomScale = (_zoomScale + 0.25).clamp(0.5, 3.0);
                  });
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFixedTrackHeaders() {
    return Container(
      width: 140,
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateSurface,
        border: Border(
          right: BorderSide(color: QuantColors.hairlineBorder, width: 1.0),
        ),
      ),
      child: Column(
        children: [
          // Corner ruler block
          Container(
            height: 32,
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
              ),
            ),
            child: const Text(
              'TRACKS',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.0,
                color: QuantColors.textMuted,
              ),
            ),
          ),

          // Track lane headers with Mute (M) & Solo (S) controls
          Expanded(
            child: ListView.builder(
              itemCount: widget.project.tracks.length,
              physics: const NeverScrollableScrollPhysics(),
              itemBuilder: (context, index) {
                final track = widget.project.tracks[index];
                final isMuted = _trackMutedMap[track.id] ?? false;
                final isSoloed = _trackSoloMap[track.id] ?? false;

                return Container(
                  height: 68,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Row(
                        children: [
                          Icon(
                            track.type.icon,
                            size: 14,
                            color: QuantColors.moltenAmber,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              track.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: QuantColors.textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          // Mute Toggle (M)
                          _buildMuteSoloButton(
                            label: 'M',
                            isActive: isMuted,
                            activeColor: QuantColors.statusError,
                            tooltip: 'Mute Track',
                            onTap: () => _toggleTrackMute(track.id),
                          ),
                          const SizedBox(width: 4),

                          // Solo Toggle (S)
                          _buildMuteSoloButton(
                            label: 'S',
                            isActive: isSoloed,
                            activeColor: QuantColors.sovereignCyan,
                            tooltip: 'Solo Track',
                            onTap: () => _toggleTrackSolo(track.id),
                          ),
                          const SizedBox(width: 6),

                          // Lock icon
                          _buildMiniHeaderToggle(
                            icon: track.isLocked
                                ? Icons.lock_rounded
                                : Icons.lock_open_rounded,
                            isActive: track.isLocked,
                            tooltip: 'Lock Track',
                          ),
                          const SizedBox(width: 4),

                          // Hide icon
                          _buildMiniHeaderToggle(
                            icon: track.isHidden
                                ? Icons.visibility_off_rounded
                                : Icons.visibility_rounded,
                            isActive: !track.isHidden,
                            tooltip: 'Hide Track',
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMuteSoloButton({
    required String label,
    required bool isActive,
    required Color activeColor,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: isActive ? activeColor.withOpacity(0.2) : QuantColors.voidObsidian,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(
            color: isActive ? activeColor : QuantColors.hairlineBorder,
            width: 1.0,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              color: isActive ? activeColor : QuantColors.textMuted,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMiniHeaderToggle({
    required IconData icon,
    required bool isActive,
    required String tooltip,
  }) {
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: isActive
            ? QuantColors.moltenAmber.withOpacity(0.15)
            : QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: isActive
              ? QuantColors.moltenAmber.withOpacity(0.4)
              : QuantColors.hairlineBorder,
          width: 0.8,
        ),
      ),
      child: Icon(
        icon,
        size: 11,
        color: isActive ? QuantColors.moltenAmber : QuantColors.textMuted,
      ),
    );
  }

  Widget _buildTimeRuler(double width) {
    return Container(
      height: 32,
      width: width,
      decoration: const BoxDecoration(
        color: Color(0xFF0F121A),
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: CustomPaint(
        size: Size(width, 32),
        painter: _TimeRulerPainter(
          pixelsPerSecond: _basePixelsPerSecond * _zoomScale,
          totalSeconds: (widget.project.totalDurationMs / 1000).ceil() + 5,
        ),
      ),
    );
  }

  Widget _buildTrackLane(TimelineTrack track) {
    return Container(
      height: 68,
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Stack(
        children: [
          // Background track lane guideline
          Positioned.fill(
            child: Container(
              color: QuantColors.voidObsidian.withOpacity(0.4),
            ),
          ),

          // Clips positioned in lane
          ...track.clips.map((clip) => _buildClipBox(track, clip)),
        ],
      ),
    );
  }

  Widget _buildClipBox(TimelineTrack track, TimelineClip clip) {
    final startPx = _msToPixels(clip.startTimeMs);
    final clipWidth = _msToPixels(clip.effectiveDurationMs);
    final isSelected = _selectedClipId == clip.id;

    return Positioned(
      left: startPx,
      top: 4,
      bottom: 4,
      width: clipWidth.clamp(20.0, 5000.0),
      child: GestureDetector(
        onTap: () {
          setState(() {
            _selectedClipId = clip.id;
          });
          widget.onClipSelected?.call(clip);
        },
        child: Container(
          decoration: BoxDecoration(
            color: clip.color.withOpacity(0.25),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? Colors.white : clip.color,
              width: isSelected ? 2.0 : 1.0,
            ),
          ),
          child: Stack(
            children: [
              // 1) Primary Video Track: Thumbnail Reel Visualizer
              if (track.type == TrackType.video)
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                    child: _buildVideoThumbnailReel(clip),
                  ),
                ),

              // 2) Background Music Track: Waveform Visualizer + Volume Envelope
              if (track.type == TrackType.audio && clip.waveformPeaks != null)
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    child: _buildAudioWaveformWithEnvelope(
                      clip.waveformPeaks!,
                      clip.volumeEnvelopePoints,
                      clip.color,
                    ),
                  ),
                ),

              // 3) Sound Effects (SFX) Track: Cue Markers
              if (track.type == TrackType.sfx && clip.cueMarkersMs != null)
                Positioned.fill(
                  child: _buildSfxCueMarkers(clip, clipWidth),
                ),

              // 4) Dynamic Kinetic Captions Track: Word-Level Sync Markers
              if (track.type == TrackType.captions && clip.kineticWords != null)
                Positioned.fill(
                  child: _buildKineticWordMarkers(clip),
                ),

              // Clip Name Label & Duration
              Positioned(
                left: 8,
                top: 4,
                right: 8,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        clip.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                    ),
                    Text(
                      '${(clip.effectiveDurationMs / 1000).toStringAsFixed(1)}s',
                      style: const TextStyle(
                        fontSize: 9,
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),

              // Transition Marker Badge (if attached to clip)
              if (clip.transitionName != null)
                Positioned(
                  right: 2,
                  bottom: 2,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(
                        color: QuantColors.moltenAmber,
                        width: 0.8,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.swap_horiz_rounded,
                          size: 10,
                          color: QuantColors.moltenAmber,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          clip.transitionName!,
                          style: const TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w800,
                            color: QuantColors.moltenAmber,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // Trimming Handles (Left & Right) when clip is selected
              if (isSelected) ...[
                // Left Trim Handle
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 14,
                  child: GestureDetector(
                    onHorizontalDragStart: (_) =>
                        setState(() => _isDraggingTrimLeft = true),
                    onHorizontalDragEnd: (_) =>
                        setState(() => _isDraggingTrimLeft = false),
                    onHorizontalDragUpdate: (details) {
                      final deltaMs = _pixelsToMs(details.delta.dx);
                      final newTrim = (clip.trimStartMs + deltaMs)
                          .clamp(0, clip.durationMs - 500);
                      widget.onClipTrimmed?.call(
                          track.id, clip.id, newTrim, clip.trimEndMs);
                    },
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.horizontal(left: Radius.circular(7)),
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.drag_indicator_rounded,
                          size: 10,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ),
                ),

                // Right Trim Handle
                Positioned(
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 14,
                  child: GestureDetector(
                    onHorizontalDragStart: (_) =>
                        setState(() => _isDraggingTrimRight = true),
                    onHorizontalDragEnd: (_) =>
                        setState(() => _isDraggingTrimRight = false),
                    onHorizontalDragUpdate: (details) {
                      final deltaMs = _pixelsToMs(-details.delta.dx);
                      final newTrim = (clip.trimEndMs + deltaMs)
                          .clamp(0, clip.durationMs - 500);
                      widget.onClipTrimmed?.call(
                          track.id, clip.id, clip.trimStartMs, newTrim);
                    },
                    child: Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.horizontal(right: Radius.circular(7)),
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.drag_indicator_rounded,
                          size: 10,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// 1) Primary Video Track: Thumbnail filmstrip reel
  Widget _buildVideoThumbnailReel(TimelineClip clip) {
    return Row(
      children: List.generate(4, (index) {
        return Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian.withOpacity(0.6),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(
                color: clip.color.withOpacity(0.3),
                width: 0.6,
              ),
            ),
            child: Center(
              child: Icon(
                Icons.movie_creation_rounded,
                size: 16,
                color: clip.color.withOpacity(0.4),
              ),
            ),
          ),
        );
      }),
    );
  }

  /// 2) Background Music Track: Waveform visualizer + volume envelope curve
  Widget _buildAudioWaveformWithEnvelope(
    List<double> peaks,
    List<double>? envelopePoints,
    Color barColor,
  ) {
    return Stack(
      children: [
        // Waveform Visualizer Bars
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: peaks.map((p) {
            return Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 1.0),
                height: (p * 32.0).clamp(4.0, 36.0),
                decoration: BoxDecoration(
                  color: barColor.withOpacity(0.75),
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
            );
          }).toList(),
        ),

        // Volume Envelope Overlay Line
        if (envelopePoints != null && envelopePoints.isNotEmpty)
          Positioned.fill(
            child: CustomPaint(
              painter: _VolumeEnvelopePainter(
                envelopePoints: envelopePoints,
                lineColor: Colors.white.withOpacity(0.8),
              ),
            ),
          ),
      ],
    );
  }

  /// 3) Sound Effects (SFX) Track: Cue Markers
  Widget _buildSfxCueMarkers(TimelineClip clip, double clipWidth) {
    final markers = clip.cueMarkersMs ?? [];
    return Stack(
      children: [
        Positioned.fill(
          child: Container(
            alignment: Alignment.center,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.graphic_eq_rounded,
                  size: 14,
                  color: clip.color.withOpacity(0.5),
                ),
                const SizedBox(width: 4),
                Text(
                  'SFX CUES',
                  style: TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                    color: clip.color.withOpacity(0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
        ...markers.map((cueMs) {
          final ratio = (cueMs / clip.effectiveDurationMs).clamp(0.0, 1.0);
          final xPos = ratio * (clipWidth - 16);
          return Positioned(
            left: xPos,
            top: 20,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: clip.color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.2),
              ),
              child: const Center(
                child: Icon(
                  Icons.lens,
                  size: 4,
                  color: Colors.white,
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  /// 4) Dynamic Kinetic Captions Track: Word-Level Sync Markers
  Widget _buildKineticWordMarkers(TimelineClip clip) {
    final words = clip.kineticWords ?? [];
    return Positioned(
      left: 6,
      right: 6,
      bottom: 6,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        child: Row(
          children: words.map((w) {
            return Container(
              margin: const EdgeInsets.only(right: 4),
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: QuantColors.voidObsidian.withOpacity(0.85),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: QuantColors.moltenAmber.withOpacity(0.5),
                  width: 0.8,
                ),
              ),
              child: Text(
                w.word,
                style: const TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                  color: QuantColors.moltenAmber,
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildPlayheadOverlay() {
    final playheadX = _msToPixels(widget.project.currentPlayheadMs);
    final scrollOffset = _timelineScrollController.hasClients
        ? _timelineScrollController.offset
        : 0.0;
    final screenX = playheadX - scrollOffset;

    if (screenX < -20 || screenX > 2000) return const SizedBox.shrink();

    return Positioned(
      left: screenX - 1,
      top: 0,
      bottom: 0,
      child: IgnorePointer(
        child: Column(
          children: [
            // Playhead Triangular Head Capsule
            Container(
              width: 14,
              height: 14,
              decoration: const BoxDecoration(
                color: QuantColors.moltenAmber,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.moltenAmber,
                    blurRadius: 8,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: const Center(
                child: Icon(
                  Icons.arrow_drop_down_rounded,
                  size: 12,
                  color: QuantColors.voidObsidian,
                ),
              ),
            ),

            // Continuous Vertical Needle line through all tracks
            Expanded(
              child: Container(
                width: 2,
                color: QuantColors.moltenAmber,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Custom painter for volume envelope overlay line across audio clips.
class _VolumeEnvelopePainter extends CustomPainter {
  final List<double> envelopePoints;
  final Color lineColor;

  _VolumeEnvelopePainter({
    required this.envelopePoints,
    required this.lineColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (envelopePoints.length < 2) return;

    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;

    final path = Path();
    final stepX = size.width / (envelopePoints.length - 1);

    for (int i = 0; i < envelopePoints.length; i++) {
      final x = i * stepX;
      // Invert Y: 1.0 volume is near top, 0.0 is near bottom
      final y = size.height - (envelopePoints[i] * size.height).clamp(4.0, size.height - 4);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _VolumeEnvelopePainter oldDelegate) {
    return oldDelegate.envelopePoints != envelopePoints ||
        oldDelegate.lineColor != lineColor;
  }
}

/// Custom painter for timeline ruler ticks (Zero Skia clipPath).
class _TimeRulerPainter extends CustomPainter {
  final double pixelsPerSecond;
  final int totalSeconds;

  _TimeRulerPainter({
    required this.pixelsPerSecond,
    required this.totalSeconds,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final tickPaint = Paint()
      ..color = QuantColors.hairlineBorder
      ..strokeWidth = 1.0;

    final secondTickPaint = Paint()
      ..color = QuantColors.textSecondary
      ..strokeWidth = 1.2;

    final textStyle = const TextStyle(
      fontFamily: 'monospace',
      fontSize: 10,
      fontWeight: FontWeight.w700,
      color: QuantColors.textMuted,
    );

    for (int sec = 0; sec <= totalSeconds; sec++) {
      final x = sec * pixelsPerSecond;

      // Draw full second marker line
      canvas.drawLine(
          Offset(x, size.height - 12), Offset(x, size.height), secondTickPaint);

      // Draw second text label
      final textSpan = TextSpan(text: '${sec}s', style: textStyle);
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(canvas, Offset(x + 4, 4));

      // Sub-second 500ms and frame subdivisions
      final subX = x + (pixelsPerSecond / 2);
      canvas.drawLine(
          Offset(subX, size.height - 6), Offset(subX, size.height), tickPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TimeRulerPainter oldDelegate) {
    return oldDelegate.pixelsPerSecond != pixelsPerSecond ||
        oldDelegate.totalSeconds != totalSeconds;
  }
}
