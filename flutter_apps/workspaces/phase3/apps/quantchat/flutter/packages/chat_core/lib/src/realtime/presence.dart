// ============================================================================
// chat_core - presence state (QuantChat, QC-F-015)
//
// Root cause of QC-F-015's presence half: `PresenceEvent` was decoded from
// `presence:update` frames (chat_socket_events.dart) but had ZERO consumers
// anywhere in the app — online/last-seen never reached any UI.
//
// This file is the consumer side. [PresenceStore] folds every [PresenceEvent]
// off the shared [chatEventsProvider] stream into a userId-keyed map, so any
// widget can read a peer's presence with [userPresenceProvider]. Out-of-order
// frames can never resurrect stale state (newer `lastSeen` wins), unknown
// wire statuses degrade to [PresenceState.unknown] instead of throwing, and
// events with an empty user id are dropped — the socket's fail-soft contract
// (W4) is preserved all the way up.
//
// No transport is opened here: the store only *listens* to the existing
// event stream. It stays inert until the app layer calls
// `ChatSocket.connect()` after login (realtime_providers.dart).
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'chat_socket_events.dart';
import 'realtime_providers.dart';

/// Normalized presence of one user.
///
/// The wire `status` is a free-form string (backend contract only defines
/// `online` on connect and `offline` on last-device disconnect); anything
/// else degrades to [PresenceState.unknown] — never an exception.
enum PresenceState {
  /// The user has at least one live socket.
  online,

  /// The user's last device disconnected.
  offline,

  /// A wire status the client does not recognise yet.
  unknown,
}

/// One user's current presence, folded from [PresenceEvent] frames.
class PresenceStatus {
  /// The user this presence belongs to.
  final String userId;

  /// Normalized state.
  final PresenceState state;

  /// Freshness of the last update (30 s per the backend contract); null when
  /// the server sent none.
  final DateTime? lastSeen;

  /// Creates a presence status.
  const PresenceStatus({
    required this.userId,
    required this.state,
    this.lastSeen,
  });

  /// Builds a status from a decoded `presence:update` frame. Never throws:
  /// `'online'` → [PresenceState.online], `'offline'` → [PresenceState.offline],
  /// anything else (including empty) → [PresenceState.unknown].
  factory PresenceStatus.fromEvent(PresenceEvent event) {
    final PresenceState state = switch (event.status.trim().toLowerCase()) {
      'online' => PresenceState.online,
      'offline' => PresenceState.offline,
      _ => PresenceState.unknown,
    };
    return PresenceStatus(
      userId: event.userId,
      state: state,
      lastSeen: event.lastSeen,
    );
  }

  /// Convenience: `true` only for [PresenceState.online].
  bool get isOnline => state == PresenceState.online;

  /// Human-readable line for conversation headers, e.g. "Online",
  /// "Last seen 5m ago", "Offline".
  ///
  /// [now] is injectable so tests and previews are deterministic.
  String lastSeenLabel({DateTime? now}) {
    if (isOnline) return 'Online';
    final DateTime? seen = lastSeen;
    if (seen == null) {
      return state == PresenceState.offline ? 'Offline' : '';
    }
    final DateTime ref = now ?? DateTime.now().toUtc();
    final Duration age = ref.difference(seen.toUtc());
    if (age.isNegative || age < const Duration(minutes: 1)) {
      return 'Last seen just now';
    }
    if (age < const Duration(hours: 1)) {
      return 'Last seen ${age.inMinutes}m ago';
    }
    if (age < const Duration(days: 1)) {
      return 'Last seen ${age.inHours}h ago';
    }
    return 'Last seen ${age.inDays}d ago';
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PresenceStatus &&
          other.userId == userId &&
          other.state == state &&
          other.lastSeen == lastSeen;

  @override
  int get hashCode => Object.hash(userId, state, lastSeen);

  @override
  String toString() =>
      'PresenceStatus(userId: $userId, state: $state, lastSeen: $lastSeen)';
}

/// Folds `presence:update` frames into a userId-keyed presence map.
///
/// The subscription is attached in [build] via the shared
/// [chatEventsProvider] stream — the same typed-event stream the socket
/// pushes into in production, and the same one tests override with a
/// controlled broadcast stream. No socket is opened by this store.
class PresenceStore extends Notifier<Map<String, PresenceStatus>> {
  @override
  Map<String, PresenceStatus> build() {
    ref.listen<AsyncValue<ChatSocketEvent>>(chatEventsProvider,
        (AsyncValue<ChatSocketEvent>? previous,
            AsyncValue<ChatSocketEvent> next) {
      final ChatSocketEvent? event = next.valueOrNull;
      if (event is PresenceEvent) {
        apply(event);
      }
    });
    return const <String, PresenceStatus>{};
  }

  /// Applies one decoded `presence:update` frame.
  ///
  /// - Empty [PresenceEvent.userId] is dropped (defensive parse can yield it).
  /// - Newer-wins: when both the stored entry and the event carry [lastSeen],
  ///   an older frame never clobbers a newer entry (out-of-order delivery).
  /// - A newer frame always replaces the entry, even when it carries no
  ///   [lastSeen] — absence of a timestamp must not pin stale state.
  void apply(PresenceEvent event) {
    final String userId = event.userId;
    if (userId.isEmpty) return;
    final PresenceStatus incoming = PresenceStatus.fromEvent(event);
    final PresenceStatus? current = state[userId];
    final DateTime? currentSeen = current?.lastSeen;
    final DateTime? incomingSeen = incoming.lastSeen;
    if (currentSeen != null &&
        incomingSeen != null &&
        incomingSeen.isBefore(currentSeen)) {
      return;
    }
    state = <String, PresenceStatus>{...state, userId: incoming};
  }
}

/// The shared presence map: user id → [PresenceStatus].
///
/// Override-friendly like the rest of the graph: tests override
/// [chatEventsProvider] (or this provider directly) and the UI follows.
final presenceStoreProvider =
    NotifierProvider<PresenceStore, Map<String, PresenceStatus>>(
  PresenceStore.new,
  name: 'presenceStoreProvider',
);

/// One user's presence, `null` when nothing has been heard about them yet.
final userPresenceProvider = Provider.family<PresenceStatus?, String>(
  (Ref ref, String userId) => ref.watch(presenceStoreProvider)[userId],
  name: 'userPresenceProvider',
);
