// ============================================================================
// quant_core - sent-message tracker tests (M7: compose core, W2)
//
// Tests for the ADDITIVE sent-confirmation path: [OutboxDrainer.sentOps]
// emits a [SendResult] per server-confirmed `send` op, and
// [sentMessagesProvider] records it for the undo-send window UX — over a
// REAL [OutboxDrainer] with an in-memory [OutboxStore] and scripted
// [ComposeApi]/[EmailsApi] fakes (patterns mirrored from
// compose_outbox_dispatch_test.dart and thread_mutation_service_test.dart).
// ============================================================================

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/compose/sent_tracker.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/outbox/outbox_drainer.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_providers.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:quant_foundation/quant_foundation.dart';

QuantApiClient _dummyClient() => QuantApiClient(
      config: const QuantApiConfig(
        baseUrl: 'https://example.invalid',
        refreshEndpoint: '/oauth/token',
      ),
      tokenManager: TokenManager(),
    );

/// Scripted [ComposeApi]: scriptable composeRaw results, never touches the
/// network.
class _ScriptedComposeApi extends ComposeApi {
  _ScriptedComposeApi() : super(_dummyClient());

  ApiResult<Map<String, dynamic>> Function(Map<String, dynamic>)? onComposeRaw;

  @override
  Future<ApiResult<Map<String, dynamic>>> composeRaw(
    Map<String, dynamic> body,
  ) async {
    final handler = onComposeRaw;
    if (handler != null) return handler(body);
    return ApiResult.ok(<String, dynamic>{'id': 'sent-1'});
  }

  @override
  Future<ApiResult<void>> undoSend(String id) =>
      Future.value(ApiResult<void>.ok(null));
}

/// Scripted [EmailsApi]: send ops never reach the batch path, but the
/// drainer needs a concrete instance.
class _ScriptedEmailsApi extends EmailsApi {
  _ScriptedEmailsApi() : super(_dummyClient());

  @override
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) =>
      Future.value(
          ApiResult.ok(<String, dynamic>{'results': <Map<String, dynamic>>[]}));
}

/// In-memory [OutboxStore] (mirrors thread_mutation_service_test._MemStore).
class _MemStore implements OutboxStore {
  final Map<String, OutboxOp> ops = {};

  OutboxOp? _byKey(String key) {
    for (final op in ops.values) {
      if (op.idempotencyKey == key) return op;
    }
    return null;
  }

  void _replace(String opId, OutboxOp Function(OutboxOp) update) {
    final op = ops[opId];
    if (op == null) return;
    ops[opId] = update(op);
  }

  OutboxOp _copy(OutboxOp op, {int? attempts, OutboxState? state}) {
    return OutboxOp(
      opId: op.opId,
      idempotencyKey: op.idempotencyKey,
      action: op.action,
      emailIds: op.emailIds,
      payloadJson: op.payloadJson,
      createdAt: op.createdAt,
      attempts: attempts ?? op.attempts,
      state: state ?? op.state,
    );
  }

  @override
  Future<OutboxOp> enqueue(OutboxOp op) async {
    final existing = _byKey(op.idempotencyKey);
    if (existing != null) return existing;
    ops[op.opId] = op;
    return op;
  }

