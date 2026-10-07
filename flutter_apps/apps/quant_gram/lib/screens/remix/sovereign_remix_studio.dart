import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../../models/gram_models.dart';

/// Commercial Shortie & TikTok-class Sovereign Remix Studio
/// 
/// Supported Modes:
/// 1. Duet (Side-by-side vertical split or top/bottom split)
/// 2. Green Screen (Camera foreground with original reel video background)
/// 3. PiP (Picture-in-Picture circular or squircle reaction inset)
/// 
/// Strict Invariants:
/// - 100% ZERO raw Unicode emojis (strictly Material 3 vector Icon(Icons.xxx)).
/// - 100% ZERO Skia clipPath method calls (pure Impeller hardware acceleration).
/// - High density, enterprise obsidian luxury palette (QuantColors.voidObsidian, #12151E, #1E222A).
enum RemixMode {
  duet,
  greenScreen,
  pip,
}

enum DuetLayout {
  verticalSplit,
  horizontalSplit,
}

enum PipShape {
  circle,
  squircle,
}

enum PipPosition {
  topRight,
  topLeft,
  bottomRight,
  bottomLeft,
}

class SovereignRemixStudio extends StatefulWidget {
  final ReelItem reel;
  final VoidCallback? onCompleted;

  const SovereignRemixStudio({
    super.key,
    required this.reel,
    this.onCompleted,
  });

  /// Opens the Remix Studio as a fullscreen modal
  static Future<void> show(BuildContext context, ReelItem reel) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => SovereignRemixStudio(reel: reel),
        fullscreenDialog: true,
      ),
    );
  }

  @override
  State<SovereignRemixStudio> createState() => _SovereignRemixStudioState();
}

