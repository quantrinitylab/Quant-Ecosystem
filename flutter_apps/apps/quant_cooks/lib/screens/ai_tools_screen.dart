import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../data/cooks_repository.dart';
import '../models/cooks_models.dart';

/// AI Video & Audio Creation Tools Screen.
///
/// Features:
/// 1. Kinetic Captions Generator with word-level speech-to-text sync & typography presets (Pop-Up, Neon Glow, Typewriter)
/// 2. Auto Silence Remover (Voice Activity Detection & dead space cutting)
/// 3. Text-to-Video Synthesis (Sora & Gen-3 diffusion prompt runner)
/// 4. Background Remover / Magic Green Screen (Neural rotoscoping & alpha matte)
/// 5. Voice Enhancer / Studio Noise Cleaner (Sub-10ms denoiser & de-reverb)
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller acceleration).
class AiToolsScreen extends StatefulWidget {
  final Function(String toolTitle)? onApplyToolResult;

  const AiToolsScreen({super.key, this.onApplyToolResult});

  @override
  State<AiToolsScreen> createState() => _AiToolsScreenState();
}

class _AiToolsScreenState extends State<AiToolsScreen> {
  int _selectedToolIndex = 1; // Default to Kinetic Captions
  final TextEditingController _promptController = TextEditingController(
    text:
        'Cinematic hyperlapse of neon cyberpunk metropolis with flying taxis and rain reflections 4K 60fps',
  );

  bool _isGenerating = false;
  double _generationProgress = 0.0;
  String _activeToolStatus = 'Idle';

  // Kinetic Caption Animated Typography Presets
  int _selectedCaptionPresetIndex = 0;
  final List<KineticCaptionPreset> _typographyPresets = const [
    KineticCaptionPreset.popUp,
    KineticCaptionPreset.neonGlow,
    KineticCaptionPreset.typewriter,
  ];

  // Sample word-level sync tokens for kinetic captions visualizer
  final List<KineticWordSync> _sampleSyncedWords = const [
    KineticWordSync(word: 'TRANSFORM', startMs: 0, endMs: 800),
    KineticWordSync(word: 'YOUR', startMs: 800, endMs: 1400),
    KineticWordSync(word: 'WORKFLOW', startMs: 1400, endMs: 2400),
    KineticWordSync(word: 'WITH', startMs: 2400, endMs: 2900),
    KineticWordSync(word: '120HZ', startMs: 2900, endMs: 3800),
    KineticWordSync(word: 'IMPELLER', startMs: 3800, endMs: 5000),
  ];
  int _activeWordIndex = 2;

  // Auto Silence Remover Settings
  double _silenceThresholdDb = -32.0;
  double _minSilenceDurationMs = 350.0;
  double _paddingBufferMs = 45.0;
  int _detectedSilencesCount = 14;
  double _savedDurationSeconds = 4.2;

  // Background Remover Settings
  double _featherEdge = 1.8;
  int _selectedBackdrop = 0;
  final List<String> _backdrops = const [
    'Transparent Alpha',
    'Obsidian Dark Void',
    'Studio Clean Slate',
    'Tokyo Night Neon',
  ];

