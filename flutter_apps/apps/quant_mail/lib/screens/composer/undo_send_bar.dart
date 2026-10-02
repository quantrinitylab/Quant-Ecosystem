import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'undo_send_manager.dart';

/// Floating 10-Second Undo-Send Toast Bar
///
/// Impeller 120Hz-accelerated recall bar with shrinking progress bar,
/// status telemetry, [Send Now], [Undo (Z)] hotkey trigger, and global
/// keyboard event listener.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class UndoSendBar extends StatefulWidget {
  final UndoSendManager? manager;
  final VoidCallback? onUndoTapped;
  final VoidCallback? onSendNowTapped;

  const UndoSendBar({
    super.key,
    this.manager,
    this.onUndoTapped,
    this.onSendNowTapped,
  });

  @override
  State<UndoSendBar> createState() => _UndoSendBarState();
}

class _UndoSendBarState extends State<UndoSendBar> {
  late final UndoSendManager _manager;

  @override
  void initState() {
    super.initState();
    _manager = widget.manager ?? UndoSendManager.instance;
    // Register global hardware keyboard listener for 'Z' undo shortcut
    HardwareKeyboard.instance.addHandler(_handleGlobalKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_handleGlobalKey);
    super.dispose();
  }

  bool _handleGlobalKey(KeyEvent event) {
    if (event is KeyDownEvent && _manager.isQueued) {
      if (event.logicalKey == LogicalKeyboardKey.keyZ) {
        _manager.undo();
        widget.onUndoTapped?.call();
        return true; // Key handled
      }
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _manager,
      builder: (context, _) {
        final isVisible = _manager.isVisible;

        return AnimatedSlide(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutCubic,
          offset: isVisible ? Offset.zero : const Offset(0, 1.2),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: isVisible ? 1.0 : 0.0,
            child: isVisible ? _buildToastContent() : const SizedBox.shrink(),
          ),
        );
      },
    );
  }

  Widget _buildToastContent() {
    final draft = _manager.activeDraft;
    final isSending = _manager.isSending;
    final remainingSeconds = _manager.remainingSeconds;
    final progress = _manager.progress;

    // Recipient preview text
    String recipientSnippet = 'sovereign recipient';
    if (draft != null && draft.to.isNotEmpty) {
      final first = draft.to.first;
      recipientSnippet = first.name.isNotEmpty ? first.name : first.email;
      if (draft.to.length > 1) {
        recipientSnippet += ' +${draft.to.length - 1} more';
      }
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSending
              ? QuantColors.statusSuccess.withOpacity(0.6)
              : QuantColors.moltenAmber.withOpacity(0.4),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: (isSending ? QuantColors.statusSuccess : QuantColors.moltenAmber)
                .withOpacity(0.18),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              // Circular progress countdown beacon
              SizedBox(
                width: 24,
                height: 24,
                child: isSending
                    ? const CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor: AlwaysStoppedAnimation<Color>(QuantColors.statusSuccess),
                      )
                    : CircularProgressIndicator(
                        value: progress,
                        strokeWidth: 2.4,
                        valueColor: const AlwaysStoppedAnimation<Color>(QuantColors.moltenAmber),
                        backgroundColor: QuantColors.hairlineBorder,
                      ),
              ),
              const SizedBox(width: 12),

              // Countdown text & recipient
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isSending
                          ? 'Transmitting sovereign email...'
                          : 'Sending in ${remainingSeconds}s...',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      'To: $recipientSnippet',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w400,
                        color: QuantColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),

              // Action buttons (Undo & Send Now)
              if (!isSending) ...[
                // Send Now Button
                InkWell(
                  onTap: () {
                    _manager.sendNow();
                    widget.onSendNowTapped?.call();
                  },
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: QuantColors.hairlineBorder,
                        width: 1,
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.bolt_rounded,
                          size: 14,
                          color: QuantColors.sovereignCyan,
                        ),
                        SizedBox(width: 4),
                        Text(
                          'Send Now',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: QuantColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Undo (Z) Button
                InkWell(
                  onTap: () {
                    _manager.undo();
                    widget.onUndoTapped?.call();
                  },
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          QuantColors.moltenAmber,
                          Color(0xFFFF6B00),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [
                        BoxShadow(
                          color: QuantColors.moltenAmber.withOpacity(0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.undo_rounded,
                          size: 14,
                          color: Colors.white,
                        ),
                        SizedBox(width: 4),
                        Text(
                          'Undo (Z)',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ] else ...[
                // Transmitting indicator
                const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.check_circle_outline_rounded,
                      size: 16,
                      color: QuantColors.statusSuccess,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Delivering',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),

          const SizedBox(height: 10),

          // Linear smooth shrinking progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 2.5,
              valueColor: AlwaysStoppedAnimation<Color>(
                isSending ? QuantColors.statusSuccess : QuantColors.moltenAmber,
              ),
              backgroundColor: QuantColors.hairlineBorder,
            ),
          ),
        ],
      ),
    );
  }
}
