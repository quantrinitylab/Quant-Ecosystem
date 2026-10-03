// ============================================================================
// quant_core - compose outbox dispatch tests (M7: compose core, W2)
//
// Tests for the ADDITIVE compose dispatch in [OutboxDrainer]: `send` ops
// post the stored payload byte-passthrough to `POST /emails/compose`,
// `undoSend` ops hit `POST /emails/{id}/undo-send` per id — over a REAL
// in-memory drift store and a scripted [ComposeApi] fake. Also guards that
// the existing batch/unarchive dispatch is untouched by the new branches.
// ============================================================================

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/outbox/outbox_drainer.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:quant_foundation/quant_foundation.dart';

QuantApiClient _dummyClient() => QuantApiClient(
      config: const QuantApiConfig(
        baseUrl: 'https://example.invalid',
        refreshEndpoint: '/oauth/token',
      ),
      tokenManager: TokenManager(),
    );

/// Scripted [ComposeApi]: records calls, scriptable results, never touches
/// the network.
class _ScriptedComposeApi extends ComposeApi {
  _ScriptedComposeApi() : super(_dummyClient());

  /// Recorded `composeRaw` bodies, in call order.
  final List<Map<String, dynamic>> composeBodies = [];

  /// Recorded `undoSend` ids, in call order.
  final List<String> undoSendCalls = [];

  ApiResult<Map<String, dynamic>> Function(Map<String, dynamic>)? onComposeRaw;
  ApiResult<void> Function(String)? onUndoSend;

  @override
  Future<ApiResult<Map<String, dynamic>>> composeRaw(
    Map<String, dynamic> body,
  ) async {
    composeBodies.add(Map<String, dynamic>.from(body));
    final handler = onComposeRaw;
    if (handler != null) return handler(body);
    return ApiResult.ok(<String, dynamic>{'id': 'sent-1'});
  }

  @override
  Future<ApiResult<void>> undoSend(String id) async {
    undoSendCalls.add(id);
    final handler = onUndoSend;
    if (handler != null) return handler(id);
    return ApiResult<void>.ok(null);
  }
}

/// Scripted [EmailsApi]: records batch calls (regression guard that send
/// ops never leak into the batch path).
class _ScriptedEmailsApi extends EmailsApi {
  _ScriptedEmailsApi() : super(_dummyClient());

  final List<List<Map<String, dynamic>>> batchCalls = [];

  @override
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) async {
    batchCalls.add(operations);
    return ApiResult.ok(<String, dynamic>{'results': <Map<String, dynamic>>[]});
  }
}

ApiResult<Map<String, dynamic>> _failCompose(int status) =>
    ApiResult.failure(
      ApiError(code: 'E$status', message: 'boom', statusCode: status),
    );

OutboxOp _sendOp(String key, Map<String, dynamic> payload,
        {DateTime? createdAt}) =>
    OutboxOp(
      idempotencyKey: key,
      action: OutboxAction.send,
      emailIds: const <String>[],
      payloadJson: jsonEncode(payload),
      createdAt: createdAt,
    );

