// ============================================================================
// quant_core - realtime mail event transport seam (M6 prep, W4)
// ============================================================================
//
// The TRANSPORT seam for realtime mail events. M6 wires a real implementation
// (ws client) against the staged backend P0-3 contract; until then this file
// deliberately ships NO fake websocket — [mailEventSourceProvider] throws
// [UnimplementedError] unless overridden in tests or at wiring time.
//
// TODO(UNVERIFIED): staged P0-3 adds the ws route at merge — `GET /ws/mail`
// per NOTES §11.2 (handshake `?token=<JWT>&app=quantmail`; token resolution
// order `?token=` → cookie → `Authorization: Bearer`; subscribe envelope,
// exact path, and heartbeat/reconnect params all merge-time finalize).
// Wire the concrete [MailEventSource] then; keep this seam's signature
// stable.

library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mail_events.dart';

/// Transport seam: a subscription to one per-user mail channel.
///
/// The channel carries all three event types (`mail.new`, `mail.updated`,
/// `thread.updated`) on a single per-channel monotonic `sequence` stream —
/// feed [Stream] items through `EventGapTracker` before merging hints.
abstract class MailEventSource {
  /// Opens a subscription to [channel] (see [mailEventChannelName]) and
  /// emits parsed [MailEvent]s as they arrive. Malformed frames must surface
  /// as stream errors, never as crashes.
  Stream<MailEvent> events(String channel);

  /// Closes every open subscription and releases transport resources.
  Future<void> close();
}

/// Builds the per-user channel name LOCKED with backend-prep this shift:
/// `mail:{userId}` — NOT any `mail:inbox:{id}` form (NOTES §11.12, §3 TODO 3).
///
/// The client derives [userId] from its authenticated session (e.g. the
/// OAuth subject claim); the staged server ALSO derives it from the
/// handshake JWT (NOTES §7). Naming risk: if the server's userId namespace
/// (internal DB id) differs from what the client can derive (OAuth `sub`),
/// the channel strings won't match — merge must confirm the client-visible
/// userId source (JWT `sub` claim vs a `/me` lookup).
String mailEventChannelName(String userId) => 'mail:$userId';

/// Override-required wiring point for the realtime transport.
///
/// Defaults to throwing [UnimplementedError] — an honest stub: M6 (or tests)
/// must `overrideWithValue` a real [MailEventSource]. There is deliberately
/// no default websocket implementation in this package.
final mailEventSourceProvider = Provider<MailEventSource>(
  (ref) => throw UnimplementedError(
    'mailEventSourceProvider: no MailEventSource bound — wire the '
    '/ws/mail transport (staged P0-3, merge-time) or override in tests.',
  ),
  name: 'mailEventSourceProvider',
);
