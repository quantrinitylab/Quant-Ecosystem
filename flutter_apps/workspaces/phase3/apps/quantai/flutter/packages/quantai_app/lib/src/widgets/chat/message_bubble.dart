// ============================================================================
// quantai_app - chat message bubble (W2)
// ============================================================================
//
// Ek [ChatMessage] ka render: user messages right-aligned violet, assistant
// left surface. Streaming state me blinking cursor + "soch raha hai…" jab
// text khaali ho. Assistant bubble ke neeche thumbs up/down feedback.
//
// Contract (W1, `package:quantai_core/quantai_core.dart`):
//   class ChatMessage { id, sessionId, role, content, createdAt,
//                        isStreaming, feedback } + copyWith
//   enum ChatRole { user, assistant, system }
//   enum MessageFeedback { none, positive, negative }

import 'package:flutter/material.dart';
import 'package:quantai_core/quantai_core.dart';

/// Ek chat message ka bubble.
///
/// [onFeedback] me `true` = thumbs up, `false` = thumbs down — caller isse
/// `ChatSessionController.sendFeedback(messageId, positive)` par map kare.
class MessageBubble extends StatelessWidget {
  /// Creates a message bubble.
  const MessageBubble({
    super.key,
    required this.message,
    required this.onFeedback,
  });

  /// Render hone wala message.
  final ChatMessage message;

  /// Feedback callback: `true` = positive, `false` = negative.
  final ValueChanged<bool> onFeedback;

  @override
  Widget build(BuildContext context) {
    final bool isUser = message.role == ChatRole.user;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;

    final BorderRadius radius = BorderRadius.only(
      topLeft: const Radius.circular(16),
      topRight: const Radius.circular(16),
      bottomLeft: Radius.circular(isUser ? 16 : 4),
      bottomRight: Radius.circular(isUser ? 4 : 16),
    );

    final Color bubbleColor =
        isUser ? scheme.secondary : scheme.surfaceContainer;
    final Color textColor =
        isUser ? scheme.onSecondary : scheme.onSurface;

    final Widget content = Container(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.8,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bubbleColor,
        borderRadius: radius,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (message.isStreaming && message.content.isEmpty)
            _ThinkingRow(color: textColor)
          else
            SelectableText.rich(
              TextSpan(
                children: <InlineSpan>[
                  TextSpan(text: message.content),
                  // Streaming ke dauraan live cursor — D5 progressive render.
                  if (message.isStreaming)
                    const WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: _BlinkingCursor(),
                    ),
                ],
              ),
              style: textTheme.bodyMedium?.copyWith(color: textColor),
            ),
        ],
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Row(
            mainAxisAlignment:
                isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: <Widget>[content],
          ),
          // Feedback sirf complete assistant messages par.
          if (!isUser &&
              message.role == ChatRole.assistant &&
              !message.isStreaming &&
              message.content.isNotEmpty)
            _FeedbackRow(
              // W1 contract deviation: `feedback` nullable hai
              // (MessageFeedback?), null = koi feedback nahi.
              feedback: message.feedback ?? MessageFeedback.none,
              onFeedback: onFeedback,
            ),
        ],
      ),
    );
  }
}

/// "Soch raha hai…" — streaming shuru hui par pehla token abhi nahi aaya.
class _ThinkingRow extends StatelessWidget {
  const _ThinkingRow({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(
          'soch raha hai…',
          style: textTheme.bodyMedium?.copyWith(
            color: color.withValues(alpha: 0.7),
            fontStyle: FontStyle.italic,
          ),
        ),
        const SizedBox(width: 6),
        const _BlinkingCursor(),
      ],
    );
  }
}

/// Thumbs up / down row. Diya hua feedback highlight hota hai.
class _FeedbackRow extends StatelessWidget {
  const _FeedbackRow({
    required this.feedback,
    required this.onFeedback,
  });

  final MessageFeedback feedback;
  final ValueChanged<bool> onFeedback;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 2, left: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          _FeedbackButton(
            icon: Icons.thumb_up_outlined,
            selectedIcon: Icons.thumb_up,
            selected: feedback == MessageFeedback.positive,
            tooltip: 'Achha jawab',
            onPressed: () => onFeedback(true),
          ),
          _FeedbackButton(
            icon: Icons.thumb_down_outlined,
            selectedIcon: Icons.thumb_down,
            selected: feedback == MessageFeedback.negative,
            tooltip: 'Behtar ho sakta tha',
            onPressed: () => onFeedback(false),
          ),
        ],
      ),
    );
  }
}

class _FeedbackButton extends StatelessWidget {
  const _FeedbackButton({
    required this.icon,
    required this.selectedIcon,
    required this.selected,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final IconData selectedIcon;
  final bool selected;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return IconButton(
      tooltip: tooltip,
      iconSize: 16,
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      icon: Icon(selected ? selectedIcon : icon),
      color: selected ? scheme.secondary : scheme.onSurfaceVariant,
      onPressed: onPressed,
    );
  }
}

/// Streaming cursor — aadhe second me blink karta hai.
class _BlinkingCursor extends StatefulWidget {
  const _BlinkingCursor();

  @override
  State<_BlinkingCursor> createState() => _BlinkingCursorState();
}

class _BlinkingCursorState extends State<_BlinkingCursor>
    with SingleTickerProviderStateMixin {
  late final AnimationController _blink = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 530),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _blink.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _blink.drive(CurveTween(curve: Curves.easeInOut)),
      child: Container(
        width: 8,
        height: 16,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.secondary,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}
