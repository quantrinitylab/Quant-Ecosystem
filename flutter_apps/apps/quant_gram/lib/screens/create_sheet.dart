import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Reel & Video Studio Recording Screen for QuantGram
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class CreateReelStudioScreen extends StatefulWidget {
  const CreateReelStudioScreen({super.key});

  @override
  State<CreateReelStudioScreen> createState() => _CreateReelStudioScreenState();
}

class _CreateReelStudioScreenState extends State<CreateReelStudioScreen> with SingleTickerProviderStateMixin {
  bool _isRecording = false;
  bool _isFlashOn = false;
  bool _isFrontCamera = false;
  String _selectedSpeed = '1x';
  int _selectedTimer = 0; // 0, 3, 10 seconds
  String _selectedMode = 'Reel'; // Post, Story, Reel, Live
  late AnimationController _pulseController;

  final List<String> _modes = ['Post', 'Story', 'Reel', 'Live'];

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _toggleRecording() {
    setState(() {
      _isRecording = !_isRecording;
    });

    if (!_isRecording) {
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
              const Icon(Icons.check_circle_outline_rounded, color: QuantColors.statusSuccess, size: 20),
              const SizedBox(width: 10),
              Text(
                'Reel recorded successfully (1080x1920 120fps)',
                style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
              ),
            ],
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Viewfinder Camera Simulation
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: const RadialGradient(
                  center: Alignment.center,
                  radius: 0.8,
                  colors: [
                    Color(0xFF1E293B),
                    Color(0xFF090A0E),
                  ],
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _isFrontCamera ? Icons.camera_front_rounded : Icons.camera_rear_rounded,
                      size: 64,
                      color: Colors.white24,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _isRecording ? 'RECORDING 120 FPS...' : 'Impeller Camera Viewfinder Active',
                      style: QuantTypography.bodyMedium.copyWith(
                        color: _isRecording ? QuantColors.crimsonRed : Colors.white60,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Top Studio Toolbar (Close, Add Music, Flash, Flip)
            Positioned(
              top: 12,
              left: 16,
              right: 16,
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white, size: 26),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),

                  // Add Sound Audio Chip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.music_note_rounded, color: Colors.white, size: 16),
                        const SizedBox(width: 6),
                        Text(
                          'Add Sound',
                          style: QuantTypography.bodySmall.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),

                  // Flash Toggle
                  IconButton(
                    icon: Icon(
                      _isFlashOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
                      color: _isFlashOn ? QuantColors.sunsetGold : Colors.white,
                      size: 22,
                    ),
                    onPressed: () => setState(() => _isFlashOn = !_isFlashOn),
                  ),

                  // Camera Flip
                  IconButton(
                    icon: const Icon(Icons.flip_camera_ios_rounded, color: Colors.white, size: 22),
                    onPressed: () => setState(() => _isFrontCamera = !_isFrontCamera),
                  ),
                ],
              ),
            ),

            // Left Side Tool Strip (Speed, Timer, Effects)
            Positioned(
              left: 16,
              top: 100,
              child: Column(
                children: [
                  // Speed Selector
                  _buildSideToolButton(
                    icon: Icons.speed_rounded,
                    label: _selectedSpeed,
                    onTap: () {
                      setState(() {
                        if (_selectedSpeed == '1x') {
                          _selectedSpeed = '2x';
                        } else if (_selectedSpeed == '2x') {
                          _selectedSpeed = '0.5x';
                        } else {
                          _selectedSpeed = '1x';
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 16),

                  // Timer Selector
                  _buildSideToolButton(
                    icon: Icons.timer_outlined,
                    label: _selectedTimer == 0 ? 'Off' : '${_selectedTimer}s',
                    onTap: () {
                      setState(() {
                        if (_selectedTimer == 0) {
                          _selectedTimer = 3;
                        } else if (_selectedTimer == 3) {
                          _selectedTimer = 10;
                        } else {
                          _selectedTimer = 0;
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 16),

                  // Effects
                  _buildSideToolButton(
                    icon: Icons.auto_awesome_rounded,
                    label: 'Filters',
                    onTap: () {},
                  ),
                ],
              ),
            ),

            // Bottom Shutter & Mode Selector Strip
            Positioned(
              left: 0,
              right: 0,
              bottom: 20,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Shutter Button Row
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Gallery Picker
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white, width: 2),
                            image: const DecorationImage(
                              image: NetworkImage('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),

                        // Master Record Shutter Button
                        GestureDetector(
                          onTap: _toggleRecording,
                          child: AnimatedBuilder(
                            animation: _pulseController,
                            builder: (context, child) {
                              return Container(
                                width: 80,
                                height: 80,
                                padding: const EdgeInsets.all(4),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: _isRecording
                                        ? QuantColors.crimsonRed
                                        : QuantColors.sunriseRose.withOpacity(0.8 + 0.2 * _pulseController.value),
                                    width: 4,
                                  ),
                                ),
                                child: Container(
                                  decoration: BoxDecoration(
                                    shape: _isRecording ? BoxShape.rectangle : BoxShape.circle,
                                    borderRadius: _isRecording ? BorderRadius.circular(8) : null,
                                    color: _isRecording ? QuantColors.crimsonRed : QuantColors.sunriseRose,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),

                        // Switch Camera
                        GestureDetector(
                          onTap: () => setState(() => _isFrontCamera = !_isFrontCamera),
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withOpacity(0.2),
                            ),
                            child: const Icon(Icons.cached_rounded, color: Colors.white, size: 24),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Mode Carousel (Post, Story, Reel, Live)
                  SizedBox(
                    height: 32,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      shrinkWrap: true,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: _modes.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 20),
                      itemBuilder: (context, index) {
                        final mode = _modes[index];
                        final isSelected = mode == _selectedMode;
                        return GestureDetector(
                          onTap: () => setState(() => _selectedMode = mode),
                          child: Text(
                            mode.toUpperCase(),
                            style: QuantTypography.bodySmall.copyWith(
                              color: isSelected ? Colors.white : Colors.white54,
                              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                              letterSpacing: 1.2,
                              fontSize: 12,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSideToolButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.black54,
              border: Border.all(color: Colors.white24),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: QuantTypography.bodySmall.copyWith(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
