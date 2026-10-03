// ============================================================================
// quant_core - outbox operation model (M6: modifier queue, W2)
//
// [OutboxAction] maps 1:1 to real server mutations — the action strings are
// copied EXACTLY from the backend contract, never invented:
//
// - `markRead`, `markUnread`, `archive`, `delete` are actions of the
//   `batchActionSchema` accepted by `POST /emails/batch` (repaired spec
//   L25567; see [EmailsApi.batch]). The drainer sends one batch request
//   per op: `{'action': <wireName>, 'emailIds': [...]}`.
// - `unarchive` has NO batch action in `batchActionSchema` (only
//   `markRead`, `markUnread`, `archive`, `delete`, `star`, `unstar`), so it
//   drains through the dedicated `POST /emails/{id}/unarchive` endpoint
//   ([EmailsApi.unarchive], spec L18870), one call per email id. Its
//   [OutboxAction.batchWireName] is therefore `null` — mapping it to a
//   batch string would be inventing a wire name.
// - `send` drains through `POST /emails/compose` (repaired spec L17853,
//   [ComposeApi.composeRaw]) with the stored payload passed through
//   byte-equivalent — a send op legitimately carries NO email ids (the
//   message doesn't exist server-side yet); its `batchWireName` is `null`.
// - `undoSend` drains through `POST /emails/{id}/undo-send` (spec L18922,
//   [ComposeApi.undoSend]), one call per email id, like `unarchive`;
//   `batchWireName` is `null`.
//
// [OutboxOp] is the serializable unit the [OutboxStore] persists; the table
// stores [OutboxAction.name] (stable across renames of the wire mapping)
// and the drainer resolves the wire name at send time.
import 'dart:convert';
import 'dart:math';

/// Server mutations the outbox can carry.
///
/// Wire-name mapping is exact per the backend contract (see module doc).
enum OutboxAction {
  /// `POST /emails/batch` with `{'action': 'markRead', ...}`.
  markRead,

  /// `POST /emails/batch` with `{'action': 'markUnread', ...}`.
  markUnread,

  /// `POST /emails/batch` with `{'action': 'archive', ...}`.
  archive,

  /// `POST /emails/batch` with `{'action': 'delete', ...}`.
  delete,

  /// No batch action exists — drains via `POST /emails/{id}/unarchive`.
  unarchive,

  /// No batch action exists — drains via `POST /emails/compose` with the
  /// stored payload passed through byte-equivalent. A send op legitimately
  /// carries no email ids (the message doesn't exist server-side yet).
  send,

  /// No batch action exists — drains via `POST /emails/{id}/undo-send`,
  /// one call per email id.
  undoSend;

  /// The exact `action` string for `POST /emails/batch`, or `null` when the
  /// action has no batch wire name ([unarchive]).
  String? get batchWireName {
    switch (this) {
      case OutboxAction.markRead:
        return 'markRead';
      case OutboxAction.markUnread:
        return 'markUnread';
      case OutboxAction.archive:
        return 'archive';
      case OutboxAction.delete:
        return 'delete';
      case OutboxAction.unarchive:
        return null;
      case OutboxAction.send:
        return null;
      case OutboxAction.undoSend:
        return null;
    }
  }

  /// Parses the [OutboxAction] stored by [OutboxOp.toJson] (`name`-based).
  static OutboxAction fromName(String name) => OutboxAction.values.firstWhere(
        (a) => a.name == name,
        orElse: () => throw ArgumentError('Unknown OutboxAction: $name'),
      );
}

/// Lifecycle state of an [OutboxOp]; mirrors the `state` column strings.
enum OutboxState {
  /// Waiting for (or currently inside) a drain pass.
  pending,

  /// Server confirmed; reaped by the drainer after recording.
  dispatched,

  /// Permanently failed (4xx or poison-op) — awaiting user retry/discard.
  failed;

  /// The exact string stored in the `state` column.
  String get wireName => name;

  /// Parses a stored state string.
  static OutboxState fromWireName(String wire) => OutboxState.values.firstWhere(
        (s) => s.name == wire,
        orElse: () => throw ArgumentError('Unknown OutboxState: $wire'),
      );
}

/// Generates an RFC 4122 uuid v4 (cryptographic randomness).
///
/// No `uuid` package is declared in this package's pubspec, so ids are
/// minted locally instead of adding a dependency for one call site.
String newOutboxOpId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex =
      bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20, 32)}';
}

