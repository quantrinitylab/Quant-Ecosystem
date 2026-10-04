// ============================================================================
// quant_core - realtime mail events unit tests (M6 prep, W4)
// ============================================================================
//
// Unit tests for the M6 realtime groundwork:
//   - [parseMailEvent]: all three staged zod shapes, NOTES-era aliases,
//     tombstone handling, unknown-type rejection, missing-field rejection.
//   - [EventGapTracker]: first-event ok, in-order ok, duplicate ignored,
//     gap detected with missed count, per-channel independence.
//   - [mailEventChannelName]: locked `mail:{userId}` convention.
//
// These are pure unit tests — no network, no websocket, no timers.
// Run: `flutter test test/mail_events_test.dart` from the package root.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/realtime/realtime.dart';

/// Builds a minimal `mail.updated` event at [sequence] for tracker tests.
MailEvent _updatedEvent(int sequence) => parseMailEvent({
      'channel': 'mail.updated',
      'messageId': 'm-tracker',
      'threadId': 't-tracker',
      'changes': ['read'],
      'sequence': sequence,
    });

void main() {
  group('parseMailEvent', () {
    test('parses mail.new (staged zod shape)', () {
      final event = parseMailEvent({
        'channel': 'mail.new',
        'messageId': 'm-1',
        'threadId': 't-1',
        'folderId': 'inbox',
        'sender': 'ada@example.com',
        'subjectPreview': 'Hello there',
        'receivedAt': '2026-10-03T04:00:00Z',
        'sequence': 7,
        'undoUntil': '2026-10-03T04:00:30Z',
        'sendJobId': 'job-9',
      });

      expect(event, isA<MailNewEvent>());
      final e = event as MailNewEvent;
      expect(e.type, 'mail.new');
      expect(e.sequence, 7);
      expect(e.messageId, 'm-1');
      expect(e.emailId, 'm-1');
      expect(e.threadId, 't-1');
      expect(e.folderId, 'inbox');
      expect(e.sender, 'ada@example.com');
      expect(e.snippet, 'Hello there');
      expect(e.receivedAt, isNotNull);
      expect(e.undoUntil, isNotNull);
      expect(e.sendJobId, 'job-9');
    });

    test('parses mail.new with NOTES-era aliases (from object, emailId)', () {
      final event = parseMailEvent({
        'type': 'mail.new',
        'emailId': 'm-2',
        'threadId': 't-2',
        'folderId': 'inbox',
        'from': {'name': 'Ada', 'address': 'ada@example.com'},
        'snippet': 'preview text',
        'labels': ['INBOX'],
        'receivedAt': '2026-10-03T04:00:00Z',
        'sequence': 8,
      });

      final e = event as MailNewEvent;
      expect(e.type, 'mail.new');
      expect(e.messageId, 'm-2');
      expect(e.emailId, 'm-2');
      expect(e.sender, 'ada@example.com');
      expect(e.fromName, 'Ada');
      expect(e.snippet, 'preview text');
      expect(e.labels, ['INBOX']);
    });

    test('parses mail.updated incl. tombstone + delta values', () {
      final event = parseMailEvent({
        'channel': 'mail.updated',
        'messageId': 'm-3',
        'threadId': 't-3',
        'changes': ['read', 'labels'],
        'sequence': 9,
        'tombstone': true,
        'updatedAt': '2026-10-03T04:01:00Z',
        'read': true,
        'labels': ['INBOX', 'STARRED'],
      });

      final e = event as MailUpdatedEvent;
      expect(e.type, 'mail.updated');
      expect(e.sequence, 9);
      expect(e.changed, {'read', 'labels'});
      expect(e.changes, {'read', 'labels'});
      expect(e.tombstone, isTrue);
      expect(e.updatedAt, isNotNull);
      expect(e.delta['read'], isTrue);
      expect(e.delta['labels'], ['INBOX', 'STARRED']);
      // Envelope keys must not leak into delta.
      expect(e.delta.containsKey('changes'), isFalse);
      expect(e.delta.containsKey('messageId'), isFalse);
    });

    test('parses mail.updated without tombstone (default false)', () {
      final e = parseMailEvent({
        'channel': 'mail.updated',
        'messageId': 'm-4',
        'threadId': 't-4',
        'changes': ['starred'],
        'sequence': 10,
      }) as MailUpdatedEvent;
      expect(e.tombstone, isFalse);
      expect(e.delta, isEmpty);
    });

    test('parses thread.updated with nullable lastMessageId', () {
      final event = parseMailEvent({
        'channel': 'thread.updated',
        'threadId': 't-9',
        'lastMessageId': null,
        'unreadCount': 3,
        'sequence': 11,
      });

      final e = event as ThreadUpdatedEvent;
      expect(e.type, 'thread.updated');
      expect(e.sequence, 11);
      expect(e.threadId, 't-9');
      expect(e.lastMessageId, isNull);
      expect(e.unreadCount, 3);
    });

    test('parses thread.updated with NOTES-era extras', () {
      final e = parseMailEvent({
        'type': 'thread.updated',
        'threadId': 't-10',
        'lastMessageId': 'm-99',
        'lastMessageAt': '2026-10-03T04:02:00Z',
        'emailIds': ['m-97', 'm-98', 'm-99'],
        'snippet': 'thread preview',
        'unreadCount': 1,
        'labels': ['INBOX'],
        'sequence': 12,
      }) as ThreadUpdatedEvent;
      expect(e.lastMessageId, 'm-99');
      expect(e.lastMessageAt, isNotNull);
      expect(e.emailIds, ['m-97', 'm-98', 'm-99']);
      expect(e.snippet, 'thread preview');
      expect(e.labels, ['INBOX']);
    });

    test('rejects unknown event type', () {
      expect(
        () => parseMailEvent({'channel': 'mail.nonexistent', 'sequence': 1}),
        throwsFormatException,
      );
    });

    test('rejects missing discriminator', () {
      expect(
        () => parseMailEvent({'messageId': 'm-1', 'sequence': 1}),
        throwsFormatException,
      );
    });

    test('rejects missing sequence', () {
      expect(
        () => parseMailEvent({'channel': 'mail.new', 'messageId': 'm-1'}),
        throwsFormatException,
      );
    });

    test('rejects missing messageId on mail.updated', () {
      expect(
        () => parseMailEvent({
          'channel': 'mail.updated',
          'changes': ['read'],
          'sequence': 1,
        }),
        throwsFormatException,
      );
    });

    test('keeps the untouched wire map in raw', () {
      final wire = {
        'channel': 'mail.new',
        'messageId': 'm-5',
        'threadId': 't-5',
        'folderId': 'inbox',
        'sender': 'bob@example.com',
        'subjectPreview': 'hi',
        'receivedAt': '2026-10-03T04:00:00Z',
        'sequence': 13,
        'futureField': 'preserved',
      };
      final e = parseMailEvent(wire) as MailNewEvent;
      expect(e.raw['futureField'], 'preserved');
    });
  });

  group('EventGapTracker', () {
    test('first event on a channel is ok', () {
      final tracker = EventGapTracker();
      expect(tracker.lastSequence('mail:u1'), isNull);
      expect(tracker.observe('mail:u1', _updatedEvent(5)), GapDecision.ok);
      expect(tracker.lastSequence('mail:u1'), 5);
    });

    test('in-order event is ok', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      expect(tracker.observe('mail:u1', _updatedEvent(6)), GapDecision.ok);
      expect(tracker.lastSequence('mail:u1'), 6);
    });

    test('duplicate and stale events are ignored, cursor does not move', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      expect(tracker.observe('mail:u1', _updatedEvent(5)), GapDecision.duplicate);
      expect(tracker.observe('mail:u1', _updatedEvent(3)), GapDecision.duplicate);
      expect(tracker.lastSequence('mail:u1'), 5);
    });

    test('gap detected with missed count', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      final decision = tracker.observe('mail:u1', _updatedEvent(8));
      expect(decision, GapDecision.gap(2));
      expect(decision.missedCount, 2);
      // Post-gap event becomes the new baseline (resync recovers the miss).
      expect(tracker.lastSequence('mail:u1'), 8);
    });

    test('gap of one is detected', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      expect(tracker.observe('mail:u1', _updatedEvent(7)), GapDecision.gap(1));
    });

    test('channels are tracked independently', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      expect(tracker.observe('mail:u2', _updatedEvent(100)), GapDecision.ok);
      expect(tracker.lastSequence('mail:u1'), 5);
      expect(tracker.lastSequence('mail:u2'), 100);
      // u1 jumping is a gap even though u2 is far ahead.
      expect(tracker.observe('mail:u1', _updatedEvent(9)), GapDecision.gap(3));
    });

    test('reset clears the baseline', () {
      final tracker = EventGapTracker();
      tracker.observe('mail:u1', _updatedEvent(5));
      tracker.reset('mail:u1');
      expect(tracker.lastSequence('mail:u1'), isNull);
      expect(tracker.observe('mail:u1', _updatedEvent(42)), GapDecision.ok);
    });

    test('GapDecision.ok and duplicate carry missedCount 0', () {
      expect(GapDecision.ok.missedCount, 0);
      expect(GapDecision.duplicate.missedCount, 0);
    });
  });

  group('mailEventChannelName', () {
    test('adopts the locked mail:{userId} convention', () {
      expect(mailEventChannelName('user-123'), 'mail:user-123');
      expect(mailEventChannelName('abc'), isNot(startsWith('mail:inbox:')));
    });
  });
}
