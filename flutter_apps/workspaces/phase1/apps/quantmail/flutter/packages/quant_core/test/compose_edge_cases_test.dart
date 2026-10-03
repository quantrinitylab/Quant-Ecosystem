// ============================================================================
// quant_core - compose critical-path edge cases (zero-defect QA, 2026-10-03)
//
// Pins the M7 compose critical paths that had NO dedicated coverage:
// - empty To → service throws synchronously (before any enqueue/drain)
// - invalid email format → service-level behavior + the chips-field gate
// - empty body / empty subject → allowed (subjectless/bodiless mail is legal)
// - offline enqueue → drainer holds the op (timeout = retryable, stays pending)
// - slow network → timeout first, success on retry, exactly one server send
//   per successful dispatch (no duplicate POST after a retry)
// - undo-send window expiry → 400 is permanent (surfaced on failedOps,
//   never retried forever)
//
// Scripted fakes only; a REAL in-memory drift store under every test.
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

/// Scripted [ComposeApi] with a hookable network script; records every
/// call so retry/no-duplicate assertions are exact.
class _ScriptedComposeApi extends ComposeApi {
  _ScriptedComposeApi() : super(_dummyClient());

  /// Recorded `composeRaw` bodies, in call order.
  final List<Map<String, dynamic>> composeBodies = [];

  /// Recorded `undoSend` ids, in call order.
  final List<String> undoSendCalls = [];

  ApiResult<Map<String, dynamic>> Function(Map<String, dynamic>)? onComposeRaw;
  ApiResult<void> Function(String)? onUndoSend;

  int composeCallCount = 0;