/// One deferred server mutation in the persistent outbox.
///
/// Written to SQLite BEFORE any network attempt (write-ahead): killing the
/// app between the local optimistic flip and the drain loses nothing.
class OutboxOp {
  /// Creates an op. [opId] defaults to a fresh uuid v4; [createdAt]
  /// defaults to now (UTC).
  OutboxOp({
    String? opId,
    required this.idempotencyKey,
    required this.action,
    required this.emailIds,
    this.payloadJson,
    DateTime? createdAt,
    this.attempts = 0,
    this.state = OutboxState.pending,
  })  : opId = opId ?? newOutboxOpId(),
        createdAt = (createdAt ?? DateTime.now()).toUtc();

  /// Client-generated uuid v4, primary key.
  final String opId;

  /// Dedupe key: enqueue with an existing key is a no-op returning the
  /// existing op. Default shape `"<threadId>:<action>"` (see
  /// [idempotencyKeyFor]) — stable across app restarts, so a retried
  /// service call can never double-enqueue.
  final String idempotencyKey;

  /// The mutation to perform.
  final OutboxAction action;

  /// Target email ids, in order.
  final List<String> emailIds;

  /// Optional JSON object of extra batch parameters (e.g.
  /// `{"folderId": "...", "hard": true}`), forwarded into the request
  /// body by the drainer.
  final String? payloadJson;

  /// Enqueue time (UTC) — the drain order.
  final DateTime createdAt;

  /// Failed attempt count.
  final int attempts;

  /// Lifecycle state.
  final OutboxState state;

  /// The default idempotency-key shape: `"<threadId>:<action>"`.
  ///
  /// Rationale: rapid double-taps of the same action on one thread (the
  /// common accidental case, including a retried service call after a
  /// process restart) collapse into a single op. Different actions on the
  /// same thread keep distinct keys and drain in enqueue order. Known
  /// edge: an interleaved read→unread→read sequence drains as read,unread
  /// (the second read dedupes against the first); the local cache applies
  /// every flip, so a later delta-sync reconciles any divergence — the
  /// outbox is the intent queue, sync is the truth.
  static String idempotencyKeyFor(String threadId, OutboxAction action) =>
      '$threadId:${action.name}';

  /// Decoded [payloadJson], or `{}` when absent/unparseable (defensive:
  /// a corrupt payload must not kill a drain).
  Map<String, dynamic> get extras {
    final raw = payloadJson;
    if (raw == null || raw.isEmpty) return const {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return const {};
    } on FormatException {
      return const {};
    }
  }

  /// Copies this op with a fresh identity for re-enqueue after discard.
  OutboxOp freshCopy() => OutboxOp(
        idempotencyKey: idempotencyKey,
        action: action,
        emailIds: List<String>.of(emailIds),
        payloadJson: payloadJson,
      );

  /// Serializes for tests/debugging (the store persists via drift rows,
  /// not this map).
  Map<String, dynamic> toJson() => {
        'opId': opId,
        'idempotencyKey': idempotencyKey,
        'action': action.name,
        'emailIds': List<String>.of(emailIds),
        'payloadJson': payloadJson,
        'createdAtEpoch': createdAt.millisecondsSinceEpoch,
        'attempts': attempts,
        'state': state.wireName,
      };

  /// Parses [OutboxOp.toJson]; throws [FormatException]/[ArgumentError] on
  /// malformed input (fail loud in tests, never in the drain path).
  factory OutboxOp.fromJson(Map<String, dynamic> json) {
    final emailIds = json['emailIds'];
    return OutboxOp(
      opId: json['opId'] as String,
      idempotencyKey: json['idempotencyKey'] as String,
      action: OutboxAction.fromName(json['action'] as String),
      emailIds: [
        if (emailIds is List) ...emailIds.whereType<String>(),
      ],
      payloadJson: json['payloadJson'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(
        (json['createdAtEpoch'] as num).toInt(),
        isUtc: true,
      ),
      attempts: (json['attempts'] as num?)?.toInt() ?? 0,
      state: OutboxState.fromWireName(json['state'] as String),
    );
  }

  @override
  String toString() =>
      'OutboxOp($opId, ${action.name}, ids=${emailIds.length}, $state)';
}
