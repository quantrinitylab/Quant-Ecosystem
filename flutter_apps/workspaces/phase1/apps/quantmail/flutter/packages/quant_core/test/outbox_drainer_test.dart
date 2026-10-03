// ============================================================================
// quant_core - outbox drainer tests (M6: modifier queue, W2)
//
// Tests for [OutboxDrainer] with a scripted [EmailsApi] fake and a REAL
// in-memory drift store: success dispatch, the single-writer guard under
// concurrent drain() calls, retryable vs permanent error classification,
// the poison-op guard, the unarchive per-id path, and the never-throws
// guarantee.
// ============================================================================

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/outbox/outbox_drainer.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Scripted [EmailsApi]: records calls, never touches the network (the
/// dummy client is constructed but never used).
class _ScriptedApi extends EmailsApi {  _ScriptedApi() : super(_dummyClient());

  static QuantApiClient _dummyClient() => QuantApiClient(
        config: const QuantApiConfig(
          baseUrl: 'https://example.invalid',
          refreshEndpoint: '/oauth/token',
        ),
        tokenManager: TokenManager(),
      );

  /// Recorded `batch` argument lists, in call order.
  final List<List<Map<String, dynamic>>> batchCalls = [];

  /// Recorded `unarchive` ids, in call order.
  final List<String> unarchiveCalls = [];

  /// Artificial latency per API call (for the single-writer test).
  Duration delay = Duration.zero;

  ApiResult<Map<String, dynamic>> Function(List<Map<String, dynamic>>)?
      onBatch;
  ApiResult<void> Function(String)? onUnarchive;

  static ApiResult<Map<String, dynamic>> okBatch() =>
      ApiResult.ok(<String, dynamic>{'results': <Map<String, dynamic>>[]});

  static ApiResult<Map<String, dynamic>> failBatch(int status) =>
      ApiResult.failure(
        ApiError(code: 'E$status', message: 'boom', statusCode: status),
      );

  @override
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) async {
    await Future<void>.delayed(delay);
    batchCalls.add(operations);
    final handler = onBatch;
    if (handler != null) return handler(operations);
    return okBatch();
  }

  @override
  Future<ApiResult<void>> unarchive(String id) async {
    await Future<void>.delayed(delay);
    unarchiveCalls.add(id);
    final handler = onUnarchive;
    if (handler != null) return handler(id);
    return ApiResult<void>.ok(null);
  }
}

/// Never-called [ComposeApi] (this suite never enqueues send/undoSend
/// ops; the drainer just needs the dependency).
class _ScriptedComposeApi extends ComposeApi {
  _ScriptedComposeApi()
      : super(QuantApiClient(
          config: const QuantApiConfig(
            baseUrl: 'https://example.invalid',
            refreshEndpoint: '/oauth/token',
          ),
          tokenManager: TokenManager(),
        ));
}

OutboxOp _op(
  String key,
  OutboxAction action,
  List<String> ids, {
  DateTime? createdAt,
  int attempts = 0,
  String? payloadJson,
}) =>
    OutboxOp(
      idempotencyKey: key,
      action: action,
      emailIds: ids,
      createdAt: createdAt,
      attempts: attempts,
      payloadJson: payloadJson,
    );

