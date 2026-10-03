// ============================================================================
// quant_core - compose service tests (M7: compose core, W2)
//
// Tests for [ComposeService] with a REAL in-memory drift store and a REAL
// [OutboxDrainer] over scripted API fakes: send validation, write-ahead
// enqueue (stable `send:<idempotencyKey>` key → double-send dedupes),
// undoSend enqueue, and drain dispatch to the compose fake.
//
// Determinism note: [ComposeService] fires its drain fire-and-forget, so
// [_ManualDrainer] swallows drain calls until the test releases them —
// enqueue assertions therefore run against a guaranteed-still-pending op.
// ============================================================================

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/compose/compose_request.dart';
import 'package:quant_core/src/mail/compose/compose_service.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/models/email.dart';
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

/// Scripted [ComposeApi]: records compose calls, never touches the network
/// (the dummy client is constructed but never used).
class _ScriptedComposeApi extends ComposeApi {
  _ScriptedComposeApi() : super(_dummyClient());

  /// Recorded [composeRaw] bodies, in call order.
  final List<Map<String, dynamic>> composeBodies = [];

  /// Recorded [undoSend] ids, in call order.
  final List<String> undoSendCalls = [];

  @override
  Future<ApiResult<Map<String, dynamic>>> composeRaw(
    Map<String, dynamic> body,
  ) async {
    composeBodies.add(Map<String, dynamic>.from(body));
    return ApiResult.ok(<String, dynamic>{'id': 'sent-1'});
  }

  @override
  Future<ApiResult<void>> undoSend(String id) async {
    undoSendCalls.add(id);
    return ApiResult<void>.ok(null);
  }
}

/// Never-called [EmailsApi] (compose dispatch never touches the batch
/// path; the drainer just needs the dependency).
class _UnusedEmailsApi extends EmailsApi {
  _UnusedEmailsApi() : super(_dummyClient());
}

/// [OutboxDrainer] that swallows drain calls until [release] is set —
///
/// lets tests assert the write-ahead state before any dispatch runs.
class _ManualDrainer extends OutboxDrainer {
  _ManualDrainer({
    required super.store,
    required super.emails,
    required super.compose,
  });

  bool release = false;

  @override
  Future<void> drain() {
    if (!release) return Future<void>.value();
    return super.drain();
  }
}

ComposeRequest _request({String? idempotencyKey}) => ComposeRequest(
      to: const [EmailAddress(email: 'bob@example.com', name: 'Bob')],
      subject: 'Hi',
      bodyText: 'Body',
      idempotencyKey: idempotencyKey,
    );

void main() {
  late MailDatabase db;
  late DriftOutboxStore store;
  late _ScriptedComposeApi composeApi;
  late _ManualDrainer drainer;
  late ComposeService service;

  setUp(() {
    db = MailDatabase.memory();
    store = DriftOutboxStore(db);
    composeApi = _ScriptedComposeApi();
    drainer = _ManualDrainer(
      store: store,
      emails: _UnusedEmailsApi(),
      compose: composeApi,
    );
    service = ComposeService(store: store, drainer: drainer);
    addTearDown(() async {
      drainer.dispose();
      await db.close();
    });
  });

  group('ComposeService.send', () {
    test('rejects a request with no valid recipients', () {
      expect(
        service.send(ComposeRequest(subject: 'x', bodyText: 'y')),
        throwsArgumentError,
      );
    });

    test('rejects recipients with empty email addresses', () {
      expect(
        service.send(ComposeRequest(
          to: const [EmailAddress(email: '')],
        )),
        throwsArgumentError,
      );
    });

    test('write-ahead enqueue: stable key + exact payload, then drain posts',
        () async {
      final request = _request(idempotencyKey: 'job-1');

      final opId = await service.send(request);

      // Drain swallowed: the write-ahead row is still pending — assert the
      // exact stored shape.
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      final stored = pending.single;
      expect(stored.opId, opId);
      expect(stored.action, OutboxAction.send);
      expect(stored.idempotencyKey, 'send:job-1');
      expect(stored.emailIds, isEmpty);
      expect(stored.payloadJson, jsonEncode(request.toJson()));

      // Release the drain: the stored payload is posted byte-passthrough.
      drainer.release = true;
      await drainer.drain();

      expect(composeApi.composeBodies, hasLength(1));
      final body = composeApi.composeBodies.single;
      expect(jsonEncode(body), jsonEncode(request.toJson()),
          reason: 'drainer re-sends exactly what was stored');
      expect(await store.pendingOps(), isEmpty,
          reason: 'dispatched op is reaped from the table');
    });

    test('double send of the same job dedupes (stable idempotency key)',
        () async {
      final request = _request(idempotencyKey: 'job-2');

      final first = await service.send(request);
      final second = await service.send(request);

      expect(second, first,
          reason: 'same stable key -> enqueue returns the existing op');
      expect(await store.pendingOps(), hasLength(1));

      drainer.release = true;
      await drainer.drain();
      expect(composeApi.composeBodies, hasLength(1),
          reason: 'the send job is dispatched exactly once');
    });

    test('two different jobs enqueue in order and drain in order', () async {
      await service.send(_request(idempotencyKey: 'job-a'));
      await service.send(_request(idempotencyKey: 'job-b'));

      drainer.release = true;
      await drainer.drain();

      expect(
        composeApi.composeBodies.map((b) => b['idempotencyKey']),
        ['job-a', 'job-b'],
      );
    });

    test('failedOps stream is the drainer stream (no auto-rollback surface)',
        () async {
      expect(service.failedOps(), isA<Stream<List<OutboxOp>>>());
    });
  });

  group('ComposeService.undoSend', () {
    test('enqueues undoSend:<id>, drain hits undo-send for the id', () async {
      final opId = await service.undoSend('m-1');

      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(pending.single.opId, opId);
      expect(pending.single.action, OutboxAction.undoSend);
      expect(pending.single.idempotencyKey, 'undoSend:m-1');
      expect(pending.single.emailIds, ['m-1']);

      drainer.release = true;
      await drainer.drain();

      expect(composeApi.undoSendCalls, ['m-1']);
      expect(await store.pendingOps(), isEmpty);
    });

    test('double undoSend of the same id dedupes', () async {
      final first = await service.undoSend('m-2');
      final second = await service.undoSend('m-2');

      expect(second, first);
      expect(await store.pendingOps(), hasLength(1));

      drainer.release = true;
      await drainer.drain();
      expect(composeApi.undoSendCalls, ['m-2']);
    });
  });
}
