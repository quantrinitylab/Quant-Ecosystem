// ============================================================================
// quant_core - persistent outbox store (M6: modifier queue, W2)
//
// [OutboxStore] is the persistence seam for deferred mutations;
// [DriftOutboxStore] is the SQLite implementation over [MailDatabase].
//
// Dedupe contract: [enqueue] with an [OutboxOp.idempotencyKey] that already
// exists is a no-op returning the existing op — EXCEPT when the existing
// row is `failed`, in which case it is replaced by a fresh pending op
// (explicit user retry flows through [requeue]/fresh enqueue instead of
// silently resurrecting dead rows).
import 'dart:convert';

import 'package:drift/drift.dart';

import '../cache/mail_database.dart';
import 'outbox_op.dart';

/// Persistence seam for the modifier-queue outbox.
///
/// Implementations must be crash-safe on [enqueue] (write-ahead: the op is
/// durable before the caller attempts any network I/O).
abstract class OutboxStore {
  /// Persists [op]; with a duplicate [OutboxOp.idempotencyKey] returns the
  /// existing op without writing (no-op), replacing it only when the
  /// existing row is `failed`.
  Future<OutboxOp> enqueue(OutboxOp op);

  /// Pending ops in drain order (oldest [OutboxOp.createdAt] first).
  Future<List<OutboxOp>> pendingOps();

  /// Permanently failed ops, oldest first — the user-facing retry queue.
  Future<List<OutboxOp>> failedOps();

  /// Records the server-confirmed transition to `dispatched`.
  Future<void> markDispatched(String opId);

  /// Records a failure. [permanent] `true` (default) moves the op to
  /// `failed` (4xx / poison-op); `false` records a failed attempt and
  /// leaves the op `pending` for the next drain.
  Future<void> markFailed(String opId, {bool permanent = true});

  /// Deletes the op row unconditionally (reap after dispatch, or discard).
  Future<void> remove(String opId);

  /// Adds one to the op's attempt counter (stays `pending`).
  Future<void> incrementAttempts(String opId);

  /// Moves a `failed` op back to `pending` with attempts reset (user
  /// retry); no-op for other states.
  Future<void> requeue(String opId);
}

/// SQLite [OutboxStore] over the M6 `OutboxOperations` table.
class DriftOutboxStore implements OutboxStore {
  /// Creates the store over [db].
  DriftOutboxStore(this._db);

  final MailDatabase _db;

  OutboxOperationsCompanion _toCompanion(OutboxOp op) =>
      OutboxOperationsCompanion(
        opId: Value(op.opId),
        action: Value(op.action.name),
        emailIds: Value(jsonEncode(op.emailIds)),
        payloadJson: Value(op.payloadJson),
        idempotencyKey: Value(op.idempotencyKey),
        createdAtEpoch: Value(op.createdAt.millisecondsSinceEpoch),
        attempts: Value(op.attempts),
        state: Value(op.state.wireName),
      );

  OutboxOp _fromRow(OutboxOperation row) {
    final ids = jsonDecode(row.emailIds);
    return OutboxOp(
      opId: row.opId,
      idempotencyKey: row.idempotencyKey,
      action: OutboxAction.fromName(row.action),
      emailIds: [if (ids is List) ...ids.whereType<String>()],
      payloadJson: row.payloadJson,
      createdAt: DateTime.fromMillisecondsSinceEpoch(
        row.createdAtEpoch,
        isUtc: true,
      ),
      attempts: row.attempts,
      state: OutboxState.fromWireName(row.state),
    );
  }

  @override
  Future<OutboxOp> enqueue(OutboxOp op) async {
    final existing = await (_db.select(_db.outboxOperations)
          ..where((t) => t.idempotencyKey.equals(op.idempotencyKey)))
        .getSingleOrNull();
    if (existing != null) {
      if (existing.state == OutboxState.failed.wireName) {
        // A failed op with the same key is replaced by the fresh intent.
        await (_db.delete(_db.outboxOperations)
              ..where((t) => t.opId.equals(existing.opId)))
            .go();
      } else {
        return _fromRow(existing);
      }
    }
    await _db.into(_db.outboxOperations).insert(_toCompanion(op));
    return op;
  }

  Future<List<OutboxOp>> _opsInState(OutboxState state) async {
    final rows = await (_db.select(_db.outboxOperations)
          ..where((t) => t.state.equals(state.wireName))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAtEpoch)]))
        .get();
    return rows.map(_fromRow).toList(growable: false);
  }

  @override
  Future<List<OutboxOp>> pendingOps() => _opsInState(OutboxState.pending);

  @override
  Future<List<OutboxOp>> failedOps() => _opsInState(OutboxState.failed);

  @override
  Future<void> markDispatched(String opId) => _setState(
        opId,
        OutboxState.dispatched,
      );

  @override
  Future<void> markFailed(String opId, {bool permanent = true}) {
    if (!permanent) return incrementAttempts(opId);
    return _setState(opId, OutboxState.failed);
  }

  Future<void> _setState(String opId, OutboxState state) async {
    await (_db.update(_db.outboxOperations)
          ..where((t) => t.opId.equals(opId)))
        .write(OutboxOperationsCompanion(state: Value(state.wireName)));
  }

  @override
  Future<void> remove(String opId) async {
    await (_db.delete(_db.outboxOperations)
          ..where((t) => t.opId.equals(opId)))
        .go();
  }

  @override
  Future<void> incrementAttempts(String opId) async {
    final row = await (_db.select(_db.outboxOperations)
          ..where((t) => t.opId.equals(opId)))
        .getSingleOrNull();
    if (row == null) return;
    await (_db.update(_db.outboxOperations)
          ..where((t) => t.opId.equals(opId)))
        .write(
            OutboxOperationsCompanion(attempts: Value(row.attempts + 1)));
  }

  @override
  Future<void> requeue(String opId) async {
    await (_db.update(_db.outboxOperations)
          ..where((t) =>
              t.opId.equals(opId) &
              t.state.equals(OutboxState.failed.wireName)))
        .write(const OutboxOperationsCompanion(
          state: Value('pending'),
          attempts: Value(0),
        ));
  }
}