void main() {
  late MailDatabase db;
  late DriftOutboxStore store;
  late _ScriptedApi api;
  late OutboxDrainer drainer;

  setUp(() {
    db = MailDatabase.memory();
    store = DriftOutboxStore(db);
    api = _ScriptedApi();
    // M7 (compose, W2): the drainer takes a ComposeApi; this suite never
    // enqueues send/undoSend ops, so the fake is never called.
    drainer = OutboxDrainer(
        store: store, emails: api, compose: _ScriptedComposeApi());
    addTearDown(() async {
      drainer.dispose();
      await db.close();
    });
  });

  group('OutboxDrainer', () {
    test('success: dispatches with the EXACT batch body, then reaps the op',
        () async {
      final op = _op('t1:markRead', OutboxAction.markRead, const ['m1', 'm2']);
      await store.enqueue(op);

      await drainer.drain();

      expect(api.batchCalls, hasLength(1));
      expect(
        api.batchCalls.single.single,
        {'action': 'markRead', 'emailIds': ['m1', 'm2']},
      );
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });

    test('payload extras (folderId/hard) are forwarded into the batch body',
        () async {
      await store.enqueue(_op(
        't1:delete',
        OutboxAction.delete,
        const ['m1'],
        payloadJson: '{"hard":true}',
      ));

      await drainer.drain();

      expect(
        api.batchCalls.single.single,
        {'action': 'delete', 'emailIds': ['m1'], 'hard': true},
      );
    });

    test('single-writer: 3 concurrent drains process each op exactly once, '
        'in createdAt order, with no interleaving', () async {
      final base = DateTime.utc(2026, 10, 3);
      await store.enqueue(_op('k1', OutboxAction.markRead, const ['m1'],
          createdAt: base.add(const Duration(seconds: 1))));
      await store.enqueue(_op('k2', OutboxAction.archive, const ['m2'],
          createdAt: base.add(const Duration(seconds: 2))));
      await store.enqueue(_op('k3', OutboxAction.markUnread, const ['m3'],
          createdAt: base.add(const Duration(seconds: 3))));
      api.delay = const Duration(milliseconds: 50);

      // Three concurrent drain() calls must collapse into ONE in-flight
      // drain — the API sees each op exactly once, in enqueue order.
      await Future.wait([
        drainer.drain(),
        drainer.drain(),
        drainer.drain(),
      ]);

      expect(api.batchCalls, hasLength(3));
      expect(
        api.batchCalls.map((c) => c.single['emailIds']).toList(),
        [
          ['m1'],
          ['m2'],
          ['m3'],
        ],
      );
      expect(
        api.batchCalls.map((c) => c.single['action']).toList(),
        ['markRead', 'archive', 'markUnread'],
      );
      expect(await store.pendingOps(), isEmpty);
    });

    test('retryable (5xx) -> attempts++ and stays pending', () async {
      api.onBatch = (_) => _ScriptedApi.failBatch(503);
      final op = _op('t1:markRead', OutboxAction.markRead, const ['m1']);
      await store.enqueue(op);

      await drainer.drain();

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.opId, op.opId);
      expect(pending.single.attempts, 1);
      expect(pending.single.state, OutboxState.pending);
      expect(await store.failedOps(), isEmpty);
    });

    test('retryable (no HTTP response, statusCode 0) -> stays pending',
        () async {
      api.onBatch = (_) => _ScriptedApi.failBatch(0);
      await store.enqueue(_op('t1:markRead', OutboxAction.markRead, const ['m1']));

      await drainer.drain();

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.attempts, 1);
    });

    test('permanent (4xx) -> failed and emitted on failedOps', () async {
      api.onBatch = (_) => _ScriptedApi.failBatch(400);
      final op = _op('t1:delete', OutboxAction.delete, const ['m1']);
      await store.enqueue(op);

      final emitted = <List<OutboxOp>>[];
      final sub = drainer.failedOps.listen(emitted.add);

      await drainer.drain();
      await pumpEventQueue();
      await sub.cancel();

      expect(await store.pendingOps(), isEmpty);
      final failed = await store.failedOps();
      expect(failed.map((o) => o.opId), contains(op.opId));
      expect(emitted, isNotEmpty);
      expect(emitted.last.map((o) => o.opId), contains(op.opId));
    });

    test('poison-op guard: retryable past maxAttempts escalates to failed',
        () async {
      api.onBatch = (_) => _ScriptedApi.failBatch(500);
      final op = _op(
        't1:markRead',
        OutboxAction.markRead,
        const ['m1'],
        attempts: OutboxDrainer.maxAttempts - 1,
      );
      await store.enqueue(op);

      await drainer.drain();

      expect(await store.pendingOps(), isEmpty);
      expect(
        (await store.failedOps()).map((o) => o.opId),
        contains(op.opId),
      );
    });

    test('unarchive drains via POST /emails/{id}/unarchive per id (no batch)',
        () async {
      final op =
          _op('t1:unarchive', OutboxAction.unarchive, const ['a', 'b']);
      await store.enqueue(op);

      await drainer.drain();

      expect(api.unarchiveCalls, ['a', 'b']);
      expect(api.batchCalls, isEmpty);
      expect(await store.pendingOps(), isEmpty);
    });

    test('unarchive failure on one id fails the whole op (retryable)', () async {
      api.onUnarchive = (id) => id == 'b'
          ? ApiResult<void>.failure(
              const ApiError(
                  code: 'E500', message: 'boom', statusCode: 500))
          : ApiResult<void>.ok(null);
      await store.enqueue(
          _op('t1:unarchive', OutboxAction.unarchive, const ['a', 'b']));

      await drainer.drain();

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.attempts, 1);
    });

    test('malformed op (no email ids) fails fast as permanent', () async {
      await store.enqueue(
          _op('t1:markRead', OutboxAction.markRead, const []));

      await drainer.drain();

      expect(api.batchCalls, isEmpty);
      expect((await store.failedOps()), hasLength(1));
    });

    test('drain never throws, even when the store is broken', () async {
      await db.close();
      await drainer.drain(); // Must complete normally.
    });

    test('drain on an empty outbox is a quiet no-op', () async {
      await drainer.drain();
      expect(api.batchCalls, isEmpty);
    });
  });
}
