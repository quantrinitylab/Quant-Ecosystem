// ============================================================================
// quantai_app - chat screen, /chat/:sessionId (W2)
// ============================================================================
//
// Ek conversation ka poora chat view: messages (reversed ListView.builder),
// streaming progressive render (D5), error banner + retry, neeche composer.
//
// Contract (W1, `package:quantai_core/quantai_core.dart`):
//   chatSessionControllerProvider  NotifierProvider.family<ChatSessionController,
//                                   ChatViewState, String>
//   class ChatViewState { messages, isStreaming, streamingText,
//                         ttfb, error } + copyWith
//   ChatSessionController: send(text), stop(), retry(),
//                          sendFeedback(messageId, positive)
//   conversationsProvider          FutureProvider<List<ChatSession>>
//     (AppBar title lookup ke liye)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantai_core/quantai_core.dart';

import '../widgets/chat/chat_composer.dart';
import '../widgets/chat/message_bubble.dart';

/// Ek chat session ka screen (`/chat/:sessionId`).
class ChatScreen extends ConsumerWidget {
  /// Creates the chat screen for [sessionId].
  const ChatScreen({super.key, required this.sessionId});

  /// Route path parameter se aaya session id.
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ChatViewState viewState =
        ref.watch(chatSessionControllerProvider(sessionId));
    final ChatSessionController controller =
        ref.read(chatSessionControllerProvider(sessionId).notifier);

    // AppBar title: conversations list se lookup, fallback Hinglish.
    final String title = ref
            .watch(conversationsProvider)
            .valueOrNull
            ?.where((ChatSession s) => s.id == sessionId)
            .firstOrNull
            ?.title
            .trim() ??
        '';
    final String appBarTitle =
        title.isEmpty ? 'Nayi baat-cheet' : title;

    final List<ChatMessage> displayMessages =
        _displayMessages(viewState);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          appBarTitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: Column(
        children: <Widget>[
          Expanded(
            child: displayMessages.isEmpty && !viewState.isStreaming
                ? _ChatEmptyState()
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: displayMessages.length,
                    itemBuilder: (BuildContext context, int index) {
                      // Reversed list: index 0 = sabse naya message.
                      final ChatMessage message = displayMessages[
                          displayMessages.length - 1 - index];
                      return MessageBubble(
                        message: message,
                        onFeedback: (bool positive) =>
                            controller.sendFeedback(message.id, positive),
                      );
                    },
                  ),
          ),
          // TTFB strip: pehla token kitni jaldi aaya — D5 latency feedback.
          if (viewState.isStreaming && viewState.ttfb != null)
            _TtfbStrip(ttfb: viewState.ttfb!),
          // Error banner: retry ke saath.
          if (viewState.error != null)
            _ErrorBanner(
              message: viewState.error!,
              onRetry: () => controller.retry(),
            ),
          ChatComposer(sessionId: sessionId),
        ],
      ),
    );
  }

  /// Display list: streaming text ko bubble me merge karo.
  ///
  /// W1 ka controller progressive text SIRF `ChatViewState.streamingText` me
  /// rakhta hai — streaming ke dauraan `messages` me koi `isStreaming`
  /// placeholder nahi hota (final assistant message `StreamDone` par append
  /// hota hai). Isliye yahan UI-only synthetic bubble banate hain taaki
  /// progressive render (D5) actually dikhe. `copyWith` branch isliye rakha
  /// hai taaki agar W1 baad me placeholder bhejne lage to bhi kaam kare.
  List<ChatMessage> _displayMessages(ChatViewState state) {
    final List<ChatMessage> messages = <ChatMessage>[...state.messages];
    if (!state.isStreaming) return messages;
    final int idx = messages.lastIndexWhere((ChatMessage m) => m.isStreaming);
    if (idx >= 0) {
      final ChatMessage current = messages[idx];
      if (current.content != state.streamingText) {
        messages[idx] = current.copyWith(content: state.streamingText);
      }
      return messages;
    }
    messages.add(
      ChatMessage(
        id: '__streaming__',
        sessionId: sessionId,
        role: ChatRole.assistant,
        content: state.streamingText,
        isStreaming: true,
      ),
    );
    return messages;
  }
}

/// TTFB strip — "pehla token Xms me aaya". Sirf streaming ke dauraan.
class _TtfbStrip extends StatelessWidget {
  const _TtfbStrip({required this.ttfb});

  final Duration ttfb;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      color: scheme.secondary.withValues(alpha: 0.08),
      child: Text(
        'pehla token ${ttfb.inMilliseconds}ms me aaya',
        style: textTheme.labelSmall?.copyWith(color: scheme.secondary),
        textAlign: TextAlign.center,
      ),
    );
  }
}

/// Error banner with retry.
class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: scheme.error.withValues(alpha: 0.12),
      child: Row(
        children: <Widget>[
          Icon(Icons.error_outline, size: 18, color: scheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style:
                  textTheme.bodySmall?.copyWith(color: scheme.onSurface),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          TextButton(
            onPressed: onRetry,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

/// Khali conversation ka hint.
class _ChatEmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.auto_awesome_outlined,
              size: 48,
              color: scheme.secondary,
            ),
            const SizedBox(height: 16),
            Text(
              'Quanty se kuch poochho',
              style: textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Neeche likho — jawab yahin stream hoga',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
