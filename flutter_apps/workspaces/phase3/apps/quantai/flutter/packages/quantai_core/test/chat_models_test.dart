// W1 chat data layer — defensive model parsing tests.

import 'package:flutter_test/flutter_test.dart';
import 'package:quantai_core/quantai_core.dart';

void main() {
  group('ChatRole.fromString', () {
    test('parses known roles case-insensitively', () {
      expect(ChatRole.fromString('user'), ChatRole.user);
      expect(ChatRole.fromString('USER'), ChatRole.user);
      expect(ChatRole.fromString('assistant'), ChatRole.assistant);
      expect(ChatRole.fromString('system'), ChatRole.system);
    });

    test('falls back to system for unknown / missing roles', () {
      expect(ChatRole.fromString('bot'), ChatRole.system);
      expect(ChatRole.fromString(''), ChatRole.system);
      expect(ChatRole.fromString(null), ChatRole.system);
      expect(ChatRole.fromString(42), ChatRole.system);
    });
  });

  group('MessageFeedback.fromString', () {
    test('parses the spec vocabulary', () {
      expect(MessageFeedback.fromString('POSITIVE'), MessageFeedback.positive);
      expect(MessageFeedback.fromString('NEGATIVE'), MessageFeedback.negative);
      expect(MessageFeedback.fromString('positive'), MessageFeedback.positive);
    });

    test('null stays null, unknown becomes none', () {
      expect(MessageFeedback.fromString(null), isNull);
      expect(MessageFeedback.fromString('MAYBE'), MessageFeedback.none);
    });

    test('wireValue round-trips', () {
      expect(MessageFeedback.positive.wireValue, 'POSITIVE');
      expect(MessageFeedback.negative.wireValue, 'NEGATIVE');
      expect(MessageFeedback.none.wireValue, isNull);
    });
  });

  group('ChatSession.fromJson (defensive)', () {
    test('parses a full payload', () {
      final session = ChatSession.fromJson({
        'id': 's1',
        'title': 'Deep work',
        'model': 'quant-1',
        'createdAt': '2026-10-03T00:00:00Z',
        'pinned': true,
        'messageCount': 7,
      });
      expect(session.id, 's1');
      expect(session.title, 'Deep work');
      expect(session.model, 'quant-1');
      expect(session.createdAt, isNotNull);
      expect(session.pinned, isTrue);
      expect(session.messageCount, 7);
    });

    test('missing fields fall back to defaults, never throws', () {
      final session = ChatSession.fromJson({});
      expect(session.id, '');
      expect(session.title, 'Untitled');
      expect(session.model, isNull);
      expect(session.createdAt, isNull);
      expect(session.pinned, isFalse);
      expect(session.messageCount, isNull);
    });

    test('wrong types are coerced, never throws', () {
      final session = ChatSession.fromJson({
        'id': 42,
        'title': 123,
        'pinned': 'true',
        'messageCount': '9',
        'createdAt': 'not-a-date',
      });
      expect(session.id, '42');
      expect(session.title, '123');
      expect(session.pinned, isTrue);
      expect(session.messageCount, 9);
      expect(session.createdAt, isNull);
    });

    test('copyWith', () {
      const session = ChatSession(id: 's1', title: 'A');
      final pinned = session.copyWith(pinned: true, title: 'B');
      expect(pinned.pinned, isTrue);
      expect(pinned.title, 'B');
      expect(pinned.id, 's1');
    });
  });

  group('ChatMessage.fromJson (defensive)', () {
    test('parses a full payload', () {
      final message = ChatMessage.fromJson({
        'id': 'm1',
        'sessionId': 's1',
        'role': 'assistant',
        'content': 'Hello',
        'feedback': 'POSITIVE',
      });
      expect(message.id, 'm1');
      expect(message.sessionId, 's1');
      expect(message.role, ChatRole.assistant);
      expect(message.content, 'Hello');
      expect(message.feedback, MessageFeedback.positive);
      expect(message.isStreaming, isFalse);
    });

    test('missing/unknown fields never throw', () {
      final message = ChatMessage.fromJson({'id': 'm1'});
      expect(message.role, ChatRole.system);
      expect(message.content, '');
      expect(message.feedback, isNull);
    });
  });

  group('ChatPage.fromJson (defensive)', () {
    const item = {'id': 's1', 'title': 'One'};

    test('bare list payload', () {
      final page = ChatPage<ChatSession>.fromJson(
        [item, item],
        ChatSession.fromJson,
      );
      expect(page.items, hasLength(2));
      expect(page.page, 1);
      expect(page.pageSize, 20);
    });

    test('map payload with items + pagination', () {
      final page = ChatPage<ChatSession>.fromJson(
        {
          'items': [item],
          'page': 2,
          'pageSize': 10,
          'hasMore': true,
        },
        ChatSession.fromJson,
      );
      expect(page.items, hasLength(1));
      expect(page.page, 2);
      expect(page.pageSize, 10);
      expect(page.hasMore, isTrue);
    });

    test('envelope payload with data list', () {
      final page = ChatPage<ChatSession>.fromJson(
        {
          'success': true,
          'data': [item, item, item],
        },
        ChatSession.fromJson,
      );
      expect(page.items, hasLength(3));
    });

    test('non-list, non-map payload yields an empty page', () {
      final page =
          ChatPage<ChatSession>.fromJson('garbage', ChatSession.fromJson);
      expect(page.items, isEmpty);
      expect(page.hasMore, isFalse);
    });

    test('non-map entries are skipped, not fatal', () {
      final page = ChatPage<ChatSession>.fromJson(
        [item, 'nope', 42],
        ChatSession.fromJson,
      );
      expect(page.items, hasLength(1));
    });
  });

  group('parseStreamFrame', () {
    test('extracts text from known JSON keys in priority order', () {
      expect(parseStreamFrame('{"content":"hello"}'), 'hello');
      expect(parseStreamFrame('{"delta":" world"}'), ' world');
      expect(parseStreamFrame('{"text":"t"}'), 't');
      expect(parseStreamFrame('{"message":"m"}'), 'm');
      // content wins over delta when both are present.
      expect(
        parseStreamFrame('{"delta":"d","content":"c"}'),
        'c',
      );
    });

    test('raw text passes through', () {
      expect(parseStreamFrame('plain text'), 'plain text');
      expect(parseStreamFrame('{not json'), '{not json');
      expect(parseStreamFrame(''), '');
    });

    test('JSON without a text key falls back to the raw frame', () {
      const frame = '{"foo":1}';
      expect(parseStreamFrame(frame), frame);
    });
  });
}
