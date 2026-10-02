import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../data/cooks_repository.dart';
import '../models/cooks_models.dart';

/// AI Video & Audio Creation Tools Screen.
///
/// Features:
/// 1. Text-to-Video Synthesis (Sora & Gen-3 diffusion prompt runner)
/// 2. Auto-Captions with Animated Kinetic Typography (Whisper V3 sync)
/// 3. Background Remover / Magic Green Screen (Neural rotoscoping & alpha matte)
/// 4. Voice Enhancer / Studio Noise Cleaner (Sub-10ms denoiser & de-reverb)
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (120Hz Impeller acceleration).
class AiToolsScreen extends StatefulWidget {
  final Function(String toolTitle)? onApplyToolResult;

  const AiToolsScreen({super.key, this.onApplyToolResult});

  @override
  State<AiToolsScreen> createState() => _AiToolsScreenState();
}

class _AiToolsScreenState extends State<AiToolsScreen> {
  int _selectedToolIndex = 0;
  final TextEditingController _promptController = TextEditingController(
    text: 'Cinematic hyperlapse of neon cyberpunk metropolis with flying taxis and rain reflections 4K 60fps',
  );

  bool _isGenerating = false;
  double _generationProgress = 0.0;
  String _activeToolStatus = 'Idle';

  // Kinetic Caption styles
  int _selectedCaptionStyle = 0;
  final List<String> _captionStyles = const [
    'Kinetic Bounce',
    'Neon Cyber Glow',
    'Highlighter Pill',
    'Karaoke Fill',
    'Retro Typewriter',
  ];

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
      _activeToolStatus = 'Initializing Neural Pipeline...';
    });

    for (int i = 1; i <= 10; i++) {
      await Future.delayed(const Duration(milliseconds: 150));
      if (!mounted) return;
      setState(() {
        _generationProgress = i / 10.0;
        if (i < 4) {
          _activeToolStatus = 'Allocating MediaCodec Tensor Cores...';
        } else if (i < 8) {
          _activeToolStatus = 'Synthesizing 60fps Frames & Diffusion Tokens...';
        } else {
          _activeToolStatus = 'Finalizing Multi-Track Asset Insertion...';
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
          '$toolName generated successfully and appended to timeline.',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final aiTools = CooksRepository.getAiTools();
    final activeTool = aiTools[_selectedToolIndex];

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
                    if (activeTool.type == AiToolType.textToVideo)
                      _buildTextToVideoControls()
                    else if (activeTool.type == AiToolType.autoCaptions)
                      _buildAutoCaptionsControls()
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
                    colors: [QuantColors.obsidianPurple, QuantColors.sovereignCyan],
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
                    'Sora & Whisper V3 Neural Core',
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
                  '120Hz ONLINE',
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
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                        color: isSelected ? Colors.white : QuantColors.textSecondary,
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
                    Text(
                      tool.title,
                      style: QuantTypography.titleMedium.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: tool.accentColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: tool.accentColor.withOpacity(0.3)),
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
              hintText: 'Describe scene, lighting, camera movement, and aesthetic...',
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
            _buildPresetChip('Crane Down', Icons.vertical_align_bottom_rounded, false),
            const SizedBox(width: 8),
            _buildPresetChip('Push In 4K', Icons.zoom_in_rounded, false),
          ],
        ),
      ],
    );
  }

  Widget _buildAutoCaptionsControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ANIMATED KINETIC TYPOGRAPHY STYLE',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: List.generate(_captionStyles.length, (idx) {
            final isSelected = _selectedCaptionStyle == idx;
            return InkWell(
              onTap: () => setState(() => _selectedCaptionStyle = idx),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? QuantColors.moltenAmber.withOpacity(0.2)
                      : QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: isSelected
                        ? QuantColors.moltenAmber
                        : QuantColors.hairlineBorder,
                  ),
                ),
                child: Text(
                  _captionStyles[idx],
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                    color: isSelected ? QuantColors.moltenAmber : QuantColors.textSecondary,
                  ),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: const Row(
            children: [
              Icon(Icons.mic_none_rounded, color: QuantColors.statusSuccess, size: 20),
              SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Whisper V3 Word-Level Sync',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    Text(
                      '99.4% precision with sub-5ms latency across 52 languages',
                      style: TextStyle(fontSize: 11, color: QuantColors.textSecondary),
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
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected ? Colors.white : QuantColors.textSecondary,
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
          Text(
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
            color: isSelected ? QuantColors.sovereignCyan : QuantColors.textMuted,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected ? QuantColors.sovereignCyan : QuantColors.textSecondary,
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
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                LinearProgressIndicator(
                  value: _generationProgress,
                  backgroundColor: QuantColors.voidObsidian,
                  valueColor: AlwaysStoppedAnimation<Color>(activeTool.accentColor),
                  minHeight: 6,
                  borderRadius: BorderRadius.circular(3),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        SquircleButton(
          label: _isGenerating
              ? 'Synthesizing AI Neural Asset...'
              : 'Execute ${activeTool.title} (Est. ${activeTool.estimatedSeconds}s)',
          isFullWidth: true,
          backgroundColor: activeTool.accentColor,
          textColor: QuantColors.voidObsidian,
          icon: activeTool.icon,
          onPressed: _isGenerating ? null : () => _runAiGeneration(activeTool.title),
        ),
      ],
    );
  }
}
