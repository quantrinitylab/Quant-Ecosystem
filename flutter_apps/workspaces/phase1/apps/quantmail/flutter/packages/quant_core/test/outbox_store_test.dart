// ============================================================================
// quant_core - drift outbox store tests (M6: modifier queue, W2)
//
// Tests for [DriftOutboxStore] over a REAL in-memory drift database
// (same pattern as drift_thread_cache_test.dart): enqueue/pending
// round-trip, idempotency-key dedupe, state transitions, ordering.
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';

OutboxOp _op(
  String key, {
  String? opId,
  OutboxAction action = OutboxAction.markRead,
  List<String> emailIds = const ['m1'],
  DateTime? createdAt,
  String? payloadJson,
}) =>
    OutboxOp(
      opId: opId,
      idempotencyKey: key,
      action: action,
      emailIds: emailIds,
      createdAt: createdAt,
      payloadJson: payloadJson,
    );

void main() {
  late MailDatabase db;
  late DriftOutboxStore store;

  setUp(() {
    db = MailDatabase.memory();
    store = DriftOutboxStore(db);
    addTearDown(db.close);
  });

  group('DriftOutboxStore', () {
    test('enqueue -> pendingOps round-trips every field', () async {
      final op = _op(
        't1:markRead',
        action: OutboxAction.delete,
        emailIds: const ['m1', 'm2'],
        payloadJson: '{"hard":true}',
      );
      final returned = await store.enqueue(op);
      expect(returned.opId, op.opId);

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      final back = pending.single;
      expect(back.opId, op.opId);
      expect(back.idempotencyKey, 't1:markRead');
      expect(back.action, OutboxAction.delete);
      expect(back.emailIds, ['m1', 'm2']);
      expect(back.payloadJson, '{"hard":true}');
      expect(back.attempts, 0);
      expect(back.state, OutboxState.pending);
      // createdAt survives the epoch round-trip (millisecond precision).
      expect(
        back.createdAt.millisecondsSinceEpoch,
        op.createdAt.millisecondsSinceEpoch,
      );
    });

    test('duplicate idempotencyKey is a no-op returning the existing op',
        () async {
      final first = await store.enqueue(_op('t1:archive'));
      final second = await store.enqueue(
        _op('t1:archive', emailIds: const ['m-other']),
      );
      expect(second.opId, first.opId);
      expect(await store.pendingOps(), hasLength(1));
    });

    test('duplicate key on a FAILED op replaces it with a fresh pending op',
        () async {
      final failed = await store.enqueue(_op('t1:delete'));
      await store.markFailed(failed.opId, permanent: true);
      final fresh = await store.enqueue(_op('t1:delete'));
      expect(fresh.opId, isNot(failed.opId));
      expect(fresh.state, OutboxState.pending);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.opId, fresh.opId);
      expect(await store.failedOps(), isEmpty);
    });

    test('markDispatched removes the op from pending', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.markDispatched(op.opId);
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });

    test('markFailed(permanent: true) moves the op to failedOps', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.markFailed(op.opId, permanent: true);
      expect(await store.pendingOps(), isEmpty);
      final failed = await store.failedOps();
      expect(failed, hasLength(1));
      expect(failed.single.opId, op.opId);
      expect(failed.single.state, OutboxState.failed);
    });

    test('markFailed(permanent: false) keeps pending, bumps attempts',
        () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.markFailed(op.opId, permanent: false);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.attempts, 1);
      expect(pending.single.state, OutboxState.pending);
    });

    test('incrementAttempts bumps the counter', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.incrementAttempts(op.opId);
      await store.incrementAttempts(op.opId);
      expect((await store.pendingOps()).single.attempts, 2);
    });

    test('remove deletes the row', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.remove(op.opId);
      expect(await store.pendingOps(), isEmpty);
    });

    test('requeue moves failed -> pending with attempts reset', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.incrementAttempts(op.opId);
      await store.markFailed(op.opId, permanent: true);
      await store.requeue(op.opId);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.state, OutboxState.pending);
      expect(pending.single.attempts, 0);
      expect(await store.failedOps(), isEmpty);
    });

    test('requeue is a no-op for non-failed ops', () async {
      final op = await store.enqueue(_op('t1:markRead'));
      await store.incrementAttempts(op.opId);
      await store.requeue(op.opId); // still pending: untouched
      final pending = await store.pendingOps();
      expect(pending.single.attempts, 1);
      expect(pending.single.state, OutboxState.pending);
    });

    test('pendingOps/failedOps order oldest-first by createdAt', () async {
      final base = DateTime.utc(2026, 10, 3);
      await store.enqueue(
          _op('k3', createdAt: base.add(const Duration(seconds: 3))));
      await store.enqueue(
          _op('k1', createdAt: base.add(const Duration(seconds: 1))));
      await store.enqueue(
          _op('k2', createdAt: base.add(const Duration(seconds: 2))));
      final pending = await store.pendingOps();
      expect(
        pending.map((o) => o.idempotencyKey).toList(),
        ['k1', 'k2', 'k3'],
      );
    });
  });
}
