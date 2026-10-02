// Sovereign Quant Ecosystem - QuantAI 3D Voice Orb Screen
// Interactive 3D Voice Orb with pulsing concentric glowing rings,
// live speech-to-text transcript ticker, persona chips (Aura, Vesper, Zenith, Zephyr),
// and low-latency voice telemetry (<120ms VAD).
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';

class VoiceOrbScreen extends StatefulWidget {
  const VoiceOrbScreen({super.key});

  @override
  State<VoiceOrbScreen> createState() => _VoiceOrbScreenState();
}

class _VoiceOrbScreenState extends State<VoiceOrbScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late VoicePersona _selectedPersona;
  bool _isMicMuted = false;
  bool _isSpeaking = true;
  int _transcriptStep = 0;

  final List<Map<String, String>> _transcriptHistory = [
    {
      'speaker': 'User',
      'text': 'QuantAI, analyze the latency overhead of WebRTC audio packetization.',
    },
    {
      'speaker': 'Aura',
      'text': 'Under 16kHz Opus with 20ms frames, packetization jitter buffers maintain sub-24ms end-to-end latency.',
    },
    {
      'speaker': 'User',
      'text': 'Confirm voice activity detection responsiveness on edge mobile NPU.',
    },
    {
      'speaker': 'Aura',
      'text': 'Silero VAD ONNX model executes in 4.2ms per 30ms audio chunk. Full turn-detection latency is strictly under 118ms.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _selectedPersona = VoicePersona.aura;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);

    _pulseAnimation = CurvedAnimation(
      parent: _pulseController,
      curve: Curves.easeInOutSine,
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _switchPersona(VoicePersona persona) {
    setState(() {
      _selectedPersona = persona;
      // Adjust pulse duration based on persona tempo
      _pulseController.duration = Duration(
        milliseconds: (2400 / persona.pulseSpeed).round(),
      );
      if (_pulseController.isAnimating) {
        _pulseController.repeat(reverse: true);
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
            // Top Telemetry Header
            _buildVoiceTelemetryBar(),

            // Persona Selector Chips
            _buildPersonaSelector(),

            // Interactive 3D Voice Orb Centerpiece
            Expanded(
              child: Center(
                child: AnimatedBuilder(
                  animation: _pulseAnimation,
                  builder: (context, child) {
                    return _buildConcentricVoiceOrb(glowColor);
                  },
                ),
              ),
            ),

            // Live Speech-to-Text Transcript Ticker
            _buildTranscriptTicker(),

            // Audio Waveform Visualization & Control Dock
            _buildControlDock(glowColor),
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceTelemetryBar() {
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
                  color: _isSpeaking
                      ? QuantColors.emeraldMatrix
                      : QuantColors.textMuted,
                  shape: BoxShape.circle,
                  boxShadow: _isSpeaking
                      ? [
                          BoxShadow(
                            color: QuantColors.emeraldMatrix.withOpacity(0.8),
                            blurRadius: 6,
                            spreadRadius: 2,
                          ),
                        ]
                      : null,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _isSpeaking ? 'VOICE LINK ACTIVE' : 'LISTENING (VAD STANDBY)',
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
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.speed_rounded,
                  size: 13,
                  color: QuantColors.cosmicCyan,
                ),
                SizedBox(width: 4),
                Text(
                  '<120ms VAD | WebRTC Opus 16kHz',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.cosmicCyan,
                    fontFamily: 'monospace',
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

  Widget _buildConcentricVoiceOrb(Color glowColor) {
    final pulse = _pulseAnimation.value; // 0.0 to 1.0

    // Concentric scale dimensions (Strictly zero clipPath)
    final outerRingSize = 250.0 + (pulse * 30.0);
    final middleRingSize = 190.0 + (pulse * 20.0);
    final innerSphereSize = 140.0 + (pulse * 10.0);

    return SizedBox(
      width: 320,
      height: 320,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // 1. Outermost Ambient Atmospheric Glow Halo
          Container(
            width: outerRingSize,
            height: outerRingSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.12 * (1.0 - pulse * 0.4)),
                  blurRadius: 60 + (pulse * 20),
                  spreadRadius: 20 + (pulse * 10),
                ),
              ],
            ),
          ),

          // 2. Outer Concentric Resonant Ring
          Container(
            width: outerRingSize,
            height: outerRingSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: glowColor.withOpacity(0.25 * (1.0 - pulse * 0.3)),
                width: 1.5,
              ),
            ),
          ),

          // 3. Middle Harmonic Ring with Radial Glow
          Container(
            width: middleRingSize,
            height: middleRingSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: glowColor.withOpacity(0.5 + (pulse * 0.3)),
                width: 2,
              ),
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.25 * (0.8 + pulse * 0.2)),
                  blurRadius: 30,
                  spreadRadius: 5,
                ),
              ],
            ),
          ),

          // 4. Core 3D Volumetric Sphere with Dynamic Lighting Shading
          Container(
            width: innerSphereSize,
            height: innerSphereSize,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.35, -0.35), // 3D specular highlight
                radius: 0.85,
                colors: [
                  Colors.white.withOpacity(0.85),
                  glowColor,
                  glowColor.withOpacity(0.8),
                  const Color(0xFF090A0E),
                ],
                stops: const [0.0, 0.35, 0.7, 1.0],
              ),
              boxShadow: [
                BoxShadow(
                  color: glowColor.withOpacity(0.6),
                  blurRadius: 40 + (pulse * 15),
                  spreadRadius: 6,
                ),
                BoxShadow(
                  color: Colors.black.withOpacity(0.8),
                  blurRadius: 20,
                  offset: const Offset(10, 15),
                ),
              ],
            ),
            child: Center(
              child: Icon(
                Icons.graphic_eq_rounded,
                size: 36,
                color: Colors.white.withOpacity(0.9),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTranscriptTicker() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.subtitles_rounded,
                    size: 14,
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
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  _selectedPersona.name,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: _selectedPersona.glowColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 90),
            child: SingleChildScrollView(
              reverse: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _transcriptHistory.map((item) {
                  final isUser = item['speaker'] == 'User';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: RichText(
                      text: TextSpan(
                        children: [
                          TextSpan(
                            text: '${item['speaker']}: ',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isUser
                                  ? QuantColors.textSecondary
                                  : _selectedPersona.glowColor,
                            ),
                          ),
                          TextSpan(
                            text: item['text']!,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlDock(Color glowColor) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Visualizer Frequency Waveform Bars (7 bars)
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(7, (index) {
              final heights = [16.0, 26.0, 36.0, 48.0, 34.0, 22.0, 14.0];
              final pulse = _pulseAnimation.value;
              final animatedHeight = heights[index] *
                  (_isSpeaking ? (0.6 + pulse * 0.5) : 0.2);

              return AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 4,
                height: math.max(6.0, animatedHeight),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: _isSpeaking
                      ? glowColor
                      : QuantColors.hairlineBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              );
            }),
          ),
          const SizedBox(height: 14),

          // Control buttons: Mute, Interrupt, End Call
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Mute / Unmute Mic
              IconButton.filledTonal(
                iconSize: 24,
                style: IconButton.styleFrom(
                  backgroundColor: _isMicMuted
                      ? QuantColors.statusError.withOpacity(0.2)
                      : QuantColors.elevatedCard,
                  foregroundColor: _isMicMuted
                      ? QuantColors.statusError
                      : QuantColors.textPrimary,
                  padding: const EdgeInsets.all(14),
                ),
                icon: Icon(
                  _isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                ),
                onPressed: () {
                  setState(() {
                    _isMicMuted = !_isMicMuted;
                  });
                },
              ),

              // Tap to Interrupt button
              InkWell(
                borderRadius: BorderRadius.circular(28),
                onTap: () {
                  setState(() {
                    _isSpeaking = !_isSpeaking;
                  });
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        _isSpeaking
                            ? 'AI Voice resumed.'
                            : 'AI speech interrupted. Microphone listening.',
                        style: const TextStyle(color: QuantColors.textPrimary),
                      ),
                      duration: const Duration(seconds: 1),
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: glowColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: glowColor, width: 1.5),
                    boxShadow: [
                      BoxShadow(
                        color: glowColor.withOpacity(0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _isSpeaking
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _isSpeaking ? 'Tap to Interrupt' : 'Resume Speech',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // End Conversation
              IconButton.filled(
                iconSize: 24,
                style: IconButton.styleFrom(
                  backgroundColor: QuantColors.statusError,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(14),
                ),
                icon: const Icon(Icons.call_end_rounded),
                onPressed: () {
                  Navigator.of(context).maybePop();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
