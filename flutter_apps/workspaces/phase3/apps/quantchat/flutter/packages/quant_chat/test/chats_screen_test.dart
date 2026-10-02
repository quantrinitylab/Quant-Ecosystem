// ============================================================================
// quant_chat - chats screen widget tests (QuantChat, shift 2)
//
// The real `conversationListProvider` needs the network; these tests override
// it with [FakeConversationListNotifier] so the screen's states
// (loading / data / error + retry) are covered without any API.
//
// NOTE: fixture constructors follow W2's REAL chat_core contract, not the
// assumed positional one:
//   Conversation(id, type, {name, participantIds, lastMessage, unreadCount,
//                          updatedAt, isArchived})
//   ChatMessagePreview(id, content, senderId, {createdAt, type})

import 'package:chat_core/src/chat/chat.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_chat/src/screens/chats_screen.dart';

/// Test double for the `ConversationListNotifier` contract:
///
///   NotifierProvider<ConversationListNotifier, AsyncValue<List<Conversation>>>
///   methods: loadInitial() / loadMore() / refresh()
///
/// The preset [preset] state is served from [build]; calls are counted so the
/// retry and first-load paths are verifiable.
class FakeConversationListNotifier extends ConversationListNotifier {
  FakeConversationListNotifier(this.preset);

  final AsyncValue<List<Conversation>> preset;

  int loadInitialCalls = 0;
  int loadMoreCalls = 0;
  int refreshCalls = 0;

  @override
  AsyncValue<List<Conversation>> build() => preset;

  @override
  Future<void> loadInitial() async {
    loadInitialCalls++;
  }

  @override
  Future<void> loadMore() async {
    loadMoreCalls++;
  }

  @override
  Future<void> refresh() async {
    refreshCalls++;
  }
}

Conversation _conversation({
  required String id,
  String type = 'direct',
  String? name,
  List<String> participantIds = const <String>['me', 'peer'],
  String? preview,
  int unread = 0,
  bool archived = false,
}) {
  final ChatMessagePreview? last = preview == null
      ? null
      : ChatMessagePreview(
          'm-$id',
          preview,
          'peer',
          createdAt: DateTime(2026, 10, 3, 1),
        );
  return Conversation(
    id,
    type,
    name: name,
    participantIds: participantIds,
    lastMessage: last,
    unreadCount: unread,
    updatedAt: DateTime(2026, 10, 3, 1, 30),
    isArchived: archived,
  );
}

Future<void> _pumpChatsScreen(
  WidgetTester tester,
  FakeConversationListNotifier notifier,
) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        conversationListProvider.overrideWith(() => notifier),
      ],
      child: const MaterialApp(
        home: ChatsScreen(),
      ),
    ),
  );
}

void main() {
  testWidgets(
    'shows the loading skeleton while conversations load',
    (WidgetTester tester) async {
      final FakeConversationListNotifier notifier =
          FakeConversationListNotifier(
        const AsyncValue<List<Conversation>>.loading(),
      );

      await _pumpChatsScreen(tester, notifier);
      await tester.pump();

      expect(find.byKey(const Key('chats-loading')), findsOneWidget);
      // The screen kicks off the first page on mount (post-frame).
      expect(notifier.loadInitialCalls, 1);
    },
  );

  testWidgets(
    'renders the conversation list',
    (WidgetTester tester) async {
      final FakeConversationListNotifier notifier =
          FakeConversationListNotifier(
        AsyncValue<List<Conversation>>.data(<Conversation>[
          _conversation(
            id: 'c1',
            name: 'Aarav Sharma',
            preview: 'See you at 5',
            unread: 3,
          ),
          // No name + no preview: falls back to participant ids + the
          // "No messages yet" placeholder.
          _conversation(id: 'c2', participantIds: const <String>['me', 'zoya']),
        ]),
      );

      await _pumpChatsScreen(tester, notifier);
      await tester.pump();

      expect(find.text('Aarav Sharma'), findsOneWidget);
      expect(find.text('See you at 5'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('me, zoya'), findsOneWidget);
      expect(find.text('No messages yet'), findsOneWidget);
    },
  );

  testWidgets(
    'shows the error view with a working retry button',
    (WidgetTester tester) async {
      final FakeConversationListNotifier notifier =
          FakeConversationListNotifier(
        AsyncValue<List<Conversation>>.error(
          Exception('network down'),
          StackTrace.empty,
        ),
      );

      await _pumpChatsScreen(tester, notifier);
      await tester.pump();

      expect(find.text("Couldn't load your chats"), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pump();

      expect(notifier.refreshCalls, 1);
    },
  );
}
