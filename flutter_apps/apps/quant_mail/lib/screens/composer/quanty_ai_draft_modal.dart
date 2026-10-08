import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../../widgets/quant_ai_logo.dart';

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
/// Draft template modal with quick prompt chips and tone selection.
/// QM-UIUX-059: removed simulated word-by-word streaming theater.
/// Templates are local and shown immediately; not live AI output.
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

class _QuantyAiDraftModalState extends State<QuantyAiDraftModal> {
  late final TextEditingController _promptController;

  QuantyTone _selectedTone = QuantyTone.professional;
  String _generatedText = '';
  bool _isGenerating = false;

  static const List<Map<String, dynamic>> _quickPrompts = [
    {
      'label': 'Follow-up on Proposal',
      'icon': Icons.handshake_outlined,
      'prompt': 'Follow up on the proposal sent earlier this week.',
    },
    {
      'label': 'Meeting Confirmation & Agenda',
      'icon': Icons.event_available_rounded,
      'prompt': 'Confirm tomorrow\u2019s meeting and include a short agenda.',
    },
    {
      'label': 'Polite Decline',
      'icon': Icons.block_rounded,
      'prompt': 'Politely decline an invitation.',
    },
    {
      'label': 'Executive Briefing',
      'icon': Icons.summarize_rounded,
      'prompt': 'Summarize this week\u2019s key updates for an executive briefing.',
    },
  ];

  @override
  void initState() {
    super.initState();
    _promptController = TextEditingController(text: widget.initialPrompt ?? '');

    if (_promptController.text.isNotEmpty) {
      _startSynthesis(_promptController.text);
    } else {
      // Default initial synthesis
      _startSynthesis(_quickPrompts.first['prompt'] as String);
    }
  }

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  void _startSynthesis(String promptText) {
    // QM-UIUX-059: show template immediately. No simulated streaming theater.
    setState(() {
      _isGenerating = false;
      _generatedText = _resolveSynthesizedText(promptText, _selectedTone);
    });
  }

  /// Demo draft templates. These are clearly-labeled local templates, not
  /// live AI output: generic wording with no fabricated metrics, names, or
  /// infrastructure claims. The user edits before sending.
  String _resolveSynthesizedText(String prompt, QuantyTone tone) {
    final lower = prompt.toLowerCase();

    if (lower.contains('follow-up') || lower.contains('proposal')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Dear Team,\n\nI wanted to follow up on the proposal submitted earlier this week.\n\nPlease let me know if you have any questions or if you would like to schedule a short call to discuss next steps.\n\nBest regards';
        case QuantyTone.concise:
          return 'Hi Team,\n\nFollowing up on the proposal submitted this week.\n\nPlease share your feedback when you have a moment.\n\nThanks';
        case QuantyTone.friendly:
          return 'Hi everyone,\n\nHope your week is going well! Just checking in on the proposal we shared.\n\nWould love to hear your thoughts whenever you have a chance!\n\nWarmly';
        case QuantyTone.urgent:
          return 'Following up on the pending proposal.\n\nPlease confirm your feedback at the earliest so we can proceed.';
      }
    } else if (lower.contains('meeting') || lower.contains('agenda') || lower.contains('sync')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Hello,\n\nConfirming our upcoming meeting.\n\nProposed agenda:\n1. Project updates\n2. Open action items\n3. Next steps\n\nLooking forward to our discussion.\n\nWarm regards';
        case QuantyTone.concise:
          return 'Meeting confirmed.\n\nAgenda:\n• Updates\n• Action items\n• Next steps';
        case QuantyTone.friendly:
          return 'Hey,\n\nLooking forward to our meeting! I put together a short agenda — let me know if you would like to add anything.\n\nBest';
        case QuantyTone.urgent:
          return 'Confirming the meeting. Please come prepared to review the open items.\n\nPrompt attendance appreciated.';
      }
    } else if (lower.contains('decline') || lower.contains('reject')) {
      switch (tone) {
        case QuantyTone.professional:
          return 'Dear Partner,\n\nThank you for considering us for this initiative. After review, we will not be able to participate at this time.\n\nWe appreciate your understanding and wish you continued success.\n\nSincerely';
        case QuantyTone.concise:
          return 'Thank you for the opportunity. We must respectfully decline at this stage.\n\nWe wish you all the best.';
        case QuantyTone.friendly:
          return 'Hi there,\n\nThanks so much for reaching out! Unfortunately we will not be able to participate this time.\n\nHope we can connect again down the line!\n\nAll the best';
        case QuantyTone.urgent:
          return 'We are unable to proceed with this request at this time. Thank you for your understanding.';
      }
    } else {
      // General / briefing
      switch (tone) {
        case QuantyTone.professional:
          return 'Executive Summary\n\n• Updates: [add key updates]\n• Risks: [add open risks]\n• Next steps: [add planned actions]';
        case QuantyTone.concise:
          return 'Briefing:\n• Updates: [add]\n• Next steps: [add]';
        case QuantyTone.friendly:
          return 'Hello Team,\n\nSharing a quick update: [add highlights].\n\nThanks to everyone for the effort!\n\nCheers';
        case QuantyTone.urgent:
          return 'Action Required\n\nPlease review the items below and respond with your feedback: [add items].';
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

            // Header with official animated Quant AI logo & title
            Row(
              children: [
                QuantAiLogo(
                  size: 40.0,
                  thinking: _isGenerating,
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
                            label: 'Demo draft',
                            variant: QuantBadgeVariant.amber,
                            leadingIcon: Icons.memory_rounded,
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'AI-assisted email drafting',
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
                                ? 'Drafting...'
                                : 'Draft ready',
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
                    ],
                  ),
                  const Divider(color: QuantColors.hairlineBorder, height: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Text(
                        _generatedText.isEmpty && _isGenerating
                            ? 'Preparing draft...'
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
