// ============================================================================
// quantai_core - Audit trail (Sentinel)
// ============================================================================
//
// Append-only, tamper-evident log of every agent action, approval,
// credential operation and payment (QuantAI Sentinel, cf.
// QUANTAI_BLUEPRINT §3.2). The append-only property is enforced by the API
// surface: [AuditTrail] exposes `append` and read-only consumption only —
// there is no edit, delete or clear API.
//
// Trust rules:
// - `actorUserId` is the SESSION identity, bound from [actorUserIdProvider];
//   `append` takes no actor argument, so a caller can never forge it.
// - `detailsHash` is an FNV-1a 64 hash over canonicalized details. Details
//   themselves stay out of the event (the sink may persist them separately);
//   the hash makes later tampering evident.
//   NOTE: FNV-1a is tamper-evidence against accidental corruption, not a
//   cryptographic commitment. Foundation ships `crypto` but does not
//   re-export it, and adding a direct dependency was judged unnecessary for
//   shift 1; promote to SHA-256 when `crypto` becomes a direct dependency.
// - [AuditSink] is the persistence hook (default: in-memory).

import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What kind of security-relevant occurrence this event records.
enum AuditEventKind {
  /// An agent action was proposed/executed (tool call, API write, ...).
  action,

  /// An approval-card decision (approved / denied / expired).
  approval,

  /// A credential vault operation (store / delete / OTP issue / consume).
  credential,

  /// A Quant Pay / spending flow step (cf. blueprint §3.8).
  payment,
}

/// The Sentinel decision recorded for the event.
enum AuditDecision {
  /// The action was allowed (ordinary tier, or approved sensitive tier).
  allowed,

  /// The action was denied (policy, user denial, or doubt → deny).
  denied,

  /// The action was executed after approval.
  executed,

  /// The action failed during execution.
  failed,

  /// The approval / handle expired before a decision.
  expired,
}

/// A single immutable audit record.
///
/// All fields are final; instances are created only by [AuditTrail.append],
/// which assigns the monotonic [seq] and the session [actorUserId].
class AuditEvent {
  /// Monotonic sequence number within this trail (0, 1, 2, ...).
  final int seq;

  /// Event time, always UTC.
  final DateTime timestamp;

  /// Session identity that performed the action. Bound from
  /// [actorUserIdProvider] — never client-supplied.
  final String actorUserId;

  /// Stable identifier of the action/approval this event belongs to
  /// (e.g. the approval-card id or tool-call id).
  final String actionId;

  /// Category of the occurrence.
  final AuditEventKind kind;

  /// The Sentinel decision.
  final AuditDecision decision;

  /// Hex FNV-1a 64 hash over the canonicalized details map. Tamper-evident:
  /// recompute from the details to verify the event was not altered.
  final String detailsHash;

  AuditEvent({
    required this.seq,
    required DateTime timestamp,
    required this.actorUserId,
    required this.actionId,
    required this.kind,
    required this.decision,
    required this.detailsHash,
  })  : timestamp = timestamp.toUtc(),
        assert(seq >= 0, 'AuditEvent seq must be non-negative.');

  @override
  String toString() =>
      'AuditEvent(seq: $seq, kind: $kind, decision: $decision, '
      'actionId: $actionId, actor: $actorUserId)';
}

/// Persistence hook for the trail.
///
/// Called with each newly appended batch (one event in the current
/// implementation). Implementations must be append-only themselves.
///
/// The default sink is in-memory; a durable (encrypted-store / backend)
/// sink lands with the proactive program's Activity-log work.
abstract class AuditSink {
  /// Persists [events] (always newly appended events, in seq order).
  Future<void> persist(List<AuditEvent> events);
}

/// Default in-memory sink: keeps appended events for the session.
class InMemoryAuditSink implements AuditSink {
  /// All events received so far, in seq order.
  final List<AuditEvent> events = [];

  @override
  Future<void> persist(List<AuditEvent> newEvents) async {
    events.addAll(newEvents);
  }
}

/// Session identity bound to every audit event.
///
/// `append` reads this provider — it takes no actor argument — so callers
/// can never forge or override the recorded identity. Override per session
/// in tests: `actorUserIdProvider.overrideWithValue('user-123')`.
final actorUserIdProvider = Provider<String>(
  (ref) => 'anonymous',
  name: 'actorUserIdProvider',
);

/// Persistence hook for the trail (override with a durable sink).
final auditSinkProvider = Provider<AuditSink>(
  (ref) => InMemoryAuditSink(),
  name: 'auditSinkProvider',
);

