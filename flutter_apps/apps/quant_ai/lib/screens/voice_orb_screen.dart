// Sovereign Quant Ecosystem - QuantAI 3D Voice Orb Screen
// Impeller-accelerated pulsing molten sphere (<120ms VAD response simulation)
// with Aura/Vesper/Zenith/Zephyr voice personas, real-time transcript ticker, and voice telemetry.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';

enum VadState {
  listening,
  detected,
  thinking,
  speaking,
}

class VoiceOrbScreen extends StatefulWidget {
  const VoiceOrbScreen({super.key});

  @override
  State<VoiceOrbScreen> createState() => _VoiceOrbScreenState();
}

class _VoiceOrbScreenState extends State<VoiceOrbScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late AnimationController _rotationController;
  late Animation<double> _pulseAnimation;
  late VoicePersona _selectedPersona;

  VadState _vadState = VadState.speaking;
  int _simulatedVadLatencyMs = 94;
  bool _isMicMuted = false;
  int _activeAudioRoute = 0; // 0: Speaker, 1: Bluetooth, 2: Earpiece

  final List<Map<String, String>> _transcriptHistory = [
    {
      'speaker': 'User',
      'text': 'QuantAI, analyze the latency overhead of WebRTC audio packetization.',
      'latency': 'Client Input',
    },
    {
      'speaker': 'Aura',
      'text': 'Under 16kHz Opus with 20ms frames, jitter buffers maintain sub-24ms end-to-end latency.',
      'latency': '88ms VAD Turn',
    },
    {
      'speaker': 'User',
      'text': 'Confirm voice activity detection responsiveness on edge mobile NPU.',
      'latency': 'Client Input',
    },
    {
      'speaker': 'Aura',
      'text': 'Silero VAD ONNX model executes in 4.2ms per 30ms audio chunk. Full turn-detection latency is strictly under 118ms.',
      'latency': '94ms VAD Turn',
    },
  ];

  @override
  void initState() {
    super.initState();
    _selectedPersona = VoicePersona.aura;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);

    _rotationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 16),
    )..repeat();

    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOutSine,
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _rotationController.dispose();
    super.dispose();
  }

  void _switchPersona(VoicePersona persona) {
    setState(() {
      _selectedPersona = persona;
      _pulseController.duration = Duration(
        milliseconds: (2200 / persona.pulseSpeed).round(),
      );
      if (_pulseController.isAnimating) {
        _pulseController.repeat(reverse: true);
      }
    });
  }

  void _cycleVadState() {
    setState(() {
      switch (_vadState) {
        case VadState.speaking:
          _vadState = VadState.listening;
          _simulatedVadLatencyMs = 14;
          break;
        case VadState.listening:
          _vadState = VadState.detected;
          _simulatedVadLatencyMs = 18;
          break;
        case VadState.detected:
          _vadState = VadState.thinking;
          _simulatedVadLatencyMs = 82;
          break;
        case VadState.thinking:
          _vadState = VadState.speaking;
          _simulatedVadLatencyMs = 94;
          break;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final glowColor = _selectedPersona.glowColor;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Voice Link & VAD Telemetry Bar
            _buildVoiceTelemetryBar(),

            // Persona Selector Chips (Aura, Vesper, Zenith, Zephyr)
            _buildPersonaSelector(),

            // Centerpiece: Impeller-Accelerated Pulsing Molten Sphere
            Expanded(
              child: Center(
                child: GestureDetector(
                  onTap: _cycleVadState,
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_pulseAnimation, _rotationController]),
                    builder: (context, child) {
                      return _buildMoltenVoiceOrbCenterpiece(glowColor);
                    },
                  ),
                ),
              ),
            ),

            // Live Speech-to-Text Transcript Ticker
            _buildTranscriptTicker(),

            // Interactive Audio Controls & Equalizer Dock
            _buildControlDock(glowColor),
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceTelemetryBar() {
    final isSpeaking = _vadState == VadState.speaking;
    final isThinking = _vadState == VadState.thinking;

    final statusColor = isSpeaking
        ? QuantColors.emeraldMatrix
        : isThinking
            ? QuantColors.sunsetGold
            : QuantColors.cosmicCyan;

    final statusLabel = isSpeaking
        ? 'VOICE LINK ACTIVE'
        : isThinking
            ? 'SYNTHESIZING RESPONSE'
            : _vadState == VadState.detected
                ? 'VOICE DETECTED (<18MS)'
                : 'LISTENING (VAD STANDBY)';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: statusColor.withOpacity(0.8),
                      blurRadius: 6,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                statusLabel,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: QuantColors.textSecondary,
                ),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.speed_rounded,
                  size: 13,
                  color: QuantColors.cosmicCyan,
                ),
                const SizedBox(width: 4),
                Text(
                  '<120ms VAD | WebRTC Opus 16kHz',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.cosmicCyan,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${_simulatedVadLatencyMs}ms',
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: QuantColors.emeraldMatrix,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPersonaSelector() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: VoicePersona.allPersonas.map((persona) {
            final isSelected = persona.id == _selectedPersona.id;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => _switchPersona(persona),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? persona.glowColor.withOpacity(0.18)
                        : QuantColors.darkSlateCard,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected
                          ? persona.glowColor
                          : QuantColors.hairlineBorder,
                      width: isSelected ? 1.5 : 1,
                    ),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: persona.glowColor.withOpacity(0.25),
                              blurRadius: 10,
                              offset: const Offset(0, 2),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          color: persona.glowColor.withOpacity(0.3),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            persona.avatarInitials,
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              color: persona.glowColor,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            persona.name,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: isSelected
                                  ? QuantColors.textPrimary
                                  : QuantColors.textSecondary,
                            ),
                          ),
                          Text(
                            persona.tagline,
                            style: TextStyle(
                              fontSize: 9,
                              color: isSelected
                                  ? persona.glowColor
                                  : QuantColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  /// Impeller-Accelerated Pulsing Molten Sphere Centerpiece (Strictly zero clipPath)
  Widget _buildMoltenVoiceOrbCenterpiece(Color glowColor) {
    final pulse = _pulseAnimation.value;
    final rotation = _rotationController.value * 2 * math.pi;

    // Dimensions for concentric molten rings
    final outerRingSize = 270.0 + (pulse * 32.0);
    final middleRingSize = 200.0 + (pulse * 22.0);
    final innerSphereSize = 145.0 + (pulse * 12.0);

    return SizedBox(
      width: 340,
      height: 340,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 1. Ambient Atmospheric Molten Plasma Halo
          Container(
            width: outerRingSize,
            height: outerRingSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.18 * (1.0 - pulse * 0.3)),
                  blurRadius: 65 + (pulse * 25),
                  spreadRadius: 22 + (pulse * 12),
                ),
              ],
            ),
          ),

          // 2. Custom Painter: Impeller Molten Plasma Energy Ripples (Zero clipPath)
          CustomPaint(
            size: Size(outerRingSize, outerRingSize),
            painter: _MoltenPlasmaPainter(
              pulse: pulse,
              rotation: rotation,
              color: glowColor,
            ),
          ),

          // 3. Middle Harmonic Ring with Radial Glow
          Container(
            width: middleRingSize,
            height: middleRingSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: glowColor.withOpacity(0.45 + (pulse * 0.35)),
                width: 2,
              ),
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.25 * (0.8 + pulse * 0.2)),
                  blurRadius: 32,
                  spreadRadius: 6,
                ),
              ],
            ),
          ),

          // 4. Core 3D Volumetric Molten Sphere with Incandescent Core Shading
          Container(
            width: innerSphereSize,
            height: innerSphereSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.32, -0.32), // 3D specular highlight
                radius: 0.88,
                colors: [
                  Colors.white.withOpacity(0.95), // Specular light hit
                  const Color(0xFFFFF7ED), // Incandescent white-hot glow
                  glowColor, // Persona plasma hue
                  glowColor.withOpacity(0.75),
                  const Color(0xFF090A0E), // Void ambient shadow
                ],
                stops: const [0.0, 0.22, 0.52, 0.82, 1.0],
              ),
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.65),
                  blurRadius: 44 + (pulse * 18),
                  spreadRadius: 7,
                ),
                BoxShadow(
                  color: Colors.black.withOpacity(0.85),
                  blurRadius: 24,
                  offset: const Offset(12, 16),
                ),
              ],
            ),
            child: Center(
              child: Icon(
                _vadState == VadState.speaking
                    ? Icons.graphic_eq_rounded
                    : _vadState == VadState.thinking
                        ? Icons.psychology_rounded
                        : Icons.mic_rounded,
                size: 38,
                color: Colors.white.withOpacity(0.92),
              ),
            ),
          ),

          // 5. Orbiting Plasma Satellites
          ...List.generate(3, (index) {
            final angle = rotation + (index * (2 * math.pi / 3));
            final radius = (middleRingSize / 2) + (math.sin(angle * 2) * 8);
            final x = radius * math.cos(angle);
            final y = radius * math.sin(angle);

            return Transform.translate(
              offset: Offset(x, y),
              child: Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: glowColor,
                      blurRadius: 8,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildTranscriptTicker() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.subtitles_rounded,
                    size: 13,
                    color: QuantColors.cosmicCyan,
                  ),
                  SizedBox(width: 6),
                  Text(
                    'REAL-TIME TRANSCRIPT TICKER',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'VAD Response <120ms',
                  style: const TextStyle(
                    fontSize: 9,
                    fontFamily: 'monospace',
                    color: QuantColors.emeraldMatrix,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            constraints: const BoxConstraints(maxHeight: 110),
            child: ListView.separated(
              shrinkWrap: true,
              itemCount: _transcriptHistory.length,
              separatorBuilder: (_, __) => const SizedBox(height: 6),
              itemBuilder: (context, index) {
                final entry = _transcriptHistory[index];
                final isUser = entry['speaker'] == 'User';

                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: isUser
                            ? QuantColors.elevatedCard
                            : _selectedPersona.glowColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        entry['speaker']!,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: isUser
                              ? QuantColors.textSecondary
                              : _selectedPersona.glowColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        entry['text']!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: QuantColors.textPrimary,
                          height: 1.35,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      entry['latency']!,
                      style: const TextStyle(
                        fontSize: 9,
                        fontFamily: 'monospace',
                        color: QuantColors.textMuted,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlDock(Color glowColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Audio Waveform Equalizer (24 bars)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(24, (index) {
                final height = (_vadState == VadState.speaking)
                    ? 6.0 + (math.sin((index * 0.4) + _pulseAnimation.value * math.pi) * 14.0).abs()
                    : 3.0;

                return Container(
                  width: 3,
                  height: height,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: glowColor.withOpacity(0.6 + (index % 3) * 0.15),
                    borderRadius: BorderRadius.circular(2),
                  ),
                );
              }),
            ),
          ),

          // Action Buttons
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Mute Button
              IconButton(
                style: IconButton.styleFrom(
                  backgroundColor: _isMicMuted
                      ? QuantColors.statusError.withOpacity(0.2)
                      : QuantColors.darkSlateCard,
                  padding: const EdgeInsets.all(12),
                ),
                icon: Icon(
                  _isMicMuted
                      ? Icons.mic_off_rounded
                      : Icons.mic_rounded,
                  color: _isMicMuted
                      ? QuantColors.statusError
                      : QuantColors.textPrimary,
                  size: 20,
                ),
                onPressed: () {
                  setState(() {
                    _isMicMuted = !_isMicMuted;
                  });
                },
              ),

              // Tap to Interrupt / Cycle VAD Button
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: glowColor,
                  foregroundColor: Colors.black,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                icon: const Icon(Icons.touch_app_rounded, size: 16),
                label: const Text(
                  'Tap to Interrupt',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                onPressed: _cycleVadState,
              ),

              // End Call Button
              IconButton(
                style: IconButton.styleFrom(
                  backgroundColor: QuantColors.statusError.withOpacity(0.2),
                  padding: const EdgeInsets.all(12),
                ),
                icon: const Icon(
                  Icons.call_end_rounded,
                  color: QuantColors.statusError,
                  size: 20,
                ),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Voice session closed. Telemetry saved to session ledger.',
                        style: TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Impeller-Accelerated Molten Plasma Energy Rings Painter
/// Strictly ZERO Skia clipPath method invocations!
class _MoltenPlasmaPainter extends CustomPainter {
  final double pulse;
  final double rotation;
  final Color color;

  _MoltenPlasmaPainter({
    required this.pulse,
    required this.rotation,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final baseRadius = (size.width / 2) * 0.88;

    final ringPaint = Paint()
      ..color = color.withOpacity(0.22 * (1.0 - pulse * 0.2))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8;

    // Draw concentric harmonic circles without any clipPath
    canvas.drawCircle(center, baseRadius, ringPaint);
    canvas.drawCircle(center, baseRadius * 0.72 + (pulse * 4), ringPaint..strokeWidth = 1.2);
  }

  @override
  bool shouldRepaint(covariant _MoltenPlasmaPainter oldDelegate) {
    return oldDelegate.pulse != pulse ||
        oldDelegate.rotation != rotation ||
        oldDelegate.color != color;
  }
}
