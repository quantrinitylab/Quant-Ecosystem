// ============================================================================
// quantai_core - chat Riverpod providers (W1: chat data layer)
// ============================================================================
//
// Provider graph for chat:
//
//   apiClientProvider ──▶ sessionsApiProvider ──┐
//   sseClientProvider ─────────────────────────┼──▶ chatRepositoryProvider ──▶
//   appConfigProvider ─────────────────────────┘
//        conversationsProvider (FutureProvider<List<ChatSession>>)
//        messagesProvider (FutureProvider.family<List<ChatMessage>, String>)
//        chatSessionControllerProvider
//          (NotifierProvider.family<ChatSessionController, ChatViewState, String>)

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import 'chat_models.dart';
import 'chat_repository.dart';
import 'sessions_api.dart';

/// Typed sessions/messages API over the shared [QuantAiApiClient].
final sessionsApiProvider = Provider<SessionsApi>(
  (ref) => SessionsApi(client: ref.watch(apiClientProvider)),
  name: 'sessionsApiProvider',
);

/// Chat data access: unary API + SSE streaming + config.
final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(
    api: ref.watch(sessionsApiProvider),
    sseClient: ref.watch(sseClientProvider),
    config: ref.watch(appConfigProvider),
  ),
  name: 'chatRepositoryProvider',
);

/// The conversation list (first page).
final conversationsProvider = FutureProvider<List<ChatSession>>(
  (ref) => ref.watch(chatRepositoryProvider).listSessions(),
  name: 'conversationsProvider',
);

/// Message history of one session.
final messagesProvider =
    FutureProvider.family<List<ChatMessage>, String>(
  (ref, sessionId) =>
      ref.watch(chatRepositoryProvider).listMessages(sessionId),
  name: 'messagesProvider',
);

/// Immutable view state for one open chat session.
class ChatViewState {
  final List<ChatMessage> messages;
  final bool isStreaming;
  final String streamingText;
  final Duration? ttfb;
  final String? error;

  const ChatViewState({
    this.messages = const [],
    this.isStreaming = false,
    this.streamingText = '',
    this.ttfb,
    this.error,
  });

  ChatViewState copyWith({
    List<ChatMessage>? messages,
    bool? isStreaming,
    String? streamingText,
    Duration? ttfb,
    String? error,
    bool clearError = false,
  }) {
    return ChatViewState(
      messages: messages ?? this.messages,
      isStreaming: isStreaming ?? this.isStreaming,
      streamingText: streamingText ?? this.streamingText,
      ttfb: ttfb ?? this.ttfb,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  String toString() =>
      'ChatViewState(messages: ${messages.length}, isStreaming: $isStreaming, '
      'streamingText: ${streamingText.length} chars, ttfb: $ttfb, '
      'error: $error)';
}

/// Controller for one open chat session: optimistic send, streaming assembly,
/// stop/retry, and feedback.
class ChatSessionController extends FamilyNotifier<ChatViewState, String> {
  StreamSubscription<ChatStreamEvent>? _subscription;

  @override
  ChatViewState build(String sessionId) {
    ref.onDispose(() => _subscription?.cancel());
    _loadHistory(sessionId);
    return const ChatViewState();
  }

  Future<void> _loadHistory(String sessionId) async {
    try {
      final messages =
          await ref.read(chatRepositoryProvider).listMessages(sessionId);
      state = state.copyWith(messages: messages);
    } catch (e) {
      state = state.copyWith(error: 'Could not load messages: $e');
    }
  }

  /// Sends [text]: appends an optimistic user message, then streams the
  /// assistant reply. Ignored while a stream is in flight.
  Future<void> send(String text) async {
    if (text.trim().isEmpty || state.isStreaming) return;
    final optimistic = ChatMessage(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      sessionId: arg,
      role: ChatRole.user,
      content: text,
      createdAt: DateTime.now(),
    );
    state = state.copyWith(
      messages: [...state.messages, optimistic],
      isStreaming: true,
      streamingText: '',
      ttfb: null,
      clearError: true,
    );
    await _runStream(text);
  }

  /// Cancels the in-flight stream; keeps the partial text.
  void stop() {
    _subscription?.cancel();
    _subscription = null;
    if (state.isStreaming) {
      state = state.copyWith(isStreaming: false);
    }
  }

  /// Re-sends the last user message (no duplicate optimistic message).
  Future<void> retry() async {
    if (state.isStreaming) return;
    ChatMessage? lastUser;
    for (var i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role == ChatRole.user) {
        lastUser = state.messages[i];
        break;
      }
    }
    if (lastUser == null) return;
    state = state.copyWith(
      isStreaming: true,
      streamingText: '',
      ttfb: null,
      clearError: true,
    );
    await _runStream(lastUser.content);
  }

  /// Records feedback on a message: optimistic local update, fire-and-forget
  /// network call, revert on failure.
  void sendFeedback(String messageId, bool? positive) {
    final previous = state.messages;
    final feedback = positive == null
        ? null
        : (positive ? MessageFeedback.positive : MessageFeedback.negative);
    state = state.copyWith(
      messages: previous
          .map((m) =>
              m.id == messageId ? m.copyWith(feedback: feedback) : m)
          .toList(),
    );
    unawaited(
      ref
          .read(chatRepositoryProvider)
          .sendFeedback(
            sessionId: arg,
            messageId: messageId,
            positive: positive,
          )
          .then<void>((_) {})
          .catchError((Object _) {
        state = state.copyWith(messages: previous);
      }),
    );
  }

  Future<void> _runStream(String text) async {
    await _subscription?.cancel();
    final buffer = StringBuffer();
    _subscription = ref
        .read(chatRepositoryProvider)
        .sendStreaming(sessionId: arg, content: text)
        .listen(
      (event) {
        switch (event) {
          case StreamStarted(:final ttfb):
            state = state.copyWith(ttfb: ttfb);
          case StreamDelta(:final text):
            buffer.write(text);
            state = state.copyWith(streamingText: buffer.toString());
          case StreamDone(:final message):
            state = state.copyWith(
              messages: [...state.messages, message],
              isStreaming: false,
              streamingText: '',
            );
          case StreamError(:final message):
            state = state.copyWith(
              isStreaming: false,
              error: message,
            );
        }
      },
      onError: (Object e) {
        // The repository converts failures to StreamError; this is a
        // last-resort guard so the UI can never hang mid-stream.
        state = state.copyWith(isStreaming: false, error: '$e');
      },
    );
    // The subscription lives until the stream completes or stop() cancels it.
  }
}

/// Per-session chat controller.
final chatSessionControllerProvider = NotifierProvider.family<
    ChatSessionController, ChatViewState, String>(
  ChatSessionController.new,
  name: 'chatSessionControllerProvider',
);
