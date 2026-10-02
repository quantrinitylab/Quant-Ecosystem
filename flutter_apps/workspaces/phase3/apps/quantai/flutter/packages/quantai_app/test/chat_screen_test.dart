// ============================================================================
// quantai_app - ChatScreen widget tests (Shift 1, W3)
// ============================================================================
//
// STATUS: W1 ki `lib/src/chat/` files abhi LAND NAHI hui hain — ye test W1 ke
// FIXED contract par likha gaya hai aur tab tak compile nahi hoga jab tak W1
// apni files land nahi karta. Coordinator reconcile kare.
//
// Assumed import map (W1: `packages/quantai_core/lib/src/chat/`):
//   chat_models.dart            -> ChatMessage, ChatRole, MessageFeedback,
//                                 ChatViewState (sab + copyWith)
//   chat_session_controller.dart -> ChatSessionController (Notifier<ChatViewState>)
//   chat_providers.dart          -> chatSessionControllerProvider (family,
//                                 keyed by sessionId), conversationsProvider,
//                                 messagesProvider (family),
//                                 chatRepositoryProvider, usageGateProvider
// Assumed widget (W2: `packages/quantai_app/lib/src/screens/chat_screen.dart`):
//   const ChatScreen({super.key, required this.sessionId})
//   - har message ek bubble me render hota hai jisme message.content Text hai
//   - streaming ke dauran tooltip 'Stop' wala IconButton dikhta hai
//   - composer ek TextField hai; send IconButton ka tooltip 'Send' hai
//
// flutter_lints conventions. Koi real network call nahi — sirf fake data.
//
// W1 contract recap:
//   ChatMessage{id, sessionId, role(ChatRole.user/assistant/system), content,
//               createdAt, isStreaming, feedback(MessageFeedback.none/positive/negative)}
//   ChatViewState{messages, isStreaming, streamingText, ttfb, error}
//   controller: send(String), stop(), retry(), sendFeedback(String, bool)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// W1 contract imports — ye files abhi land nahi hui hain.
import 'package:quantai_core/src/chat/chat_models.dart';
import 'package:quantai_core/src/chat/chat_providers.dart';
import 'package:quantai_core/src/chat/chat_session_controller.dart';
import 'package:quantai_app/src/screens/chat_screen.dart';

/// Test fake: canned [ChatViewState] serve karta hai aur controller calls
/// record karta hai, taaki test me koi real network/API touch na ho.
class FakeChatSessionController extends ChatSessionController {
  FakeChatSessionController({ChatViewState? canned})
      : _canned = canned ??
            const ChatViewState(
              messages: <ChatMessage>[],
              isStreaming: false,
            );

  ChatViewState _canned;

  /// [send] me aaye hue texts, order me.
  final List<String> sentMessages = <String>[];

  /// [stop] kitni baar call hua.
  int stopCalls = 0;

  /// Canned state badlo (nayi state set karke rebuild trigger karo).
  set canned(ChatViewState value) {
    _canned = value;
    state = value;
  }

  @override
  ChatViewState build(String sessionId) => _canned;

  @override
  Future<void> send(String text) async {
    sentMessages.add(text);
  }

  @override
  void stop() {
    stopCalls++;
    canned = _canned.copyWith(isStreaming: false, streamingText: null);
  }

  @override
  Future<void> retry() async {}

  @override
  Future<void> sendFeedback(String messageId, bool positive) async {}
}

ChatMessage _msg({
  required String id,
  required ChatRole role,
  required String content,
}) =>
    ChatMessage(
      id: id,
      sessionId: 'session-1',
      role: role,
      content: content,
      createdAt: DateTime(2026, 10, 3, 2, 30),
      isStreaming: false,
      feedback: MessageFeedback.none,
    );

/// [ChatScreen] ko canned controller ke saath pump karo.
Future<void> _pumpChatScreen(
  WidgetTester tester, {
  required FakeChatSessionController fake,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        chatSessionControllerProvider('session-1')
            .overrideWith(() => fake),
      ],
      child: const MaterialApp(
        home: ChatScreen(sessionId: 'session-1'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('ChatScreen', () {
    testWidgets('user aur assistant dono bubbles render hote hain',
        (WidgetTester tester) async {
      final FakeChatSessionController fake = FakeChatSessionController(
        canned: ChatViewState(
          messages: <ChatMessage>[
            _msg(id: 'm1', role: ChatRole.user, content: 'Hello Quanty'),
            _msg(
                id: 'm2',
                role: ChatRole.assistant,
                content: 'Namaste! Kaise madad karoon?'),
          ],
          isStreaming: false,
        ),
      );

      await _pumpChatScreen(tester, fake: fake);

      expect(find.text('Hello Quanty'), findsOneWidget);
      expect(find.text('Namaste! Kaise madad karoon?'), findsOneWidget);
    });

    testWidgets('streaming state me stop button dikhta hai',
        (WidgetTester tester) async {
      final FakeChatSessionController fake = FakeChatSessionController(
        canned: ChatViewState(
          messages: <ChatMessage>[
            _msg(id: 'm1', role: ChatRole.user, content: 'Ek kahani sunao'),
          ],
          isStreaming: true,
          streamingText: 'Ek baar ek gaon me...',
          ttfb: const Duration(milliseconds: 320),
        ),
      );

      await _pumpChatScreen(tester, fake: fake);

      // Streaming partial text visible hai.
      expect(find.text('Ek baar ek gaon me...'), findsOneWidget);
      // Stop control visible hai aur dabane par stop() call hota hai.
      final Finder stopButton = find.byTooltip('Stop');
      expect(stopButton, findsOneWidget);
      await tester.tap(stopButton);
      await tester.pump();
      expect(fake.stopCalls, 1);
    });

    testWidgets('composer me text type karke send dabane par send() call hota hai',
        (WidgetTester tester) async {
      final FakeChatSessionController fake = FakeChatSessionController();

      await _pumpChatScreen(tester, fake: fake);

      const String typed = 'Mera calendar dikhao';
      await tester.enterText(find.byType(TextField), typed);
      await tester.tap(find.byTooltip('Send'));
      await tester.pump();

      expect(fake.sentMessages, <String>[typed]);
    });
  });
}
