import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/cooks_models.dart';

/// Aspect ratio switchable preview monitor (9:16 vertical reel, 16:9 widescreen, 1:1 square, 4:5 portrait)
/// with play/pause, frame-stepping buttons, overlay text/sticker drag handles,
/// and safe margin guides.
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (120Hz Impeller acceleration).
class PreviewMonitorScreen extends StatefulWidget {
  final TimelineProject project;
  final bool isPlaying;
  final VoidCallback onTogglePlayPause;
  final ValueChanged<int> onSeekToMs;
  final ValueChanged<AspectRatioMode> onAspectRatioChanged;
  final ValueChanged<OverlayElement>? onSelectOverlay;
  final Function(String id, double x, double y)? onUpdateOverlayPosition;

  const PreviewMonitorScreen({
    super.key,
    required this.project,
    required this.isPlaying,
    required this.onTogglePlayPause,
    required this.onSeekToMs,
    required this.onAspectRatioChanged,
    this.onSelectOverlay,
    this.onUpdateOverlayPosition,
  });

  @override
  State<PreviewMonitorScreen> createState() => _PreviewMonitorScreenState();
}

class _PreviewMonitorScreenState extends State<PreviewMonitorScreen> {
  bool _showSafeMargins = false;
  bool _isFullscreen = false;
  String? _selectedOverlayId;

  // Frame stepping constant for 60fps (16.66ms per frame)
  static const int _frameStepMs = 17;
  static const int _secondStepMs = 1000;

  void _stepFrame(int deltaMs) {
    final newTime = (widget.project.currentPlayheadMs + deltaMs)
        .clamp(0, widget.project.totalDurationMs);
    widget.onSeekToMs(newTime);
  }

  String _formatTimecode(int ms) {
    final minutes = (ms ~/ 60000).toString().padLeft(2, '0');
    final seconds = ((ms % 60000) ~/ 1000).toString().padLeft(2, '0');
    final frames = (((ms % 1000) * 60) ~/ 1000).toString().padLeft(2, '0');
    return '$minutes:$seconds:$frames';
  }