  @override
  Future<ApiResult<Map<String, dynamic>>> composeRaw(
    Map<String, dynamic> body,
  ) async {
    composeCallCount++;
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

/// Never-called [EmailsApi] (compose dispatch never touches the batch path).
class _UnusedEmailsApi extends EmailsApi {
  _UnusedEmailsApi() : super(_dummyClient());
}

ComposeRequest _request({
  String subject = 'Hi',
  String bodyText = 'Body',
  String? idempotencyKey,
  List<EmailAddress> to = const [EmailAddress(email: 'bob@example.com')],
}) =>
    ComposeRequest(
      to: to,
      subject: subject,
      bodyText: bodyText,
      idempotencyKey: idempotencyKey,
    );

OutboxOp _sendOp(String key, Map<String, dynamic> payload) => OutboxOp(
      idempotencyKey: key,
      action: OutboxAction.send,
      emailIds: const <String>[],
      payloadJson: jsonEncode(payload),
    );

ApiResult<Map<String, dynamic>> _failCompose(int status) =>
    ApiResult.failure(
      ApiError(code: 'E$status', message: 'boom', statusCode: status),
    );

ApiResult<void> _failUndo(int status) => ApiResult<void>.failure(
      ApiError(code: 'E$status', message: 'boom', statusCode: status),
    );

void main() {
  late MailDatabase db;
  late DriftOutboxStore store;
  late _ScriptedComposeApi composeApi;
  late OutboxDrainer drainer;
  late ComposeService service;

  setUp(() {
    db = MailDatabase.memory();
    store = DriftOutboxStore(db);
    composeApi = _ScriptedComposeApi();
    drainer = OutboxDrainer(
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

  group('compose edge: validation', () {
    test('empty To (no recipients at all): service throws ArgumentError, '
        'nothing is enqueued', () async {
      await expectLater(
        service.send(_request(to: const <EmailAddress>[])),
        throwsA(isA<ArgumentError>()),
      );
      expect(await store.pendingOps(), isEmpty);
      expect(composeApi.composeCallCount, 0,
          reason: 'validation happens before any network attempt');
    });

    test('all-empty addresses: throws, nothing enqueued', () async {
      await expectLater(
        service.send(_request(to: const [EmailAddress(email: '')])),
        throwsA(isA<ArgumentError>()),
      );
      expect(await store.pendingOps(), isEmpty);
    });

    test('malformed-but-non-empty address passes service validation '
        '(defense-in-depth gap: only the chips-field regex gates format; '
        'server 400s surface on failedOps — see board defect)', () async {
      // Pinned as CURRENT behavior; strengthen only via the board defect.
      final opId = await service.send(
        _request(to: const [EmailAddress(email: 'not-an-email')]),
      );
      expect(opId, isNotEmpty);
      final pending = await store.pendingOps();
      expect(pending, hasLength(1));
      expect(
        (pending.single.payloadJson ?? '').contains('not-an-email'),
        isTrue,
      );
    });

    test('empty body is allowed: enqueues and dispatches normally', () async {
      await service.send(_request(bodyText: ''));
      expect((await store.pendingOps()), hasLength(1));
      await drainer.drain();
      expect(composeApi.composeBodies, hasLength(1));
      expect(composeApi.composeBodies.single['bodyText'], '');
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });

    test('empty subject is allowed: enqueues and dispatches normally',
        () async {
      await service.send(_request(subject: ''));
      await drainer.drain();
      expect(composeApi.composeBodies, hasLength(1));
      expect(composeApi.composeBodies.single['subject'], '');
      expect(await store.pendingOps(), isEmpty);
    });
  });

  group('compose edge: offline + slow network', () {
    test('offline enqueue: timeout (statusCode 0) is retryable — '
        'drainer holds the message, attempts++, no failedOps', () async {
      composeApi.onComposeRaw = (_) => _failCompose(0);
      await store.enqueue(_sendOp('send:job-offline', {
        'to': [
          {'email': 'bob@example.com'}
        ],
        'idempotencyKey': 'offline-1',
      }));

      await drainer.drain();

      final pending = await store.pendingOps();
      expect(pending, hasLength(1),
          reason: 'offline op is held, not lost and not failed');
      expect(pending.single.attempts, 1);
      expect(pending.single.state, OutboxState.pending);
      expect(await store.failedOps(), isEmpty);
      expect(composeApi.composeCallCount, 1);
    });

    test('slow network: timeout first, success on retry — '
        'exactly one server-accepted send, no duplicate', () async {
      var first = true;
      composeApi.onComposeRaw = (_) {
        if (first) {
          first = false;
          return _failCompose(0); // slow network times out
        }
        return ApiResult.ok(<String, dynamic>{'id': 'sent-late'});
      };
      await store.enqueue(_sendOp('send:job-slow', {
        'to': [
          {'email': 'bob@example.com'}
        ],
        'idempotencyKey': 'slow-1',
      }));

      await drainer.drain(); // attempt 1: timeout → held
      expect(await store.pendingOps(), hasLength(1));
      expect(await store.failedOps(), isEmpty);

      await drainer.drain(); // attempt 2: success → reaped

      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
      expect(composeApi.composeCallCount, 2,
          reason: 'exactly two wire attempts for one logical send');
      expect(jsonEncode(composeApi.composeBodies[0]),
          jsonEncode(composeApi.composeBodies[1]),
          reason: 'byte-passthrough: the retry posts the identical body');
    });

    test('offline then online via the service: send while timed-out stays '
        'queued; a later drain with network completes it', () async {
      composeApi.onComposeRaw = (_) => _failCompose(0);
      await service.send(_request(idempotencyKey: 'offline-service-1'));

      // Give the fire-and-forget drain a beat to run and hold the op.
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(await store.pendingOps(), hasLength(1));
      expect(await store.failedOps(), isEmpty);

      // Network comes back: the next drain completes the send.
      composeApi.onComposeRaw = null;
      await drainer.drain();

      expect(await store.pendingOps(), isEmpty);
      expect(composeApi.composeBodies, hasLength(2),
          reason: 'first attempt (timeout) + retry (success)');
    });
  });

  group('compose edge: undo-send window expiry', () {
    test('undoSend 400 (outside the 30s server window) is permanent: '
        'surfaced on failedOps, never retried', () async {
      composeApi.onUndoSend = (_) => _failUndo(400);
      await service.undoSend('msg-expired');

      // The service fired its own drain; wait a beat for dispatch.
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(await store.pendingOps(), isEmpty);
      final failed = await store.failedOps();
      expect(failed, hasLength(1));
      expect(failed.single.idempotencyKey, 'undoSend:msg-expired');
      expect(composeApi.undoSendCalls, ['msg-expired'],
          reason: 'one wire attempt only — no infinite retry loop');
    });

    test('undoSend inside the window succeeds: op reaps, no failedOps',
        () async {
      composeApi.onUndoSend = (_) => ApiResult<void>.ok(null);
      await store.enqueue(OutboxOp(
        idempotencyKey: 'undoSend:msg-live',
        action: OutboxAction.undoSend,
        emailIds: const ['msg-live'],
      ));

      await drainer.drain();

      expect(composeApi.undoSendCalls, ['msg-live']);
      expect(await store.pendingOps(), isEmpty);
      expect(await store.failedOps(), isEmpty);
    });
  });
}
