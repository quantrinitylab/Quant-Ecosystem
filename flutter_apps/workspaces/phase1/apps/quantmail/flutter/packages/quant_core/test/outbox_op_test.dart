// ============================================================================
// quant_core - outbox op model tests (M6: modifier queue, W2)
//
// Verifies the wire-name mapping is EXACT (copied from the backend
// contract, never invented), JSON round-trips, uuid v4 shape, and the
// idempotency-key format.
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';

void main() {
  group('OutboxAction.batchWireName', () {
    test('batch actions map to the EXACT spec strings', () {
      // Copied character-for-character from batchActionSchema
      // (see EmailsApi.batch doc): markRead, markUnread, archive, delete.
      expect(OutboxAction.markRead.batchWireName, 'markRead');
      expect(OutboxAction.markUnread.batchWireName, 'markUnread');
      expect(OutboxAction.archive.batchWireName, 'archive');
      expect(OutboxAction.delete.batchWireName, 'delete');
    });

    test('unarchive has NO batch wire name (dedicated endpoint)', () {
      // batchActionSchema defines no 'unarchive' action; inventing one
      // would be theatre. The drainer uses POST /emails/{id}/unarchive.
      expect(OutboxAction.unarchive.batchWireName, isNull);
    });

    test('fromName round-trips every value and rejects unknowns', () {
      for (final action in OutboxAction.values) {
        expect(OutboxAction.fromName(action.name), action);
      }
      expect(
        () => OutboxAction.fromName('star'),
        throwsArgumentError,
      );
    });
  });

  group('OutboxState', () {
    test('wire names match the DB state strings', () {
      expect(OutboxState.pending.wireName, 'pending');
      expect(OutboxState.dispatched.wireName, 'dispatched');
      expect(OutboxState.failed.wireName, 'failed');
      expect(OutboxState.fromWireName('failed'), OutboxState.failed);
      expect(() => OutboxState.fromWireName('nope'), throwsArgumentError);
    });
  });

  group('OutboxOp', () {
    test('toJson/fromJson round-trips every field', () {
      final op = OutboxOp(
        opId: 'op-1',
        idempotencyKey: 't1:markRead',
        action: OutboxAction.delete,
        emailIds: const ['m1', 'm2'],
        payloadJson: '{"hard":true}',
        createdAt: DateTime.utc(2026, 10, 3, 7, 0, 0),
        attempts: 3,
        state: OutboxState.failed,
      );
      final back = OutboxOp.fromJson(op.toJson());
      expect(back.opId, 'op-1');
      expect(back.idempotencyKey, 't1:markRead');
      expect(back.action, OutboxAction.delete);
      expect(back.emailIds, ['m1', 'm2']);
      expect(back.payloadJson, '{"hard":true}');
      expect(back.extras, {'hard': true});
      expect(back.createdAt, DateTime.utc(2026, 10, 3, 7, 0, 0));
      expect(back.attempts, 3);
      expect(back.state, OutboxState.failed);
    });

    test('extras is defensive: null / empty / malformed -> {}', () {
      OutboxOp base({String? payload}) => OutboxOp(
            idempotencyKey: 'k',
            action: OutboxAction.markRead,
            emailIds: const ['m1'],
            payloadJson: payload,
          );
      expect(base().extras, isEmpty);
      expect(base(payload: '').extras, isEmpty);
      expect(base(payload: 'not-json{{{').extras, isEmpty);
      expect(base(payload: '[1,2]').extras, isEmpty);
    });

    test('idempotencyKeyFor has the documented shape', () {
      expect(
        OutboxOp.idempotencyKeyFor('t-123', OutboxAction.markRead),
        't-123:markRead',
      );
      expect(
        OutboxOp.idempotencyKeyFor('t-123', OutboxAction.unarchive),
        't-123:unarchive',
      );
    });

    test('newOutboxOpId emits RFC 4122 uuid v4, unique', () {
      final pattern = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      );
      final ids = <String>{};
      for (var i = 0; i < 100; i++) {
        final id = newOutboxOpId();
        expect(id, matches(pattern));
        ids.add(id);
      }
      expect(ids, hasLength(100));
    });

    test('default opId is a fresh uuid and createdAt is UTC', () {
      final op = OutboxOp(
        idempotencyKey: 'k',
        action: OutboxAction.archive,
        emailIds: const ['m1'],
      );
      expect(
        op.opId,
        matches(RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        )),
      );
      expect(op.createdAt.isUtc, isTrue);
      expect(op.attempts, 0);
      expect(op.state, OutboxState.pending);
    });
  });
}