  @override
  Widget build(BuildContext context) {
    final currentAspect = widget.project.aspectRatio;

    return Container(
      color: QuantColors.voidObsidian,
      child: Column(
        children: [
          // Monitor Top Toolbar: Aspect Ratio Switcher & Safe Margin Guides
          _buildMonitorControlsBar(currentAspect),

          // Central Preview Viewport
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: AspectRatio(
                  aspectRatio: currentAspect.aspectRatio,
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF0D0F17),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: QuantColors.hairlineBorder,
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.6),
                          blurRadius: 24,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(15),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          // Base Video Simulation Canvas
                          _buildSimulatedVideoCanvas(),

                          // Safe Margin Overlay (Action & Title Safe Lines)
                          if (_showSafeMargins) _buildSafeMarginsGuide(),

                          // Draggable & Selectable Overlay Elements (Captions & Watermarks)
                          ...widget.project.overlays.map(_buildOverlayWidget),

                          // Frame Timecode & Status HUD (Top Left)
                          Positioned(
                            top: 12,
                            left: 12,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.75),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 6,
                                    height: 6,
                                    decoration: BoxDecoration(
                                      color: widget.isPlaying
                                          ? QuantColors.statusSuccess
                                          : QuantColors.moltenAmber,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    _formatTimecode(widget.project.currentPlayheadMs),
                                    style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: QuantColors.textPrimary,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          // Resolution & Codec HUD (Top Right)
                          Positioned(
                            top: 12,
                            right: 12,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.75),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: QuantColors.hairlineBorder, width: 0.8),
                              ),
                              child: Text(
                                widget.project.resolution.badge,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: QuantColors.sovereignCyan,
                                  letterSpacing: 0.4,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),

          // Monitor Bottom Playback Transport Bar
          _buildTransportControlsBar(),
        ],
      ),
    );
  }

  Widget _buildMonitorControlsBar(AspectRatioMode currentAspect) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Aspect Ratio Selector Pills
          Row(
            children: AspectRatioMode.values.map((aspect) {
              final isSelected = aspect == currentAspect;
              return Padding(
                padding: const EdgeInsets.only(right: 6.0),
                child: InkWell(
                  onTap: () => widget.onAspectRatioChanged(aspect),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? QuantColors.moltenAmber.withOpacity(0.2)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: isSelected
                            ? QuantColors.moltenAmber
                            : QuantColors.hairlineBorder,
                        width: 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          aspect.icon,
                          size: 13,
                          color: isSelected
                              ? QuantColors.moltenAmber
                              : QuantColors.textMuted,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          aspect.label,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                            color: isSelected
                                ? QuantColors.moltenAmber
                                : QuantColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          // Right utility buttons: Safe Margins & Fullscreen
          Row(
            children: [
              IconButton(
                icon: Icon(
                  _showSafeMargins
                      ? Icons.grid_goldenratio_rounded
                      : Icons.grid_off_rounded,
                  size: 18,
                  color: _showSafeMargins
                      ? QuantColors.sovereignCyan
                      : QuantColors.textMuted,
                ),
                tooltip: 'Toggle Safe Margins',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                onPressed: () {
                  setState(() {
                    _showSafeMargins = !_showSafeMargins;
                  });
                },
              ),
              const SizedBox(width: 4),
              IconButton(
                icon: Icon(
                  _isFullscreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                  size: 18,
                  color: QuantColors.textMuted,
                ),
                tooltip: 'Preview Fullscreen',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                onPressed: () {
                  setState(() {
                    _isFullscreen = !_isFullscreen;
                  });
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSimulatedVideoCanvas() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Color(0xFF0F172A),
            Color(0xFF1E1B4B),
            Color(0xFF31103F),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Cyberpunk grid backdrop simulation
          Positioned.fill(
            child: Opacity(
              opacity: 0.15,
              child: CustomPaint(
                painter: _SimulatedGridPainter(),
              ),
            ),
          ),

          // Central Studio Graphic Simulation
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.moltenAmber, QuantColors.sovereignCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.moltenAmber.withOpacity(0.35),
                      blurRadius: 20,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.movie_creation_rounded,
                  color: Colors.white,
                  size: 32,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'QUANT COOKS STUDIO',
                style: QuantTypography.microCapsule.copyWith(
                  letterSpacing: 2.0,
                  color: QuantColors.textSecondary,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '4K 60FPS IMPELLER HARDWARE CANVAS',
                style: QuantTypography.microCapsule.copyWith(
                  letterSpacing: 0.8,
                  color: QuantColors.moltenAmber,
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSafeMarginsGuide() {
    return Positioned.fill(
      child: IgnorePointer(
        child: Container(
          margin: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            border: Border.all(
              color: QuantColors.sovereignCyan.withOpacity(0.4),
              width: 1,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Container(
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(
                color: QuantColors.sunsetGold.withOpacity(0.35),
                width: 1,
              ),
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOverlayWidget(OverlayElement overlay) {
    final isSelected = _selectedOverlayId == overlay.id;

    return Positioned(
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      child: Align(
        alignment: Alignment(
          (overlay.normalizedX * 2.0) - 1.0,
          (overlay.normalizedY * 2.0) - 1.0,
        ),
        child: GestureDetector(
          onTap: () {
            setState(() {
              _selectedOverlayId = overlay.id;
            });
            widget.onSelectOverlay?.call(overlay);
          },
          onPanUpdate: (details) {
            final newX = (overlay.normalizedX + details.delta.dx / 300).clamp(0.05, 0.95);
            final newY = (overlay.normalizedY + details.delta.dy / 300).clamp(0.05, 0.95);
            widget.onUpdateOverlayPosition?.call(overlay.id, newX, newY);
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: overlay.backgroundColor ?? Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: isSelected
                    ? QuantColors.moltenAmber
                    : Colors.transparent,
                width: 1.5,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (overlay.isCaption) ...[
                  const Icon(
                    Icons.auto_awesome_rounded,
                    color: QuantColors.moltenAmber,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  overlay.content,
                  style: TextStyle(
                    fontSize: 16 * overlay.scale,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                    color: overlay.textColor,
                    shadows: [
                      Shadow(
                        color: Colors.black.withOpacity(0.8),
                        blurRadius: 8,
                        offset: const Offset(1, 1),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTransportControlsBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Current Timecode / Total Duration
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _formatTimecode(widget.project.currentPlayheadMs),
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QuantColors.textPrimary,
                ),
              ),
              Text(
                'Total: ${_formatTimecode(widget.project.totalDurationMs)}',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: QuantColors.textMuted,
                ),
              ),
            ],
          ),

          // Central Transport Buttons (Frame Step & Play/Pause)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Step Back 1s
              IconButton(
                icon: const Icon(Icons.replay_10_rounded, size: 20),
                color: QuantColors.textSecondary,
                tooltip: 'Rewind 1 Second',
                onPressed: () => _stepFrame(-_secondStepMs),
              ),

              // Step Back 1 Frame (1/60s)
              IconButton(
                icon: const Icon(Icons.skip_previous_rounded, size: 22),
                color: QuantColors.textSecondary,
                tooltip: 'Step -1 Frame',
                onPressed: () => _stepFrame(-_frameStepMs),
              ),

              const SizedBox(width: 4),

              // Master Play/Pause Button
              InkWell(
                onTap: widget.onTogglePlayPause,
                borderRadius: BorderRadius.circular(24),
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [QuantColors.moltenAmber, QuantColors.sunsetGold],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: QuantColors.moltenAmber.withOpacity(0.4),
                        blurRadius: 12,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: Icon(
                    widget.isPlaying
                        ? Icons.pause_rounded
                        : Icons.play_arrow_rounded,
                    color: QuantColors.voidObsidian,
                    size: 28,
                  ),
                ),
              ),

              const SizedBox(width: 4),

              // Step Forward 1 Frame (1/60s)
              IconButton(
                icon: const Icon(Icons.skip_next_rounded, size: 22),
                color: QuantColors.textSecondary,
                tooltip: 'Step +1 Frame',
                onPressed: () => _stepFrame(_frameStepMs),
              ),

              // Step Forward 1s
              IconButton(
                icon: const Icon(Icons.forward_10_rounded, size: 20),
                color: QuantColors.textSecondary,
                tooltip: 'Forward 1 Second',
                onPressed: () => _stepFrame(_secondStepMs),
              ),
            ],
          ),

          // Snapping & Loop indicators
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.anchor_rounded,
                      size: 13,
                      color: QuantColors.statusSuccess,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'SNAP',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Custom painter for cyber simulation grid background (Zero Skia clipPath).
class _SimulatedGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 0.5;

    const step = 24.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
