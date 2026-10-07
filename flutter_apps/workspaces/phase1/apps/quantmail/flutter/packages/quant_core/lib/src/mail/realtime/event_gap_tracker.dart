// ============================================================================
// quant_core - realtime event gap tracker (M6 prep, W4)
// ============================================================================
//
// Pure, testable gap detection over the per-channel monotonic `sequence`
// published by the staged backend P0-3 ws channels. All three event types
// (`mail.new`, `mail.updated`, `thread.updated`) share ONE per-user channel
// (`mail:{userId}`) and therefore ONE shared sequence stream — a single
// [EventGapTracker] instance per subscribed channel is the correct unit.
//
// Semantics (staged NOTES §3 / §11):
//   - first event on a channel -> [GapDecision.ok]
//   - seq == last + 1           -> [GapDecision.ok] (merge the hint)
//   - seq <= last               -> [GapDecision.duplicate] (stale/retried
//                                  delivery — the caller must ignore it)
//   - seq > last + 1            -> [GapDecision.gap] — the caller must call
//                                  `sync_engine.requestResync()`
//                                  (authoritative catch-up via
//                                  `GET /emails/changes?since=`; a
//                                  `thread.updated` gap forces a full thread
//                                  refetch — no `/threads/changes` exists).
//   - reconnect                 -> resync (no sequence resume on reconnect;
//                                  caller resets or re-observes after resync).
//
// No I/O here by design: the M6 realtime coordinator owns resync/polling.

library;

import 'mail_events.dart';

/// Result of observing one event against a channel's last-seen sequence.
///
/// A const value class (not an `enum` — Dart enum values cannot be
/// parameterized, and `gap` must carry a `missedCount`). The public call
/// sites read like an enum: [GapDecision.ok], [GapDecision.duplicate],
/// [GapDecision.gap].
class GapDecision {
  /// In-order (or first) event — merge the hint.
  static const GapDecision ok = GapDecision._(0, _Kind.ok);

  /// `sequence <= lastSeen` — stale or retried delivery; ignore the event.
  static const GapDecision duplicate = GapDecision._(0, _Kind.duplicate);

  /// Sequence jumped — [missedCount] events were skipped; the caller must
  /// `requestResync()`.
  const GapDecision.gap(this.missedCount) : _kind = _Kind.gap;

  const GapDecision._(this.missedCount, this._kind);

  /// Number of skipped sequence numbers; `0` unless this is a gap.
  final int missedCount;

  final _Kind _kind;

  /// Whether this decision is a gap (resync required).
  bool get isGap => _kind == _Kind.gap;

  /// Whether the event is in-order (merge the hint).
  bool get isOk => _kind == _Kind.ok;

  /// Whether the event is a stale/retried duplicate (ignore it).
  bool get isDuplicate => _kind == _Kind.duplicate;

  @override
  bool operator ==(Object other) =>
      other is GapDecision &&
      other._kind == _kind &&
      other.missedCount == missedCount;

  @override
  int get hashCode => Object.hash(_kind, missedCount);

  @override
  String toString() => 'GapDecision.${_kind.name}'
      '${_kind == _Kind.gap ? '($missedCount)' : ''}';
}

/// Internal discriminator for [GapDecision].
enum _Kind { ok, duplicate, gap }

/// Tracks the last-seen `sequence` per subscribed channel.
///
/// One instance per channel subscription. Pure state machine — no timers,
/// no network, no storage; trivially unit-testable.
class EventGapTracker {
  /// Creates an empty tracker.
  EventGapTracker();

  final Map<String, int> _lastByChannel = {};

  /// Last observed sequence for [channel], or `null` before the first event.
  int? lastSequence(String channel) => _lastByChannel[channel];

  /// Observes [event] received on [channel] and classifies it.
  ///
  /// On [GapDecision.ok] and [GapDecision.gap] the tracker's cursor advances
  /// to `event.sequence` (post-gap events are the new baseline — the missed
  /// range is recovered authoritatively by resync, not by ws replay).
  /// On [GapDecision.duplicate] the cursor does not move.
  GapDecision observe(String channel, MailEvent event) {
    final seq = event.sequence;
    final last = _lastByChannel[channel];
    if (last == null || seq == last + 1) {
      _lastByChannel[channel] = seq;
      return GapDecision.ok;
    }
    if (seq <= last) return GapDecision.duplicate;
    _lastByChannel[channel] = seq;
    return GapDecision.gap(seq - last - 1);
  }

  /// Clears tracked state — all channels, or just [channel].
  ///
  /// Use after an explicit full resync so the next observed event is treated
  /// as a fresh baseline (first-event semantics).
  void reset([String? channel]) {
    if (channel == null) {
      _lastByChannel.clear();
    } else {
      _lastByChannel.remove(channel);
    }
  }
}
