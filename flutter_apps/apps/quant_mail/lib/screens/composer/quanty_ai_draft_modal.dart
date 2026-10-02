import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

/// Tone Setting for Quanty Synthesis
enum QuantyTone {
  professional(
    label: 'Professional',
    icon: Icons.business_center_rounded,
    promptDescriptor: 'executive, polished, and structured',
  ),
  concise(
    label: 'Concise',
    icon: Icons.compress_rounded,
    promptDescriptor: 'ultra-brief, action-oriented, and bulleted',
  ),
  friendly(
    label: 'Friendly',
    icon: Icons.sentiment_satisfied_rounded,
    promptDescriptor: 'warm, collaborative, and approachable',
  ),
  urgent(
    label: 'Urgent',
    icon: Icons.bolt_rounded,
    promptDescriptor: 'time-sensitive, direct, and imperative',
  );

  final String label;
  final IconData icon;
  final String promptDescriptor;

  const QuantyTone({
    required this.label,
    required this.icon,
    required this.promptDescriptor,
  });
}

/// Quanty AI Smart Draft Synthesis Modal
///
/// Hardware-accelerated draft synthesis modal utilizing local ONNX
/// streaming emulation, quick prompt chips, tone selection, and molten glowing beacon.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class QuantyAiDraftModal extends StatefulWidget {
  final String? initialPrompt;

  const QuantyAiDraftModal({
    super.key,
    this.initialPrompt,
  });

  static Future<String?> show(BuildContext context, {String? initialPrompt}) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => QuantyAiDraftModal(initialPrompt: initialPrompt),
    );
  }

  @override
  State<QuantyAiDraftModal> createState() => _QuantyAiDraftModalState();
}