  List<OutboxOp> _inState(OutboxState state) {
    final list = ops.values.where((o) => o.state == state).toList();
    list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  @override
  Future<List<OutboxOp>> pendingOps() async => _inState(OutboxState.pending);

  @override
  Future<List<OutboxOp>> failedOps() async => _inState(OutboxState.failed);

  @override
  Future<void> markDispatched(String opId) async =>
      _replace(opId, (op) => _copy(op, state: OutboxState.dispatched));

  @override
  Future<void> markFailed(String opId, {bool permanent = true}) async =>
      _replace(opId, (op) => _copy(op, state: OutboxState.failed));

  @override
  Future<void> remove(String opId) async => ops.remove(opId);

  @override
  Future<void> incrementAttempts(String opId) async =>
      _replace(opId, (op) => _copy(op, attempts: op.attempts + 1));

  @override
  Future<void> requeue(String opId) async => _replace(
        opId,
        (op) => op.state == OutboxState.failed
            ? _copy(op, state: OutboxState.pending, attempts: 0)
            : op,
      );
}

OutboxOp _sendOp(String key, Map<String, dynamic> payload) => OutboxOp(
      idempotencyKey: key,
      action: OutboxAction.send,
      emailIds: const <String>[],
      payloadJson: jsonEncode(payload),
    );

/// Polls until [sentMessagesProvider] holds [expected] infos (broadcast
/// stream delivery is async), then returns the list. Fails on timeout.
Future<List<SentMessageInfo>> _awaitInfos(
  ProviderContainer container, {
  required int expected,
}) async {
  for (var i = 0; i < 100; i++) {
    final infos = container.read(sentMessagesProvider);
    if (infos.length == expected) return infos;
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  return container.read(sentMessagesProvider);
}

void main() {
  group('extractServerMessageId', () {
    test('direct id wins', () {
      expect(extractServerMessageId({'id': 'm-1'}), 'm-1');
    });

    test('messageId fallback', () {
      expect(extractServerMessageId({'messageId': 'm-2'}), 'm-2');
    });

    test('nested message.id', () {
      expect(
        extractServerMessageId({
          'message': {'id': 'm-3'}
        }),
        'm-3',
      );
    });

    test('nested data.id', () {
      expect(
        extractServerMessageId({
          'data': {'id': 'm-4'}
        }),
        'm-4',
      );
    });

    test('emailId fallback', () {
      expect(extractServerMessageId({'emailId': 'm-5'}), 'm-5');
    });

    test('precedence: id beats messageId beats nesting', () {
      expect(
        extractServerMessageId({
          'id': 'first',
          'messageId': 'second',
          'message': {'id': 'third'},
        }),
        'first',
      );
      expect(
        extractServerMessageId({
          'messageId': 'second',
          'message': {'id': 'third'},
        }),
        'second',
      );
    });

    test('non-string id is ignored', () {
      expect(extractServerMessageId({'id': 42}), isNull);
      expect(extractServerMessageId({'id': ''}), isNull);
      expect(extractServerMessageId({'id': null}), isNull);
    });

    test('empty map and unknown shapes return null', () {
      expect(extractServerMessageId({}), isNull);
      expect(extractServerMessageId({'foo': 'bar'}), isNull);
    });

    test('non-map nesting is ignored', () {
      expect(extractServerMessageId({'message': 'm-6'}), isNull);
      expect(extractServerMessageId({'message': 7}), isNull);
      expect(extractServerMessageId({'data': ['m-7']}), isNull);
    });

    test('non-string nested id returns null', () {
      expect(
        extractServerMessageId({
          'message': {'id': 99}
        }),
        isNull,
      );
    });
  });

  group('sentMessagesProvider', () {
    test('records idempotencyKey + server message id on confirmed send',
        () async {
      final store = _MemStore();
      final composeApi = _ScriptedComposeApi()
        ..onComposeRaw =
            (_) => ApiResult.ok(<String, dynamic>{'id': 'm-1'});
      final drainer = OutboxDrainer(
        store: store,
        emails: _ScriptedEmailsApi(),
        compose: composeApi,
      );
      final container = ProviderContainer(overrides: [
        outboxDrainerProvider.overrideWithValue(drainer),
      ]);
      addTearDown(() {
        container.dispose();
        drainer.dispose();
      });

      // Subscribe BEFORE the drain: sentOps is a broadcast stream and
      // does not buffer events emitted before a listener attaches.
      container.listen<List<SentMessageInfo>>(
          sentMessagesProvider, (_, __) {});

      await store.enqueue(_sendOp('send:key-1', {'subject': 'hi'}));
      await drainer.drain();

      final infos = await _awaitInfos(container, expected: 1);
      expect(infos, hasLength(1));
      expect(infos.single.idempotencyKey, 'send:key-1');
      expect(infos.single.messageId, 'm-1');
    });

    test('400 response records nothing (failure path emits no sentOps)',
        () async {
      final store = _MemStore();
      final composeApi = _ScriptedComposeApi()
        ..onComposeRaw = (_) => ApiResult.failure(
              ApiError(code: 'E400', message: 'bad', statusCode: 400),
            );
      final drainer = OutboxDrainer(
        store: store,
        emails: _ScriptedEmailsApi(),
        compose: composeApi,
      );
      final container = ProviderContainer(overrides: [
        outboxDrainerProvider.overrideWithValue(drainer),
      ]);
      addTearDown(() {
        container.dispose();
        drainer.dispose();
      });

      container.listen<List<SentMessageInfo>>(
          sentMessagesProvider, (_, __) {});

      await store.enqueue(_sendOp('send:key-2', {'subject': 'hi'}));
      await drainer.drain();
      // Let any stray async delivery settle, then assert still empty.
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(container.read(sentMessagesProvider), isEmpty);
      // The op went down the permanent-failure path instead.
      expect(await store.failedOps(), hasLength(1));
    });

    test('two confirmed sends: both kept (retention prunes only '
        'entries older than sentMessageRetention)', () async {
      final store = _MemStore();
      var n = 0;
      final composeApi = _ScriptedComposeApi()
        ..onComposeRaw =
            (_) => ApiResult.ok(<String, dynamic>{'id': 'm-${++n}'});
      final drainer = OutboxDrainer(
        store: store,
        emails: _ScriptedEmailsApi(),
        compose: composeApi,
      );
      final container = ProviderContainer(overrides: [
        outboxDrainerProvider.overrideWithValue(drainer),
      ]);
      addTearDown(() {
        container.dispose();
        drainer.dispose();
      });

      container.listen<List<SentMessageInfo>>(
          sentMessagesProvider, (_, __) {});

      await store.enqueue(_sendOp('send:key-a', {'subject': 'one'}));
      await store.enqueue(_sendOp('send:key-b', {'subject': 'two'}));
      await drainer.drain();

      final infos = await _awaitInfos(container, expected: 2);
      expect(infos, hasLength(2));
      expect(
        infos.map((SentMessageInfo i) => i.idempotencyKey),
        <String>['send:key-a', 'send:key-b'],
      );
    });

    test('drainer sentOps stream emits SendResult with raw payload',
        () async {
      final store = _MemStore();
      final composeApi = _ScriptedComposeApi()
        ..onComposeRaw =
            (_) => ApiResult.ok(<String, dynamic>{'messageId': 'm-9'});
      final drainer = OutboxDrainer(
        store: store,
        emails: _ScriptedEmailsApi(),
        compose: composeApi,
      );
      addTearDown(drainer.dispose);

      final events = <SendResult>[];
      final sub = drainer.sentOps.listen(events.add);
      addTearDown(sub.cancel);

      await store.enqueue(_sendOp('send:key-3', {'subject': 'raw'}));
      await drainer.drain();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(events, hasLength(1));
      expect(events.single.idempotencyKey, 'send:key-3');
      expect(events.single.data, {'messageId': 'm-9'});
    });
  });
}
