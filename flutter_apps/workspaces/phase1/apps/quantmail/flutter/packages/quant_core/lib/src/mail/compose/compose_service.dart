// ============================================================================
// quant_core - compose service (M7: compose core, W2)
//
// [ComposeService] is the modifier-queue entry point for sends: synchronous
// validation + write-ahead outbox enqueue, then a fire-and-forget drain —
// Superhuman's `modify()`/`persist()` split, same as
// [ThreadMutationService].
//
// - [send]: validates (≥1 valid recipient; empty subject allowed), enqueues
//   an [OutboxAction.send] op under the STABLE key `send:<idempotencyKey>`
//   (the request's own key, so a double-tap or a post-restart retry of the
//   same send job dedupes against the stored op), kicks the drain, and
//   returns the op id. The drainer sends the stored payload byte-passthrough
//   via `ComposeApi.composeRaw` — the wire body is EXACTLY what was stored.
// - [undoSend]: enqueues an [OutboxAction.undoSend] op (`undoSend:<emailId>`)
//   and kicks the drain; the drainer hits `POST /emails/{id}/undo-send`
//   inside the 30s server-held undo window.
// - [cancelSend] and [sendDraft] are NOT service methods: they are
//   immediate, synchronous server calls on existing drafts ([ComposeApi]
//   exposes them directly); the outbox carries only the offline-capable
//   paths (new sends and undo-sends).
//
// Failure policy: failures surface on [failedOps] for user retry/discard —
// NO auto-rollback of the local state (M6 policy: the outbox is the intent
// queue, never silently rewritten).
import 'dart:async';
import 'dart:convert';

import '../outbox/outbox_drainer.dart';
import '../outbox/outbox_op.dart';
import '../outbox/outbox_store.dart';
import 'compose_request.dart';

/// Validation/scheduling entry point for message sends.
///
/// Offline-first: the send is enqueued persistently before any network
/// attempt, so killing the app mid-send loses nothing — the next drain
/// picks the op back up from SQLite.
class ComposeService {
  /// Creates the service over [store] and [drainer].
  const ComposeService({required OutboxStore store, required OutboxDrainer drainer})
      : _store = store,
        _drainer = drainer;

  final OutboxStore _store;
  final OutboxDrainer _drainer;

  /// Validates and queues a send; returns the enqueued op id.
  ///
  /// Throws [ArgumentError] synchronously when the request has no valid
  /// recipient. Empty subject is allowed. Fire-and-forget drain follows the
  /// write-ahead enqueue (see [ThreadMutationService] for the pattern).
  Future<String> send(ComposeRequest request) async {
    if (request.validRecipients.isEmpty) {
      throw ArgumentError(
        'ComposeService.send: at least one valid recipient is required',
      );
    }
    final op = OutboxOp(
      idempotencyKey: 'send:${request.idempotencyKey}',
      action: OutboxAction.send,
      // A new message has no server id yet: the request body IS the send.
      emailIds: const <String>[],
      payloadJson: jsonEncode(request.toJson()),
    );
    final queued = await _store.enqueue(op);
    unawaited(_drainer.drain());
    return queued.opId;
  }

  /// Queues an undo-send for a recently-sent message; returns the op id.
  ///
  /// The drainer calls `POST /emails/{id}/undo-send`; outside the 30s
  /// server-held window the server rejects (400 → permanent failure on
  /// [failedOps], never an infinite retry).
  Future<String> undoSend(String emailId) async {
    final op = OutboxOp(
      idempotencyKey: 'undoSend:$emailId',
      action: OutboxAction.undoSend,
      emailIds: <String>[emailId],
    );
    final queued = await _store.enqueue(op);
    unawaited(_drainer.drain());
    return queued.opId;
  }

  /// The failed-ops stream (user retry/discard surface). Failures here
  /// never roll local state back — M6 policy.
  Stream<List<OutboxOp>> failedOps() => _drainer.failedOps;
}