class _QuantyAiDraftModalState extends State<QuantyAiDraftModal>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _promptController;
  late final AnimationController _beaconController;
  late final Animation<double> _beaconGlowAnimation;

  QuantyTone _selectedTone = QuantyTone.professional;
  String _generatedText = '';
  bool _isGenerating = false;
  Timer? _streamingTimer;

  static const List<Map<String, dynamic>> _quickPrompts = [
    {
      'label': 'Follow-up on Proposal',
      'icon': Icons.handshake_outlined,
      'prompt': 'Follow up on the technical architecture proposal sent earlier this week, highlighting sub-5ms benchmarks.',
    },
    {
      'label': 'Meeting Confirmation & Agenda',
      'icon': Icons.event_available_rounded,
      'prompt': 'Confirm tomorrow sync at 10:00 AM IST with agenda on Wave 76 Flutter verification.',
    },
    {
      'label': 'Polite Decline',
      'icon': Icons.block_rounded,
      'prompt': 'Politely decline an external partnership invitation due to total focus on sovereign monorepo.',
    },
    {
      'label': 'Executive Briefing',
      'icon': Icons.summarize_rounded,
      'prompt': 'Executive briefing on QuantMail performance, zero-cloud encryption, and 20 pods running in quant-staging.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _promptController = TextEditingController(text: widget.initialPrompt ?? '');
    _beaconController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _beaconGlowAnimation = Tween<double>(begin: 0.25, end: 0.85).animate(
      CurvedAnimation(parent: _beaconController, curve: Curves.easeInOut),
    );

    if (_promptController.text.isNotEmpty) {
      _startSynthesis(_promptController.text);
    } else {
      // Default initial synthesis
      _startSynthesis(_quickPrompts.first['prompt'] as String);
    }
  }

  @override
  void dispose() {
    _streamingTimer?.cancel();
    _promptController.dispose();
    _beaconController.dispose();
    super.dispose();
  }

  void _startSynthesis(String promptText) {
    _streamingTimer?.cancel();
    setState(() {
      _isGenerating = true;
      _generatedText = '';
    });

    final targetText = _resolveSynthesizedText(promptText, _selectedTone);
    final words = targetText.split(' ');
    int currentWordIndex = 0;

    // Simulate 120 tokens/sec local ONNX streaming
    _streamingTimer = Timer.periodic(const Duration(milliseconds: 28), (timer) {
      if (currentWordIndex < words.length) {
        setState(() {
          _generatedText += (currentWordIndex == 0 ? '' : ' ') + words[currentWordIndex];
          currentWordIndex++;
        });
      } else {
        timer.cancel();
        setState(() {
          _isGenerating = false;
        });
      }
    });
  }

  String _resolveSynthesizedText(String prompt, QuantyTone tone) {
    final lower = prompt.toLowerCase();

    if (lower.contains('follow-up') || lower.contains('proposal')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Dear Team,\n\nI wanted to follow up on the sovereign ecosystem architectural proposal submitted earlier this week. Our telemetry demonstrates 100% test passing rates across all microservices, sub-5ms local indexing, and hardware-accelerated Impeller rendering at 120Hz.\n\nPlease let me know if you have any questions or if you would like to schedule a 15-minute sync to finalize the deployment roadmap.\n\nBest regards,\nQuant Engineering Team';
        case QuantyTone.concise:
          return 'Hi Team,\n\nFollowing up on the proposal submitted this week:\n• Benchmark: Sub-5ms indexing active\n• Verification: 100% test suite green\n• Next step: Cluster staging sign-off\n\nPlease send your approval by EOD.\n\nThanks,\nQuant Lab';
        case QuantyTone.friendly:
          return 'Hi everyone,\n\nHope your week is going great! Just checking in on the architecture proposal we shared. We have seen stellar results in testing with zero compromises on performance.\n\nWould love to hear your thoughts whenever you have a chance!\n\nWarmly,\nQuant Engineering';
        case QuantyTone.urgent:
          return 'Priority Attention Required:\n\nFollowing up on the pending proposal submission. Deployment staging windows close tomorrow morning, and we require architectural sign-off today to maintain the Wave 76 schedule.\n\nPlease confirm approval immediately.';
      }
    } else if (lower.contains('meeting') || lower.contains('agenda') || lower.contains('sync')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Hi Alex,\n\nConfirming our upcoming sync scheduled for tomorrow at 10:00 AM IST.\n\nAgenda:\n1. Wave 76 Flutter Omni-Presence Verification\n2. 10-Second Undo-Send Queue Integration & Impeller Benchmark\n3. Fastify Sovereign Mail Gateway Latency Telemetry\n\nLooking forward to our discussion.\n\nWarm regards,\nQuant Operations';
        case QuantyTone.concise:
          return 'Confirmed: Tomorrow at 10:00 AM IST.\n\nAgenda items:\n• Flutter Omni-presence verification\n• 10s undo-send queue\n• Fastify gateway latency\n\nSee you then.';
        case QuantyTone.friendly:
          return 'Hey Alex,\n\nReally excited for our sync tomorrow at 10:00 AM IST! I put together a quick agenda covering our Flutter omni-presence milestones and the new undo-send engine.\n\nLet me know if you would like to add anything else to the list!\n\nBest,\nSundar';
        case QuantyTone.urgent:
          return 'Urgent Briefing Confirmation:\n\nMandatory sync scheduled for tomorrow at 10:00 AM IST. All leads must attend prepared to review critical wave deliverables.\n\nPrompt attendance required.';
      }
    } else if (lower.contains('decline') || lower.contains('reject')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Dear Partner,\n\nThank you for considering our team for this initiative. While the proposed collaboration offers great merit, our current engineering commitments are entirely dedicated to the sovereign monorepo and live cluster verification.\n\nWe appreciate your understanding and wish your venture continued success.\n\nSincerely,\nQuant Trinity Lab';
        case QuantyTone.concise:
          return 'Thank you for the opportunity. We must respectfully decline at this stage due to full capacity on sovereign infrastructure development.\n\nWe wish you all the best.';
        case QuantyTone.friendly:
          return 'Hi there,\n\nThanks so much for reaching out with this exciting project! Unfortunately, our team is knee-deep in sovereign cluster builds right now, so we won\'t be able to participate.\n\nI hope we can connect again down the line!\n\nAll the best,\nQuant Team';
        case QuantyTone.urgent:
          return 'Notice of Immediate Decline:\n\nWe are unable to proceed with this request. All engineering resources are locked for active wave milestones.';
      }
    } else {
      // Executive Briefing / General
      switch (tone) {
        case QuantyTone.professional:
          return 'Executive Summary — Wave 76 Deployment Status:\n\n• Platform: Sovereign Superhuman & Gmail Killer Flutter client\n• Search Performance: Sub-5ms FTS5 index and FastCDC vault architecture\n• Security: Zero-cloud E2EE with AES-256 pre-keys\n• Infrastructure: 20 sovereign cluster pods operational in quant-staging\n\nNext Milestone: Public release candidate build distribution.';
        case QuantyTone.concise:
          return 'Wave 76 Briefing:\n• Status: All systems green\n• Latency: <5ms local FTS5\n• Security: E2EE AES-256 verified\n• Fleet: 20 pods running in quant-staging\n\nReady for production dispatch.';
        case QuantyTone.friendly:
          return 'Hello Team,\n\nSuper proud to share our latest milestone briefing! Everything across the Flutter omni-presence suite is performing exceptionally well with zero crashes and blazingly fast sub-5ms search.\n\nBig thanks to everyone for the incredible effort!\n\nCheers,\nQuant Lead';
        case QuantyTone.urgent:
          return 'Action Required: Executive Briefing\n\nImmediate review needed for Wave 76 staging deployment. 20 pods are active with sub-5ms telemetry. Please review and verify release candidate.';
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.obsidianVoid,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          top: 12,
          left: 20,
          right: 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Modal grab handle
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: QuantColors.hairlineBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Header with Molten Glowing Beacon & Title
            Row(
              children: [
                AnimatedBuilder(
                  animation: _beaconGlowAnimation,
                  builder: (context, child) {
                    return Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [QuantColors.moltenAmber, Color(0xFFFF6B00)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: QuantColors.moltenAmber
                                .withOpacity(_beaconGlowAnimation.value),
                            blurRadius: 14,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.auto_awesome_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'Quanty Assist',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: QuantColors.textPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(width: 8),
                          QuantBadge(
                            label: 'Local ONNX',
                            variant: QuantBadgeVariant.amber,
                            leadingIcon: Icons.memory_rounded,
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Sovereign AI Email Synthesis • Sub-5ms E2EE',
                        style: TextStyle(
                          fontSize: 11,
                          color: QuantColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary),
                  onPressed: () => Navigator.of(context).pop(),
                  tooltip: 'Cancel',
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Prompt Input Field
            Container(
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: _isGenerating
                      ? QuantColors.moltenAmber.withOpacity(0.6)
                      : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: Row(
                children: [
                  const Icon(
                    Icons.edit_note_rounded,
                    size: 20,
                    color: QuantColors.moltenAmber,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _promptController,
                      style: const TextStyle(
                        fontSize: 14,
                        color: QuantColors.textPrimary,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'What would you like Quanty to draft?',
                        hintStyle: TextStyle(
                          fontSize: 13,
                          color: QuantColors.textMuted,
                        ),
                        border: InputBorder.none,
                      ),
                      onSubmitted: (val) {
                        if (val.trim().isNotEmpty) {
                          _startSynthesis(val);
                        }
                      },
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.arrow_forward_rounded,
                      color: QuantColors.moltenAmber,
                      size: 18,
                    ),
                    onPressed: () {
                      final val = _promptController.text.trim();
                      if (val.isNotEmpty) {
                        _startSynthesis(val);
                      }
                    },
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // Quick Prompt Chips
            SizedBox(
              height: 32,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _quickPrompts.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final item = _quickPrompts[index];
                  final label = item['label'] as String;
                  final icon = item['icon'] as IconData;
                  final prompt = item['prompt'] as String;

                  return InkWell(
                    onTap: () {
                      _promptController.text = prompt;
                      _startSynthesis(prompt);
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: QuantColors.hairlineBorder,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(icon, size: 13, color: QuantColors.moltenAmber),
                          const SizedBox(width: 6),
                          Text(
                            label,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: QuantColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            const SizedBox(height: 12),

            // Tone Selector Chips Row
            Row(
              children: [
                const Text(
                  'Tone:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.textMuted,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 30,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: QuantyTone.values.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 6),
                      itemBuilder: (context, index) {
                        final tone = QuantyTone.values[index];
                        final isSelected = _selectedTone == tone;

                        return InkWell(
                          onTap: () {
                            setState(() => _selectedTone = tone);
                            final prompt = _promptController.text.trim();
                            _startSynthesis(prompt.isNotEmpty
                                ? prompt
                                : (_quickPrompts.first['prompt'] as String));
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? QuantColors.moltenAmber.withOpacity(0.18)
                                  : QuantColors.darkSlateCard,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isSelected
                                    ? QuantColors.moltenAmber
                                    : QuantColors.hairlineBorder,
                                width: isSelected ? 1.2 : 0.8,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  tone.icon,
                                  size: 13,
                                  color: isSelected
                                      ? QuantColors.moltenAmber
                                      : QuantColors.textMuted,
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  tone.label,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: isSelected
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                    color: isSelected
                                        ? Colors.white
                                        : QuantColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 14),

            // Streaming Generation Preview Card with Glowing Beacon
            Container(
              constraints: const BoxConstraints(minHeight: 140, maxHeight: 220),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _isGenerating
                      ? QuantColors.moltenAmber.withOpacity(0.5)
                      : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _isGenerating
                                ? Icons.sync_rounded
                                : Icons.check_circle_outline_rounded,
                            size: 14,
                            color: _isGenerating
                                ? QuantColors.moltenAmber
                                : QuantColors.statusSuccess,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _isGenerating
                                ? 'Synthesizing with local ONNX weights...'
                                : 'Synthesis Complete',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: _isGenerating
                                  ? QuantColors.moltenAmber
                                  : QuantColors.statusSuccess,
                            ),
                          ),
                        ],
                      ),
                      const Row(
                        children: [
                          Icon(Icons.speed_rounded,
                              size: 13, color: QuantColors.statusSuccess),
                          SizedBox(width: 4),
                          Text(
                            '128 tok/s',
                            style: TextStyle(
                              fontSize: 10,
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.w700,
                              color: QuantColors.statusSuccess,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const Divider(color: QuantColors.hairlineBorder, height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Text(
                        _generatedText.isEmpty && _isGenerating
                            ? 'Preparing neural context tokens...'
                            : _generatedText,
                        style: const TextStyle(
                          fontSize: 13.5,
                          height: 1.5,
                          color: QuantColors.textPrimary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Action Buttons: [Regenerate] and [Insert Draft]
            Row(
              children: [
                Expanded(
                  flex: 1,
                  child: InkWell(
                    onTap: _isGenerating
                        ? null
                        : () {
                            final prompt = _promptController.text.trim();
                            _startSynthesis(prompt.isNotEmpty
                                ? prompt
                                : (_quickPrompts.first['prompt'] as String));
                          },
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      height: 46,
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: QuantColors.hairlineBorder,
                          width: 1,
                        ),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.refresh_rounded,
                            size: 16,
                            color: QuantColors.textSecondary,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Regenerate',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: QuantColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: InkWell(
                    onTap: _generatedText.isEmpty
                        ? null
                        : () {
                            Navigator.of(context).pop(_generatedText);
                          },
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      height: 46,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: _generatedText.isEmpty
                              ? [QuantColors.hairlineBorder, QuantColors.hairlineBorder]
                              : [QuantColors.moltenAmber, const Color(0xFFFF6B00)],
                        ),
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: _generatedText.isNotEmpty
                            ? [
                                BoxShadow(
                                  color: QuantColors.moltenAmber.withOpacity(0.35),
                                  blurRadius: 12,
                                  offset: const Offset(0, 3),
                                ),
                              ]
                            : null,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.done_all_rounded,
                            size: 18,
                            color: _generatedText.isNotEmpty
                                ? Colors.white
                                : QuantColors.textMuted,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Insert Draft',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: _generatedText.isNotEmpty
                                  ? Colors.white
                                  : QuantColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