class _SovereignRemixStudioState extends State<SovereignRemixStudio>
    with SingleTickerProviderStateMixin {
  RemixMode _activeMode = RemixMode.duet;
  DuetLayout _duetLayout = DuetLayout.verticalSplit;
  PipShape _pipShape = PipShape.circle;
  PipPosition _pipPosition = PipPosition.topRight;

  // Recording State
  bool _isRecording = false;
  double _recordingProgress = 0.0;
  late AnimationController _recordProgressController;

  // Audio Mixer State
  double _originalAudioVolume = 0.8;
  double _micAudioVolume = 1.0;
  bool _showAudioMixer = false;

  // Camera Settings
  bool _isFrontCamera = true;
  bool _isFlashOn = false;
  bool _isMicMuted = false;
  bool _isBeautyFilterActive = true;
  double _playbackSpeed = 1.0; // 0.5x, 1.0x, 2.0x
  double _chromaSensitivity = 0.65;

  @override
  void initState() {
    super.initState();
    _recordProgressController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 15),
    )..addListener(() {
        setState(() {
          _recordingProgress = _recordProgressController.value;
        });
        if (_recordProgressController.isCompleted) {
          _stopRecording();
        }
      });
  }

  @override
  void dispose() {
    _recordProgressController.dispose();
    super.dispose();
  }

  void _toggleRecording() {
    if (_isRecording) {
      _stopRecording();
    } else {
      _startRecording();
    }
  }

  void _startRecording() {
    setState(() {
      _isRecording = true;
    });
    _recordProgressController.forward(from: 0.0);
  }

  void _stopRecording() {
    setState(() {
      _isRecording = false;
    });
    _recordProgressController.stop();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.elevatedCard,
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded, color: QuantColors.statusSuccess, size: 20),
            const SizedBox(width: 8),
            Text(
              'Remix track synthesized at 120Hz Impeller composite',
              style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // 1. Interactive Video Compositing Stage
          Positioned.fill(
            child: _buildCompositingViewport(),
          ),

          // 2. Top Header Controls (Back, Mode Indicator, Flip, Flash, Audio Mix)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildTopControlBar(),
          ),

          // 3. Right Sidebar Studio Tools (Speed, Filters, Timer, Mic)
          Positioned(
            right: 16,
            top: 110,
            child: _buildRightToolDock(),
          ),

          // 4. Floating Audio Mixer Drawer (if opened)
          if (_showAudioMixer)
            Positioned(
              left: 20,
              right: 20,
              top: 100,
              child: _buildAudioMixerCard(),
            ),

          // 5. Bottom Mode Selector & Recording Shutter Bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildBottomStudioBar(),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // COMPOSITING VIEWPORT (Duet, Green Screen, PiP)
  // ===========================================================================
  Widget _buildCompositingViewport() {
    switch (_activeMode) {
      case RemixMode.duet:
        return _buildDuetViewport();
      case RemixMode.greenScreen:
        return _buildGreenScreenViewport();
      case RemixMode.pip:
        return _buildPipViewport();
    }
  }

  /// Duet Mode: Split screen side-by-side or top/bottom
  Widget _buildDuetViewport() {
    if (_duetLayout == DuetLayout.verticalSplit) {
      return Row(
        children: [
          // Left: Original Reel Video Stream
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                border: const Border(
                  right: BorderSide(color: QuantColors.sunriseRose, width: 2),
                ),
                gradient: LinearGradient(
                  colors: widget.reel.gradientColors,
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: Icon(
                      Icons.play_circle_fill_rounded,
                      color: Colors.white.withOpacity(0.35),
                      size: 64,
                    ),
                  ),
                  Positioned(
                    bottom: 120,
                    left: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Original @${widget.reel.creatorHandle}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: QuantTypography.bodySmall.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Right: User Live Camera Viewfinder
          Expanded(
            child: Container(
              color: const Color(0xFF13151D),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _buildCameraSimulation(),
                  Positioned(
                    bottom: 120,
                    left: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: QuantColors.sunriseRose.withOpacity(0.8),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Your Duet Cam (120Hz)',
                        textAlign: TextAlign.center,
                        style: QuantTypography.bodySmall.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    } else {
      // Horizontal top / bottom split
      return Column(
        children: [
          // Top: Original Video
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                border: const Border(
                  bottom: BorderSide(color: QuantColors.sunriseRose, width: 2),
                ),
                gradient: LinearGradient(
                  colors: widget.reel.gradientColors,
                ),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: Icon(
                      Icons.play_circle_fill_rounded,
                      color: Colors.white.withOpacity(0.35),
                      size: 50,
                    ),
                  ),
                  Positioned(
                    top: 80,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Original: @${widget.reel.creatorHandle}',
                        style: QuantTypography.bodySmall.copyWith(color: Colors.white),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom: User Camera Viewfinder
          Expanded(
            child: Container(
              color: const Color(0xFF13151D),
              child: _buildCameraSimulation(),
            ),
          ),
        ],
      );
    }
  }

  /// Green Screen Mode: Camera foreground over video background
  Widget _buildGreenScreenViewport() {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Background: Original Reel Video
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: widget.reel.gradientColors,
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: Center(
            child: Icon(
              Icons.videocam_rounded,
              size: 72,
              color: Colors.white.withOpacity(0.2),
            ),
          ),
        ),

        // Foreground: User Camera Chroma Key Cutout Simulation
        Positioned(
          bottom: 120,
          left: 40,
          right: 40,
          child: Container(
            height: 340,
            decoration: BoxDecoration(
              // Pure squircle frame with zero clipPath
              borderRadius: BorderRadius.circular(32),
              border: Border.all(
                color: QuantColors.neonGreen.withOpacity(0.6),
                width: 2,
              ),
              color: const Color(0xCC1A1C24),
              boxShadow: [
                BoxShadow(
                  color: QuantColors.neonGreen.withOpacity(0.2),
                  blurRadius: 20,
                ),
              ],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.person_outline_rounded,
                  size: 110,
                  color: QuantColors.sovereignCyan,
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: QuantColors.neonGreen.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: QuantColors.neonGreen),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.auto_awesome_rounded, color: QuantColors.neonGreen, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        'AI Chroma Cutout Active',
                        style: QuantTypography.bodySmall.copyWith(
                          color: QuantColors.neonGreen,
                          fontWeight: FontWeight.w700,
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
    );
  }

  /// PiP Mode: Fullscreen original video with floating reaction inset
  Widget _buildPipViewport() {
    double? top;
    double? bottom;
    double? left;
    double? right;

    switch (_pipPosition) {
      case PipPosition.topRight:
        top = 80;
        right = 16;
        break;
      case PipPosition.topLeft:
        top = 80;
        left = 16;
        break;
      case PipPosition.bottomRight:
        bottom = 140;
        right = 16;
        break;
      case PipPosition.bottomLeft:
        bottom = 140;
        left = 16;
        break;
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        // Fullscreen Original Reel Background
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: widget.reel.gradientColors,
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: Center(
            child: Icon(
              Icons.play_arrow_rounded,
              size: 80,
              color: Colors.white.withOpacity(0.3),
            ),
          ),
        ),

        // Floating Reaction Inset (Circle or Squircle - ZERO clipPath!)
        Positioned(
          top: top,
          bottom: bottom,
          left: left,
          right: right,
          child: GestureDetector(
            onTap: () {
              // Cycle PiP position on tap
              setState(() {
                final values = PipPosition.values;
                final nextIdx = (values.indexOf(_pipPosition) + 1) % values.length;
                _pipPosition = values[nextIdx];
              });
            },
            child: Container(
              width: 130,
              height: 130,
              decoration: BoxDecoration(
                shape: _pipShape == PipShape.circle ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: _pipShape == PipShape.squircle ? BorderRadius.circular(28) : null,
                color: const Color(0xFF1E222A),
                border: Border.all(color: QuantColors.sunriseRose, width: 2.5),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.6),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const Icon(
                    Icons.face_retouching_natural_rounded,
                    color: Colors.white70,
                    size: 48,
                  ),
                  Positioned(
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.7),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'Tap to move',
                        style: QuantTypography.bodySmall.copyWith(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCameraSimulation() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            _isFrontCamera ? Icons.camera_front_rounded : Icons.camera_rear_rounded,
            color: Colors.white54,
            size: 40,
          ),
          const SizedBox(height: 8),
          Text(
            _isFrontCamera ? 'Front Camera Active' : 'Rear Camera Active',
            style: QuantTypography.bodySmall.copyWith(color: Colors.white60),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TOP BAR CONTROLS
  // ===========================================================================
  Widget _buildTopControlBar() {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            // Close Button
            IconButton(
              icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
              onPressed: () => Navigator.of(context).pop(),
            ),

            const SizedBox(width: 8),

            // Mode Selector Pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.65),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _activeMode == RemixMode.duet
                        ? Icons.view_column_rounded
                        : _activeMode == RemixMode.greenScreen
                            ? Icons.layers_rounded
                            : Icons.picture_in_picture_alt_rounded,
                    color: QuantColors.sunriseRose,
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _activeMode == RemixMode.duet
                        ? 'Duet Mode'
                        : _activeMode == RemixMode.greenScreen
                            ? 'Green Screen'
                            : 'Reaction PiP',
                    style: QuantTypography.bodySmall.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),

            const Spacer(),

            // Audio Mixer Toggle Button
            IconButton(
              icon: Icon(
                Icons.tune_rounded,
                color: _showAudioMixer ? QuantColors.moltenAmber : Colors.white,
                size: 24,
              ),
              onPressed: () {
                setState(() {
                  _showAudioMixer = !_showAudioMixer;
                });
              },
            ),

            // Flash Toggle
            IconButton(
              icon: Icon(
                _isFlashOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
                color: _isFlashOn ? QuantColors.sunsetGold : Colors.white,
                size: 24,
              ),
              onPressed: () {
                setState(() {
                  _isFlashOn = !_isFlashOn;
                });
              },
            ),

            // Camera Flip Button
            IconButton(
              icon: const Icon(Icons.flip_camera_ios_rounded, color: Colors.white, size: 24),
              onPressed: () {
                setState(() {
                  _isFrontCamera = !_isFrontCamera;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // RIGHT SIDEBAR TOOL DOCK
  // ===========================================================================
  Widget _buildRightToolDock() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Mode Specific Configuration (Layout or Shape switch)
        if (_activeMode == RemixMode.duet)
          _buildDockIconButton(
            icon: _duetLayout == DuetLayout.verticalSplit
                ? Icons.splitscreen_rounded
                : Icons.table_rows_rounded,
            label: _duetLayout == DuetLayout.verticalSplit ? 'Side' : 'Top',
            onTap: () {
              setState(() {
                _duetLayout = _duetLayout == DuetLayout.verticalSplit
                    ? DuetLayout.horizontalSplit
                    : DuetLayout.verticalSplit;
              });
            },
          )
        else if (_activeMode == RemixMode.pip)
          _buildDockIconButton(
            icon: _pipShape == PipShape.circle
                ? Icons.circle_outlined
                : Icons.crop_square_rounded,
            label: _pipShape == PipShape.circle ? 'Circle' : 'Squircle',
            onTap: () {
              setState(() {
                _pipShape = _pipShape == PipShape.circle
                    ? PipShape.squircle
                    : PipShape.circle;
              });
            },
          ),

        const SizedBox(height: 14),

        // Speed Selector
        _buildDockIconButton(
          icon: Icons.speed_rounded,
          label: '${_playbackSpeed}x',
          onTap: () {
            setState(() {
              if (_playbackSpeed == 0.5) {
                _playbackSpeed = 1.0;
              } else if (_playbackSpeed == 1.0) {
                _playbackSpeed = 2.0;
              } else {
                _playbackSpeed = 0.5;
              }
            });
          },
        ),

        const SizedBox(height: 14),

        // Mic Mute Toggle
        _buildDockIconButton(
          icon: _isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
          label: _isMicMuted ? 'Muted' : 'Mic On',
          iconColor: _isMicMuted ? QuantColors.statusError : Colors.white,
          onTap: () {
            setState(() {
              _isMicMuted = !_isMicMuted;
            });
          },
        ),

        const SizedBox(height: 14),

        // Beauty Filter Toggle
        _buildDockIconButton(
          icon: Icons.auto_fix_high_rounded,
          label: 'Filter',
          iconColor: _isBeautyFilterActive ? QuantColors.sunriseRose : Colors.white,
          onTap: () {
            setState(() {
              _isBeautyFilterActive = !_isBeautyFilterActive;
            });
          },
        ),
      ],
    );
  }

  Widget _buildDockIconButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Color iconColor = Colors.white,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.6),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white24),
            ),
            child: Icon(icon, color: iconColor, size: 22),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: QuantTypography.bodySmall.copyWith(
              color: Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // AUDIO MIXER CARD
  // ===========================================================================
  Widget _buildAudioMixerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.6),
            blurRadius: 14,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Remix Audio Master',
                style: QuantTypography.titleMedium.copyWith(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              IconButton(
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary, size: 20),
                onPressed: () => setState(() => _showAudioMixer = false),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Original Reel Audio Volume Slider
          Row(
            children: [
              const Icon(Icons.music_note_rounded, color: QuantColors.moltenAmber, size: 18),
              const SizedBox(width: 8),
              Text(
                'Original Audio (${(_originalAudioVolume * 100).toInt()}%)',
                style: QuantTypography.bodySmall.copyWith(color: QuantColors.textPrimary),
              ),
            ],
          ),
          Slider(
            value: _originalAudioVolume,
            activeColor: QuantColors.moltenAmber,
            inactiveColor: QuantColors.hairlineBorder,
            onChanged: (val) => setState(() => _originalAudioVolume = val),
          ),

          // User Mic Volume Slider
          Row(
            children: [
              const Icon(Icons.mic_rounded, color: QuantColors.sovereignCyan, size: 18),
              const SizedBox(width: 8),
              Text(
                'Your Voice/Mic (${(_micAudioVolume * 100).toInt()}%)',
                style: QuantTypography.bodySmall.copyWith(color: QuantColors.textPrimary),
              ),
            ],
          ),
          Slider(
            value: _micAudioVolume,
            activeColor: QuantColors.sovereignCyan,
            inactiveColor: QuantColors.hairlineBorder,
            onChanged: (val) => setState(() => _micAudioVolume = val),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // BOTTOM STUDIO BAR (Mode Tabs & Record Shutter)
  // ===========================================================================
  Widget _buildBottomStudioBar() {
    return Container(
      padding: const EdgeInsets.only(bottom: 24, top: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.transparent, Colors.black.withOpacity(0.9)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Mode Selector Bar (Duet, Green Screen, PiP)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildModeTab('Duet', RemixMode.duet),
                const SizedBox(width: 16),
                _buildModeTab('Green Screen', RemixMode.greenScreen),
                const SizedBox(width: 16),
                _buildModeTab('Reaction PiP', RemixMode.pip),
              ],
            ),
            const SizedBox(height: 20),

            // Big Shutter Recording Button with Circular Progress Ring
            GestureDetector(
              onTap: _toggleRecording,
              child: SizedBox(
                width: 82,
                height: 82,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Outer Ring & Animated Progress
                    SizedBox(
                      width: 80,
                      height: 80,
                      child: CircularProgressIndicator(
                        value: _isRecording ? _recordingProgress : 0.0,
                        strokeWidth: 4,
                        color: QuantColors.sunriseRose,
                        backgroundColor: Colors.white30,
                      ),
                    ),

                    // Shutter Core Button
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      width: _isRecording ? 36 : 64,
                      height: _isRecording ? 36 : 64,
                      decoration: BoxDecoration(
                        color: QuantColors.sunriseRose,
                        borderRadius: BorderRadius.circular(_isRecording ? 10 : 32),
                      ),
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

  Widget _buildModeTab(String label, RemixMode mode) {
    final isSelected = _activeMode == mode;

    return GestureDetector(
      onTap: () {
        setState(() {
          _activeMode = mode;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: QuantTypography.bodySmall.copyWith(
            color: isSelected ? Colors.black : Colors.white70,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
