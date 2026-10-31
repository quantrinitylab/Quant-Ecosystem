// ============================================================================
// chat_core - presence store tests (QC-F-015)
//
// [PresenceEvent] is decoded from `presence:update` frames in
// `chat_socket_events.dart` but had ZERO consumers anywhere in the app.
// These tests cover the new consumer side: [PresenceStore] folds presence
// events into app state and never throws on unknown wire statuses.
//
// Stable module-level pattern: the socket transport is never opened —
// [chatEventsProvider] is overridden with a controlled broadcast stream and
// events are pushed through it, exactly the path production events take.

import 'dart:async';

import 'package:chat_core/src/realtime/chat_socket_events.dart';
import 'package:chat_core/src/realtime/presence.dart';
import 'package:chat_core/src/realtime/realtime_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

PresenceEvent _presence({
  required String userId,
  required String status,
  DateTime? lastSeen,
}) =>
    PresenceEvent(userId: userId, status: status, lastSeen: lastSeen);

/// Container whose [chatEventsProvider] is fed by [controller] — the same
/// typed-event stream the real socket pushes into in production.
ProviderContainer _containerWithEventStream(
  StreamController<ChatSocketEvent> controller,
) {
  return ProviderContainer(
    overrides: <Override>[
      chatEventsProvider.overrideWith((Ref ref) => controller.stream),
    ],
  );
}