  // Voice Enhancer Settings
  double _denoiseStrength = 85.0;
  bool _deReverbActive = true;
  bool _vocalPresenceBoost = true;

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  void _runAiGeneration(String toolName) async {
    setState(() {
      _isGenerating = true;
      _generationProgress = 0.0;
      _activeToolStatus = 'Initializing Neural Tensor Pipeline...';
    });

    for (int i = 1; i <= 10; i++) {
      await Future.delayed(const Duration(milliseconds: 140));
      if (!mounted) return;
      setState(() {
        _generationProgress = i / 10.0;
        if (i < 4) {
          _activeToolStatus = 'Allocating MediaCodec Tensor Cores...';
        } else if (i < 8) {
          _activeToolStatus =
              'Synthesizing 60fps Frames & Word-Level Tokens...';
        } else {
          _activeToolStatus = 'Finalizing Multi-Track Studio Insertion...';
        }
      });
    }

    if (!mounted) return;
    setState(() {
      _isGenerating = false;
      _activeToolStatus = 'Generation Complete (120Hz Verified)';
    });

    widget.onApplyToolResult?.call(toolName);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          '$toolName generated successfully and synchronized with timeline.',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final aiTools = CooksRepository.getAiTools();
    final activeTool = aiTools[_selectedToolIndex.clamp(0, aiTools.length - 1)];

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Header: Title & Neural Status Pill
            _buildTopHeader(),

            // Horizontal AI Tools Selector Bar
            _buildToolSelectorChips(aiTools),

            // Active Tool Interactive Configuration & Preview Panel
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Active Tool Hero Banner
                    _buildToolHeroCard(activeTool),

                    const SizedBox(height: 20),

                    // Specific Tool Interactive Controls
                    if (activeTool.type == AiToolType.autoCaptions)
                      _buildKineticCaptionsGeneratorControls()
                    else if (activeTool.type == AiToolType.autoSilenceRemover)
                      _buildAutoSilenceRemoverControls()
                    else if (activeTool.type == AiToolType.textToVideo)
                      _buildTextToVideoControls()
                    else if (activeTool.type == AiToolType.backgroundRemover)
                      _buildBackgroundRemoverControls()
                    else if (activeTool.type == AiToolType.voiceEnhancer)
                      _buildVoiceEnhancerControls()
                    else
                      _buildGenericToolControls(activeTool),

                    const SizedBox(height: 24),

                    // Generation Action Button & Progress
                    _buildActionPanel(activeTool),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [
                      QuantColors.obsidianPurple,
                      QuantColors.sovereignCyan
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Colors.white,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'AI Studio Engine',
                    style: QuantTypography.titleMedium.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Sora, Whisper V3 & Kinetic Typography',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Neural Core Status Capsule
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(
                    color: QuantColors.statusSuccess,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  '120HZ ONLINE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: QuantColors.statusSuccess,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToolSelectorChips(List<AiToolItem> tools) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateSurface,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: tools.length,
        itemBuilder: (context, index) {
          final tool = tools[index];
          final isSelected = _selectedToolIndex == index;

          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: InkWell(
              onTap: () {
                setState(() {
                  _selectedToolIndex = index;
                });
              },
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isSelected
                      ? tool.accentColor.withOpacity(0.18)
                      : QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected
                        ? tool.accentColor
                        : QuantColors.hairlineBorder,
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      tool.icon,
                      size: 15,
                      color: isSelected ? tool.accentColor : QuantColors.textMuted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      tool.title,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight:
                            isSelected ? FontWeight.w700 : FontWeight.w500,
                        color:
                            isSelected ? Colors.white : QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildToolHeroCard(AiToolItem tool) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: tool.accentColor.withOpacity(0.2),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: tool.accentColor.withOpacity(0.4)),
            ),
            child: Icon(tool.icon, color: tool.accentColor, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        tool.title,
                        style: QuantTypography.titleMedium.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: tool.accentColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(6),
                        border:
                            Border.all(color: tool.accentColor.withOpacity(0.3)),
                      ),
                      child: Text(
                        tool.badgeText,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: tool.accentColor,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  tool.subtitle,
                  style: QuantTypography.bodySmall.copyWith(
                    color: tool.accentColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tool.description,
                  style: QuantTypography.bodySmall.copyWith(
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Kinetic Captions Generator Controls with Animated Typography Presets (Pop-Up, Neon Glow, Typewriter)
  /// and Word-Level Speech-to-Text Sync.
  Widget _buildKineticCaptionsGeneratorControls() {
    final activePreset = _typographyPresets[_selectedCaptionPresetIndex];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ANIMATED TYPOGRAPHY PRESETS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: _typographyPresets.asMap().entries.map((entry) {
            final idx = entry.key;
            final preset = entry.value;
            final isSelected = _selectedCaptionPresetIndex == idx;

            return Expanded(
              child: Container(
                margin: const EdgeInsets.only(right: 6),
                child: InkWell(
                  onTap: () =>
                      setState(() => _selectedCaptionPresetIndex = idx),
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? QuantColors.moltenAmber.withOpacity(0.18)
                          : QuantColors.darkSlateCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: isSelected
                            ? QuantColors.moltenAmber
                            : QuantColors.hairlineBorder,
                        width: 1.2,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Icon(
                              preset.icon,
                              size: 16,
                              color: isSelected
                                  ? QuantColors.moltenAmber
                                  : QuantColors.textMuted,
                            ),
                            if (isSelected)
                              const Icon(
                                Icons.check_circle_rounded,
                                size: 12,
                                color: QuantColors.moltenAmber,
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          preset.label,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: isSelected
                                ? FontWeight.w800
                                : FontWeight.w600,
                            color: isSelected
                                ? Colors.white
                                : QuantColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          preset.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 8,
                            color: QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),

        const SizedBox(height: 18),

        // Live Animated Kinetic Typography Preview Card
        const Text(
          'WORD-LEVEL SPEECH-TO-TEXT SYNC PREVIEW',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 110,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.moltenAmber.withOpacity(0.4)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Animated preview word with active style
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                child: Text(
                  _sampleSyncedWords[_activeWordIndex].word,
                  key: ValueKey<int>(_activeWordIndex),
                  style: activePreset == KineticCaptionPreset.neonGlow
                      ? const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                          color: QuantColors.sovereignCyan,
                          shadows: [
                            Shadow(
                              color: QuantColors.sovereignCyan,
                              blurRadius: 18,
                            ),
                          ],
                        )
                      : (activePreset == KineticCaptionPreset.popUp
                          ? const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                              color: QuantColors.moltenAmber,
                            )
                          : const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 2.0,
                              color: Colors.white,
                            )),
                ),
              ),
              const SizedBox(height: 10),
              // Word timestamps sequence strip
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _sampleSyncedWords.asMap().entries.map((entry) {
                    final idx = entry.key;
                    final w = entry.value;
                    final isWordActive = _activeWordIndex == idx;

                    return GestureDetector(
                      onTap: () => setState(() => _activeWordIndex = idx),
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: isWordActive
                              ? QuantColors.moltenAmber
                              : QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${w.word} (${(w.startMs / 1000).toStringAsFixed(1)}s)',
                          style: TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: isWordActive
                                ? QuantColors.voidObsidian
                                : QuantColors.textMuted,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        // Whisper V3 Telemetry Info
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: const Row(
            children: [
              Icon(Icons.mic_none_rounded,
                  color: QuantColors.statusSuccess, size: 18),
              SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Whisper V3 Word-Level Sync Active',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    Text(
                      'Sub-5ms phoneme alignment across 52 sovereign languages',
                      style: TextStyle(
                          fontSize: 10, color: QuantColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Auto Silence Remover Controls (Voice Activity Detection & Pause Trimming)
  Widget _buildAutoSilenceRemoverControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Silence Threshold Slider
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'SILENCE DECIBEL THRESHOLD',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              '${_silenceThresholdDb.toStringAsFixed(0)} dB',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QuantColors.statusSuccess,
              ),
            ),
          ],
        ),
        Slider(
          value: _silenceThresholdDb,
          min: -50.0,
          max: -15.0,
          divisions: 35,
          activeColor: QuantColors.statusSuccess,
          inactiveColor: QuantColors.hairlineBorder,
          onChanged: (val) => setState(() => _silenceThresholdDb = val),
        ),

        const SizedBox(height: 12),

        // Minimum Silence Duration Slider
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'MINIMUM PAUSE DURATION',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              '${_minSilenceDurationMs.toStringAsFixed(0)} ms',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QuantColors.sovereignCyan,
              ),
            ),
          ],
        ),
        Slider(
          value: _minSilenceDurationMs,
          min: 150.0,
          max: 1000.0,
          divisions: 17,
          activeColor: QuantColors.sovereignCyan,
          inactiveColor: QuantColors.hairlineBorder,
          onChanged: (val) => setState(() => _minSilenceDurationMs = val),
        ),

        const SizedBox(height: 12),

        // Buffer Padding Slider
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'VOICE CUSHION PADDING',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              '${_paddingBufferMs.toStringAsFixed(0)} ms',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QuantColors.moltenAmber,
              ),
            ),
          ],
        ),
        Slider(
          value: _paddingBufferMs,
          min: 10.0,
          max: 100.0,
          divisions: 9,
          activeColor: QuantColors.moltenAmber,
          inactiveColor: QuantColors.hairlineBorder,
          onChanged: (val) => setState(() => _paddingBufferMs = val),
        ),

        const SizedBox(height: 14),

        // Telemetry Summary Card: Dead Air Detected
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.content_cut_rounded,
                  size: 18,
                  color: QuantColors.statusSuccess,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Detected $_detectedSilencesCount dead air segments',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    Text(
                      'Will trim ~${_savedDurationSeconds}s of dead silence and tighten pacing',
                      style: const TextStyle(
                        fontSize: 10,
                        color: QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTextToVideoControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'GENERATIVE PROMPT SPECIFICATION',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: TextField(
            controller: _promptController,
            maxLines: 4,
            style: const TextStyle(
              fontSize: 13,
              color: QuantColors.textPrimary,
              height: 1.4,
            ),
            decoration: const InputDecoration(
              hintText:
                  'Describe scene, lighting, camera movement, and aesthetic...',
              hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
              contentPadding: EdgeInsets.all(14),
              border: InputBorder.none,
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'CAMERA MOTION PRESETS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _buildPresetChip('Orbital Drone', Icons.flight_takeoff_rounded, true),
            const SizedBox(width: 8),
            _buildPresetChip(
                'Crane Down', Icons.vertical_align_bottom_rounded, false),
            const SizedBox(width: 8),
            _buildPresetChip('Push In 4K', Icons.zoom_in_rounded, false),
          ],
        ),
      ],
    );
  }

  Widget _buildBackgroundRemoverControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'EDGE FEATHERING & SPILL SUPPRESSION',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              '${_featherEdge.toStringAsFixed(1)}px',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: QuantColors.obsidianPurple,
              ),
            ),
          ],
        ),
        Slider(
          value: _featherEdge,
          min: 0.0,
          max: 5.0,
          divisions: 50,
          activeColor: QuantColors.obsidianPurple,
          inactiveColor: QuantColors.hairlineBorder,
          onChanged: (val) => setState(() => _featherEdge = val),
        ),
        const SizedBox(height: 16),
        const Text(
          'VIRTUAL BACKDROP REPLACEMENT',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 10),
        Column(
          children: List.generate(_backdrops.length, (idx) {
            final isSelected = _selectedBackdrop == idx;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                onTap: () => setState(() => _selectedBackdrop = idx),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? QuantColors.obsidianPurple.withOpacity(0.18)
                        : QuantColors.darkSlateCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isSelected
                          ? QuantColors.obsidianPurple
                          : QuantColors.hairlineBorder,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        isSelected
                            ? Icons.radio_button_checked_rounded
                            : Icons.radio_button_off_rounded,
                        size: 18,
                        color: isSelected
                            ? QuantColors.obsidianPurple
                            : QuantColors.textMuted,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        _backdrops[idx],
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected
                              ? Colors.white
                              : QuantColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }

  Widget _buildVoiceEnhancerControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'NEURAL DENOISER STRENGTH',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
                color: QuantColors.textMuted,
              ),
            ),
            Text(
              '${_denoiseStrength.toInt()}%',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: QuantColors.statusSuccess,
              ),
            ),
          ],
        ),
        Slider(
          value: _denoiseStrength,
          min: 0.0,
          max: 100.0,
          divisions: 100,
          activeColor: QuantColors.statusSuccess,
          inactiveColor: QuantColors.hairlineBorder,
          onChanged: (val) => setState(() => _denoiseStrength = val),
        ),
        const SizedBox(height: 14),
        SwitchListTile(
          value: _deReverbActive,
          activeColor: QuantColors.statusSuccess,
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Room De-Reverb & Echo Cancellation',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text(
            'Eliminates echo from untreated bedroom walls and large spaces',
            style: TextStyle(fontSize: 11, color: QuantColors.textSecondary),
          ),
          onChanged: (val) => setState(() => _deReverbActive = val),
        ),
        SwitchListTile(
          value: _vocalPresenceBoost,
          activeColor: QuantColors.statusSuccess,
          contentPadding: EdgeInsets.zero,
          title: const Text(
            'Broadcast Vocal Warmth & EQ',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          subtitle: const Text(
            'Enhances 2kHz - 5kHz intelligibility and proximity effect',
            style: TextStyle(fontSize: 11, color: QuantColors.textSecondary),
          ),
          onChanged: (val) => setState(() => _vocalPresenceBoost = val),
        ),
      ],
    );
  }

  Widget _buildGenericToolControls(AiToolItem tool) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.voidObsidian,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Column(
        children: [
          Icon(tool.icon, size: 36, color: tool.accentColor),
          const SizedBox(height: 10),
          const Text(
            'One-Tap Automated AI Pipeline',
            style: QuantTypography.titleMedium,
          ),
          const SizedBox(height: 6),
          Text(
            'Click generate below to apply ${tool.title} across active timeline clips.',
            textAlign: TextAlign.center,
            style: QuantTypography.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _buildPresetChip(String label, IconData icon, bool isSelected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isSelected
            ? QuantColors.sovereignCyan.withOpacity(0.2)
            : QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isSelected
              ? QuantColors.sovereignCyan
              : QuantColors.hairlineBorder,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: isSelected
                ? QuantColors.sovereignCyan
                : QuantColors.textMuted,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected
                  ? QuantColors.sovereignCyan
                  : QuantColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionPanel(AiToolItem activeTool) {
    return Column(
      children: [
        if (_isGenerating) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _activeToolStatus,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.sovereignCyan,
                      ),
                    ),
                    Text(
                      '${(_generationProgress * 100).toInt()}%',
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                LinearProgressIndicator(
                  value: _generationProgress,
                  backgroundColor: QuantColors.voidObsidian,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    activeTool.accentColor,
                  ),
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                ),
              ],
            ),
          ),
        ] else ...[
          SquircleButton(
            label: 'Generate ${activeTool.title}',
            isFullWidth: true,
            backgroundColor: activeTool.accentColor,
            textColor: QuantColors.voidObsidian,
            icon: Icons.auto_awesome_rounded,
            onPressed: () => _runAiGeneration(activeTool.title),
          ),
        ],
      ],
    );
  }
}