/// Append-only audit trail.
///
/// State is the full event list in seq order. The ONLY mutating operation
/// is [append]; there is no edit / delete / clear API. Consumers read via
/// the notifier state, [watchEvents], or [auditEventsProvider] — all
/// read-only.
class AuditTrail extends Notifier<List<AuditEvent>> {
  final StreamController<List<AuditEvent>> _eventsController =
      StreamController<List<AuditEvent>>.broadcast();

  @override
  List<AuditEvent> build() {
    ref.onDispose(_eventsController.close);
    return const [];
  }

  /// Appends one event. Assigns the next monotonic [AuditEvent.seq], binds
  /// the session [actorUserIdProvider] identity, stamps UTC time, hashes the
  /// details, and forwards the event to the [auditSinkProvider] sink.
  Future<void> append({
    required String actionId,
    required AuditEventKind kind,
    required AuditDecision decision,
    Map<String, Object?>? details,
    DateTime? timestamp,
  }) async {
    final event = AuditEvent(
      seq: state.isEmpty ? 0 : state.last.seq + 1,
      timestamp: timestamp ?? DateTime.now(),
      actorUserId: ref.read(actorUserIdProvider),
      actionId: actionId,
      kind: kind,
      decision: decision,
      detailsHash: _hashDetails(details ?? const {}),
    );
    state = [...state, event];
    _eventsController.add(state);
    await ref.read(auditSinkProvider).persist([event]);
  }

  /// Read-only activity-log contract for the proactive program (Activity log
  /// UI): a stream of the event list, optionally filtered to events at or
  /// after [since]. Emits the current snapshot first, then every append.
  ///
  /// The forwarding subscription is established synchronously inside
  /// `onListen`, so no append made after `.listen()` returns can be missed
  /// (a broadcast controller drops events for not-yet-subscribed listeners).
  ///
  /// No mutating API is exposed here — proactive consumers can watch only.
  Stream<List<AuditEvent>> watchEvents({DateTime? since}) {
    late final StreamSubscription<List<AuditEvent>> forward;
    final out = StreamController<List<AuditEvent>>();
    out.onListen = () {
      // Current snapshot first, then live appends.
      out.add(_filterSince(state, since));
      forward = _eventsController.stream.listen(
        (events) => out.add(_filterSince(events, since)),
        onDone: out.close,
      );
    };
    out.onCancel = () => forward.cancel();
    return out.stream;
  }

  List<AuditEvent> _filterSince(List<AuditEvent> events, DateTime? since) {
    final cutoff = since?.toUtc();
    if (cutoff == null) return events;
    return events.where((e) => !e.timestamp.isBefore(cutoff)).toList();
  }
}

/// The shared trail. Override-friendly in tests.
final auditTrailProvider = NotifierProvider<AuditTrail, List<AuditEvent>>(
  AuditTrail.new,
  name: 'auditTrailProvider',
);

/// Read-only activity-log stream for proactive consumers (Activity log UI).
///
/// Watches [auditTrailProvider] — no mutating API exists on this provider,
/// so the proactive program can observe but never alter the trail.
final auditEventsProvider = StreamProvider<List<AuditEvent>>(
  (ref) => ref.watch(auditTrailProvider.notifier).watchEvents(),
  name: 'auditEventsProvider',
);

// -- Tamper-evidence hashing --------------------------------------------------

/// FNV-1a 64-bit hash rendered as 16 lowercase hex chars.
String _fnv1a64(String input) {
  var hash = 0xcbf29ce484222325;
  for (final byte in utf8.encode(input)) {
    hash ^= byte;
    hash = (hash * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF;
  }
  return hash.toRadixString(16).padLeft(16, '0');
}

/// Canonical string form of a details map: keys sorted, values encoded
/// recursively. Equal maps → equal strings → equal hashes, regardless of
/// insertion order.
String _canonicalize(Object? value) {
  if (value == null) return 'null';
  if (value is String) return jsonEncode(value);
  if (value is num || value is bool) return value.toString();
  if (value is List) {
    return '[${value.map(_canonicalize).join(',')}]';
  }
  if (value is Map) {
    final keys = value.keys.map((k) => k.toString()).toList()..sort();
    final parts = keys.map((k) {
      final originalKey =
          value.keys.firstWhere((candidate) => candidate.toString() == k);
      return '${jsonEncode(k)}:${_canonicalize(value[originalKey])}';
    });
    return '{${parts.join(',')}}';
  }
  return jsonEncode(value.toString());
}

/// Tamper-evidence hash for an event's details map.
String _hashDetails(Map<String, Object?> details) =>
    _fnv1a64(_canonicalize(details));