void main() {
  group('PresenceStatus.fromEvent', () {
    test('maps the known wire statuses', () {
      expect(
        PresenceStatus.fromEvent(
          _presence(userId: 'u1', status: 'online'),
        ).state,
        PresenceState.online,
      );
      expect(
        PresenceStatus.fromEvent(
          _presence(userId: 'u1', status: 'offline'),
        ).state,
        PresenceState.offline,
      );
    });

    test('unknown wire statuses never throw — they become unknown', () {
      final PresenceStatus status = PresenceStatus.fromEvent(
        _presence(userId: 'u1', status: 'invisible'),
      );
      expect(status.state, PresenceState.unknown);
      expect(status.userId, 'u1');
      expect(status.isOnline, isFalse);
    });

    test('empty wire status becomes unknown, not offline', () {
      final PresenceStatus status = PresenceStatus.fromEvent(
        _presence(userId: 'u1', status: ''),
      );
      expect(status.state, PresenceState.unknown);
    });
  });

  group('PresenceStore', () {
    test('starts empty', () {
      final ProviderContainer container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(presenceStoreProvider), isEmpty);
    });

    test('folds presence:update frames from the event stream', () async {
      final StreamController<ChatSocketEvent> controller =
          StreamController<ChatSocketEvent>.broadcast();
      addTearDown(controller.close);
      final ProviderContainer container = _containerWithEventStream(controller);
      addTearDown(container.dispose);

      // Subscribing the store attaches the event listener.
      container.read(presenceStoreProvider);
      final DateTime seen = DateTime.utc(2026, 10, 24, 0, 0, 0);
      controller.add(
        _presence(userId: 'peer-1', status: 'online', lastSeen: seen),
      );
      await Future<void>.delayed(Duration.zero);

      final Map<String, PresenceStatus> state =
          container.read(presenceStoreProvider);
      expect(state['peer-1'], isNotNull);
      expect(state['peer-1']!.isOnline, isTrue);
      expect(state['peer-1']!.lastSeen, seen);
    });

    test('ignores non-presence events', () async {
      final StreamController<ChatSocketEvent> controller =
          StreamController<ChatSocketEvent>.broadcast();
      addTearDown(controller.close);
      final ProviderContainer container = _containerWithEventStream(controller);
      addTearDown(container.dispose);

      container.read(presenceStoreProvider);
      controller.add(
        const TypingIndicatorEvent(
          conversationId: 'c1',
          userId: 'peer-1',
          isTyping: true,
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(container.read(presenceStoreProvider), isEmpty);
    });

    test('ignores events with an empty user id', () async {
      final StreamController<ChatSocketEvent> controller =
          StreamController<ChatSocketEvent>.broadcast();
      addTearDown(controller.close);
      final ProviderContainer container = _containerWithEventStream(controller);
      addTearDown(container.dispose);

      container.read(presenceStoreProvider);
      controller.add(_presence(userId: '', status: 'online'));
      await Future<void>.delayed(Duration.zero);

      expect(container.read(presenceStoreProvider), isEmpty);
    });

    test('an older event never clobbers a newer entry (out-of-order guard)',
        () async {
      final StreamController<ChatSocketEvent> controller =
          StreamController<ChatSocketEvent>.broadcast();
      addTearDown(controller.close);
      final ProviderContainer container = _containerWithEventStream(controller);
      addTearDown(container.dispose);

      container.read(presenceStoreProvider);
      final DateTime newer = DateTime.utc(2026, 10, 24, 0, 5, 0);
      final DateTime older = DateTime.utc(2026, 10, 24, 0, 1, 0);
      controller.add(
        _presence(userId: 'peer-1', status: 'offline', lastSeen: newer),
      );
      await Future<void>.delayed(Duration.zero);
      // A stale re-delivery arrives late: it must not resurrect state.
      controller.add(
        _presence(userId: 'peer-1', status: 'online', lastSeen: older),
      );
      await Future<void>.delayed(Duration.zero);

      final PresenceStatus? status =
          container.read(presenceStoreProvider)['peer-1'];
      expect(status, isNotNull);
      expect(status!.state, PresenceState.offline);
      expect(status.lastSeen, newer);
    });

    test('userPresenceProvider resolves a single user', () async {
      final StreamController<ChatSocketEvent> controller =
          StreamController<ChatSocketEvent>.broadcast();
      addTearDown(controller.close);
      final ProviderContainer container = _containerWithEventStream(controller);
      addTearDown(container.dispose);

      // Subscribe first — broadcast streams drop events with no listener.
      container.read(presenceStoreProvider);
      controller.add(_presence(userId: 'peer-9', status: 'online'));
      await Future<void>.delayed(Duration.zero);

      final PresenceStatus? status =
          container.read(userPresenceProvider('peer-9'));
      expect(status, isNotNull);
      expect(status!.isOnline, isTrue);
      expect(container.read(userPresenceProvider('ghost')), isNull);
    });
  });

  group('lastSeenLabel', () {
    test('online is always "Online"', () {
      const PresenceStatus s = PresenceStatus(
        userId: 'u1',
        state: PresenceState.online,
      );
      expect(
        s.lastSeenLabel(now: DateTime.utc(2026, 10, 24)),
        'Online',
      );
    });

    test('offline without lastSeen is "Offline"', () {
      const PresenceStatus s = PresenceStatus(
        userId: 'u1',
        state: PresenceState.offline,
      );
      expect(
        s.lastSeenLabel(now: DateTime.utc(2026, 10, 24)),
        'Offline',
      );
    });

    test('relative buckets for offline with lastSeen', () {
      final DateTime now = DateTime.utc(2026, 10, 24, 12, 0, 0);
      PresenceStatus s(DateTime seen) => PresenceStatus(
            userId: 'u1',
            state: PresenceState.offline,
            lastSeen: seen,
          );
      expect(
        s(now.subtract(const Duration(seconds: 30)))
            .lastSeenLabel(now: now),
        'Last seen just now',
      );
      expect(
        s(now.subtract(const Duration(minutes: 5)))
            .lastSeenLabel(now: now),
        'Last seen 5m ago',
      );
      expect(
        s(now.subtract(const Duration(hours: 3)))
            .lastSeenLabel(now: now),
        'Last seen 3h ago',
      );
      expect(
        s(now.subtract(const Duration(days: 2)))
            .lastSeenLabel(now: now),
        'Last seen 2d ago',
      );
    });
  });
}
