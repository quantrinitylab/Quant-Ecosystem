import 'package:flutter/material.dart';
import '../models/quant_pillar.dart';
import '../theme/quant_colors.dart';
import '../theme/quant_typography.dart';

/// Sticky Voice Search Bar with Sub-5ms Contextual Querying
///
/// Features a 12dp rounded squircle container, contextual placeholder tied
/// to the active pillar, search leading icon, and dedicated mic button with
/// voice activity detection (VAD) audio state support.
class QuantVoiceSearchBar extends StatefulWidget {
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onMicTap;
  final VoidCallback? onClear;
  final String? placeholder;
  final QuantPillar? activePillar;
  final bool isListening;
  final bool autoFocus;
  final FocusNode? focusNode;

  const QuantVoiceSearchBar({
    super.key,
    this.controller,
    this.onChanged,
    this.onSubmitted,
    this.onMicTap,
    this.onClear,
    String? placeholder,
    String? hintText,
    this.activePillar,
    this.isListening = false,
    this.autoFocus = false,
    this.focusNode,
  }) : placeholder = placeholder ?? hintText;

  @override
  State<QuantVoiceSearchBar> createState() => _QuantVoiceSearchBarState();
}

class _QuantVoiceSearchBarState extends State<QuantVoiceSearchBar>
    with SingleTickerProviderStateMixin {
  late TextEditingController _controller;
  late FocusNode _focusNode;
  bool _internalFocus = false;
  bool _hasText = false;
  late AnimationController _micPulseController;

  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? TextEditingController();
    _focusNode = widget.focusNode ?? FocusNode();
    _hasText = _controller.text.isNotEmpty;

    _controller.addListener(_handleTextChange);
    _focusNode.addListener(_handleFocusChange);

    _micPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    if (widget.isListening) {
      _micPulseController.repeat(reverse: true);
    }
  }

  void _handleTextChange() {
    final hasText = _controller.text.isNotEmpty;
    if (_hasText != hasText) {
      setState(() => _hasText = hasText);
    }
  }

  void _handleFocusChange() {
    setState(() => _internalFocus = _focusNode.hasFocus);
  }

  @override
  void didUpdateWidget(covariant QuantVoiceSearchBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isListening != oldWidget.isListening) {
      if (widget.isListening) {
        _micPulseController.repeat(reverse: true);
      } else {
        _micPulseController.stop();
        _micPulseController.value = 0.0;
      }
    }
  }

  @override
  void dispose() {
    if (widget.controller == null) {
      _controller.dispose();
    } else {
      _controller.removeListener(_handleTextChange);
    }

    if (widget.focusNode == null) {
      _focusNode.dispose();
    } else {
      _focusNode.removeListener(_handleFocusChange);
    }

    _micPulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.activePillar?.accentColor ?? QuantColors.moltenAmber;
    final hint = widget.placeholder ??
        widget.activePillar?.searchPlaceholder ??
        'Search emails, docs, commits... <5ms index';

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      height: 48,
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _internalFocus ? accent : QuantColors.hairlineBorder,
          width: _internalFocus ? 1.2 : 1.0,
        ),
        boxShadow: _internalFocus
            ? [
                BoxShadow(
                  color: accent.withOpacity(0.18),
                  blurRadius: 10,
                  spreadRadius: 1,
                )
              ]
            : const [],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const SizedBox(width: 12),
          Icon(
            Icons.search_rounded,
            size: 20,
            color: _internalFocus ? accent : QuantColors.textMuted,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              autofocus: widget.autoFocus,
              onChanged: widget.onChanged,
              onSubmitted: widget.onSubmitted,
              style: QuantTypography.bodyMedium,
              cursorColor: accent,
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: QuantTypography.bodySmall.copyWith(
                  color: QuantColors.textMuted,
                  fontSize: 13,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          if (_hasText)
            IconButton(
              icon: const Icon(
                Icons.cancel_rounded,
                size: 18,
                color: QuantColors.textMuted,
              ),
              onPressed: () {
                _controller.clear();
                widget.onChanged?.call('');
                widget.onClear?.call();
              },
              splashRadius: 16,
              tooltip: 'Clear query',
            ),
          if (widget.onMicTap != null) ...[
            const SizedBox(width: 4),
            _MicButton(
              isListening: widget.isListening,
              pulseController: _micPulseController,
              accentColor: accent,
              onTap: widget.onMicTap!,
            ),
            const SizedBox(width: 8),
          ] else ...[
            const SizedBox(width: 10),
          ],
        ],
      ),
    );
  }
}

class _MicButton extends StatelessWidget {
  final bool isListening;
  final AnimationController pulseController;
  final Color accentColor;
  final VoidCallback onTap;

  const _MicButton({
    required this.isListening,
    required this.pulseController,
    required this.accentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (!isListening) {
      return Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: accentColor.withOpacity(0.12),
          borderRadius: BorderRadius.circular(9),
        ),
        child: IconButton(
          icon: Icon(
            Icons.mic_rounded,
            size: 18,
            color: accentColor,
          ),
          onPressed: onTap,
          padding: EdgeInsets.zero,
          splashRadius: 16,
          tooltip: 'Voice Search',
        ),
      );
    }

    return AnimatedBuilder(
      animation: pulseController,
      builder: (context, child) {
        final val = pulseController.value;
        return Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: QuantColors.statusError.withOpacity(0.2 + (0.2 * val)),
            borderRadius: BorderRadius.circular(9),
            border: Border.all(
              color: QuantColors.statusError.withOpacity(0.8),
              width: 1.2,
            ),
            boxShadow: [
              BoxShadow(
                color: QuantColors.statusError.withOpacity(0.4 * val),
                blurRadius: 8,
                spreadRadius: 1,
              )
            ],
          ),
          child: IconButton(
            icon: const Icon(
              Icons.mic_rounded,
              size: 18,
              color: Colors.white,
            ),
            onPressed: onTap,
            padding: EdgeInsets.zero,
            splashRadius: 16,
            tooltip: 'Listening... Tap to stop',
          ),
        );
      },
    );
  }
}
