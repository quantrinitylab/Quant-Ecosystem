// ============================================================================
// quant_chat - presence dot widget tests (QC-F-015)
//
// The chat list tile consumes [userPresenceProvider]: a direct conversation
// whose peer is online paints the emerald presence dot on the avatar. The
// store is overridden with a seeded fake — no socket, no network.

import 'package:chat_core/src/chat/chat.dart';
import 'package:chat_core/src/realtime/realtime.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_chat/src/screens/chats_screen.dart';

/// Test double for the `PresenceStore` contract:
///
///   NotifierProvider<PresenceStore, Map<String, PresenceStatus>>
///
/// Serves the preset map from [build]; the real socket stream is never
/// touched.
class FakePresenceStore extends PresenceStore {
  FakePresenceStore(this.preset);

  final Map<String, PresenceStatus> preset;

  @override
  Map<String, PresenceStatus> build() => preset;
}

Conversation _conversation({
  required String id,
  String type = 'direct',
  List<String> participantIds = const <String>['peer-1'],
}) {
  return Conversation(
    id,
    type,
    name: 'Peer One',
    participantIds: participantIds,
    unreadCount: 0,
    updatedAt: DateTime(2026, 10, 3, 1, 30),
  );
}

class _FakeConversationListNotifier extends ConversationListNotifier {
  _FakeConversationListNotifier(this.preset);

  final AsyncValue<List<Conversation>> preset;

  @override
  AsyncValue<List<Conversation>> build() => preset;

  // The screen kicks off the first page on mount; like the sibling fake in
  // chats_screen_test.dart these are counted no-ops — no network, ever.
  @override
  Future<void> loadInitial() async {}

  @override
  Future<void> loadMore() async {}

  @override
  Future<void> refresh() async {}
}

Future<void> _pump(
  WidgetTester tester, {
  required List<Conversation> conversations,
  required Map<String, PresenceStatus> presence,
}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        conversationListProvider.overrideWith(
          () => _FakeConversationListNotifier(
            AsyncValue<List<Conversation>>.data(conversations),
          ),
        ),
        presenceStoreProvider.overrideWith(
          () => FakePresenceStore(presence),
        ),
      ],
      child: const MaterialApp(
        home: ChatsScreen(),
      ),
    ),
  );
}

void main() {
  testWidgets(
    'paints the online dot when the direct peer is online',
    (WidgetTester tester) async {
      await _pump(
        tester,
        conversations: <Conversation>[_conversation(id: 'c1')],
        presence: const <String, PresenceStatus>{
          'peer-1': PresenceStatus(
            userId: 'peer-1',
            state: PresenceState.online,
          ),
        },
      );
      await tester.pump();

      expect(find.byKey(const Key('presence-online-dot')), findsOneWidget);
    },
  );

  testWidgets(
    'no online dot when the peer is offline or unknown',
    (WidgetTester tester) async {
      await _pump(
        tester,
        conversations: <Conversation>[_conversation(id: 'c1')],
        presence: const <String, PresenceStatus>{
          'peer-1': PresenceStatus(
            userId: 'peer-1',
            state: PresenceState.offline,
          ),
        },
      );
      await tester.pump();

      expect(find.byKey(const Key('presence-online-dot')), findsNothing);
    },
  );

  testWidgets(
    'no online dot without any presence entry',
    (WidgetTester tester) async {
      await _pump(
        tester,
        conversations: <Conversation>[_conversation(id: 'c1')],
        presence: const <String, PresenceStatus>{},
      );
      await tester.pump();

      expect(find.byKey(const Key('presence-online-dot')), findsNothing);
    },
  );

  testWidgets(
    'no online dot on group conversations',
    (WidgetTester tester) async {
      await _pump(
        tester,
        conversations: <Conversation>[
          _conversation(
            id: 'g1',
            type: 'group',
            participantIds: const <String>['peer-1', 'peer-2'],
          ),
        ],
        presence: const <String, PresenceStatus>{
          'peer-1': PresenceStatus(
            userId: 'peer-1',
            state: PresenceState.online,
          ),
        },
      );
      await tester.pump();

      // Presence is per-user; group rows deliberately show no dot.
      expect(find.byKey(const Key('presence-online-dot')), findsNothing);
    },
  );
}