void main() {
  late MailDatabase db;
  late DriftOutboxStore store;
  late _ScriptedComposeApi composeApi;
  late _ScriptedEmailsApi emailsApi;
  late OutboxDrainer drainer;

  setUp(() {
    db = MailDatabase.memory();
    store = DriftOutboxStore(db);
    composeApi = _ScriptedComposeApi();
    emailsApi = _ScriptedEmailsApi();
    drainer = OutboxDrainer(
      store: store,
      emails: emailsApi,
      compose: composeApi,
    );
    addTearDown(() async {
      drainer.dispose();
      await db.close();
    });
  });

  group('drainer send dispatch', () {
    test('send: posts the stored payload byte-passthrough, then reaps',
        () async {
      final payload = {
        'to': [
          {'email': 'bob@example.com', 'name': 'Bob'}
        ],
        'subject': 'Hi',
        'bodyText': 'Body',
        'idempotencyKey': 'job-1',
      };
      await store.enqueue(_sendOp('send:job-1', payload));

      await drainer.drain();

      expect(composeApi.composeBodies, hasLength(1));
      expect(jsonEncode(composeApi.composeBodies.single), jsonEncode(payload),
          reason: 'passthrough: the wire body is exactly what was stored');
      expect(emailsApi.batchCalls, isEmpty,
          reason: 'send ops never touch the batch path');
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });

    test('send: two ops dispatch in enqueue order', () async {
      final base = DateTime.utc(2026, 10, 3);
      await store.enqueue(_sendOp(
        'send:job-a',
        {'idempotencyKey': 'job-a'},
        createdAt: base,
      ));
      await store.enqueue(_sendOp(
        'send:job-b',
        {'idempotencyKey': 'job-b'},
        createdAt: base.add(const Duration(seconds: 1)),
      ));

      await drainer.drain();

      expect(
        composeApi.composeBodies.map((b) => b['idempotencyKey']),
        ['job-a', 'job-b'],
      );
    });

    test('send: missing payload is permanent (fail fast, no retries)',
        () async {
      await store.enqueue(OutboxOp(
        idempotencyKey: 'send:bad',
        action: OutboxAction.send,
        emailIds: const <String>[],
      ));

      await drainer.drain();

      expect(composeApi.composeBodies, isEmpty);
      expect(await store.pendingOps(), isEmpty);
      final failed = await store.failedOps();
      expect(failed, hasLength(1));
      expect(failed.single.idempotencyKey, 'send:bad');
    });

    test('send: corrupt payload JSON is permanent', () async {
      await store.enqueue(OutboxOp(
        idempotencyKey: 'send:corrupt',
        action: OutboxAction.send,
        emailIds: const <String>[],
        payloadJson: '{not json',
      ));

      await drainer.drain();

      expect(composeApi.composeBodies, isEmpty);
      expect((await store.failedOps()).single.idempotencyKey, 'send:corrupt');
    });

    test('send: 400 is permanent (surfaced for user retry/discard)', () async {
      composeApi.onComposeRaw = (_) => _failCompose(400);
      await store.enqueue(_sendOp('send:job-400', {'idempotencyKey': 'x'}));

      await drainer.drain();

      expect(composeApi.composeBodies, hasLength(1));
      expect(await store.pendingOps(), isEmpty);
      expect((await store.failedOps()).single.idempotencyKey, 'send:job-400');
    });

    test('send: 400 emits the failed op on drainer.failedOps', () async {
      composeApi.onComposeRaw = (_) => _failCompose(400);
      final op = _sendOp('send:job-400-emit', {'idempotencyKey': 'y'});
      await store.enqueue(op);

      final emitted = <List<OutboxOp>>[];
      final sub = drainer.failedOps.listen(emitted.add);

      await drainer.drain();
      await pumpEventQueue();
      await sub.cancel();

      expect(emitted, isNotEmpty);
      expect(emitted.last.map((o) => o.opId), contains(op.opId));
      expect(emitted.last.map((o) => o.idempotencyKey),
          contains('send:job-400-emit'));
    });

    test('send: 500 is retryable (stays pending, attempts++)', () async {
      composeApi.onComposeRaw = (_) => _failCompose(500);
      await store.enqueue(_sendOp('send:job-500', {'idempotencyKey': 'x'}));

      await drainer.drain();

      expect(await store.failedOps(), isEmpty);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.attempts, 1);
    });
  });

  group('drainer undoSend dispatch', () {
    test('undoSend: one POST per email id, then reaps', () async {
      await store.enqueue(OutboxOp(
        idempotencyKey: 'undoSend:m-1',
        action: OutboxAction.undoSend,
        emailIds: const ['m-1', 'm-2'],
      ));

      await drainer.drain();

      expect(composeApi.undoSendCalls, ['m-1', 'm-2']);
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });

    test('undoSend: 404 (no such send) is permanent', () async {
      composeApi.onUndoSend = (_) => ApiResult<void>.failure(
        const ApiError(code: 'E404', message: 'gone', statusCode: 404),
      );
      await store.enqueue(OutboxOp(
        idempotencyKey: 'undoSend:m-9',
        action: OutboxAction.undoSend,
        emailIds: const ['m-9'],
      ));

      await drainer.drain();

      expect((await store.failedOps()).single.idempotencyKey, 'undoSend:m-9');
    });

    test('undoSend: 500 is retryable (stays pending, attempts++, not failed)',
        () async {
      composeApi.onUndoSend = (_) => ApiResult<void>.failure(
        const ApiError(code: 'E500', message: 'down', statusCode: 500),
      );
      final op = OutboxOp(
        idempotencyKey: 'undoSend:m-5xx',
        action: OutboxAction.undoSend,
        emailIds: const ['m-5xx'],
      );
      await store.enqueue(op);

      await drainer.drain();

      expect(composeApi.undoSendCalls, ['m-5xx']);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.opId, op.opId);
      expect(pending.single.attempts, 1);
      expect(pending.single.state, OutboxState.pending);
      expect(await store.failedOps(), isEmpty);
    });

    test('undoSend: timeout (statusCode 0) is retryable (stays pending)',
        () async {
      composeApi.onUndoSend = (_) => ApiResult<void>.failure(
        const ApiError(
            code: 'TIMEOUT', message: 'timed out', statusCode: 0),
      );
      await store.enqueue(OutboxOp(
        idempotencyKey: 'undoSend:m-to',
        action: OutboxAction.undoSend,
        emailIds: const ['m-to'],
      ));

      await drainer.drain();

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.attempts, 1);
      expect(await store.failedOps(), isEmpty);
    });

    test('undoSend: empty email ids is permanent (malformed fast-fail)',
        () async {
      await store.enqueue(OutboxOp(
        idempotencyKey: 'undoSend:empty',
        action: OutboxAction.undoSend,
        emailIds: const <String>[],
      ));

      await drainer.drain();

      expect(composeApi.undoSendCalls, isEmpty);
      expect((await store.failedOps()).single.idempotencyKey, 'undoSend:empty');
    });
  });

  group('regression: existing dispatch untouched', () {
    test('batch actions still route to the batch endpoint', () async {
      await store.enqueue(OutboxOp(
        idempotencyKey: 't1:markRead',
        action: OutboxAction.markRead,
        emailIds: const ['m1'],
      ));

      await drainer.drain();

      expect(emailsApi.batchCalls, hasLength(1));
      expect(composeApi.composeBodies, isEmpty);
      expect(composeApi.undoSendCalls, isEmpty);
    });

    test('send/undoSend wire mapping: batchWireName is null', () {
      expect(OutboxAction.send.batchWireName, isNull);
      expect(OutboxAction.undoSend.batchWireName, isNull);
    });
  });
}
