// ============================================================================
// quant_core - thread mutation service tests (M6: modifier queue, W2)
//
// Tests for [ThreadMutationService] with fakes: the local flip lands
// BEFORE the drain completes (instant UI), ops enqueue with the
// documented idempotency key, the drain fires exactly once per call, and
// permanent failures surface on the failed-ops stream (no auto-rollback).
// ============================================================================

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/thread_cache.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/mail_providers.dart';
import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/outbox/outbox_drainer.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:quant_core/src/mail/thread_detail_repository.dart';
import 'package:quant_core/src/mail/thread_mutation_service.dart';
import 'package:quant_core/src/mail/threads_api.dart';
import 'package:quant_foundation/quant_foundation.dart';

QuantApiClient _dummyClient() => QuantApiClient(
      config: const QuantApiConfig(
        baseUrl: 'https://example.invalid',
        refreshEndpoint: '/oauth/token',
      ),
      tokenManager: TokenManager(),
    );

/// Never-called [ComposeApi] (this suite never enqueues send/undoSend
/// ops; the drainer just needs the dependency). Same fake pattern as
/// `test/outbox_drainer_test.dart` — the dummy client is constructed
/// but never used, so it never touches the network.
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

/// Scripted [EmailsApi]; the dummy client is never used.
class _ScriptedApi extends EmailsApi {
  _ScriptedApi() : super(_dummyClient());

  ApiResult<Map<String, dynamic>> Function(List<Map<String, dynamic>>)?
      onBatch;

  @override
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) async {
    final handler = onBatch;
    if (handler != null) return handler(operations);
    return ApiResult.ok(<String, dynamic>{'results': <Map<String, dynamic>>[]});
  }
}

class _FakeRepo extends ThreadDetailRepository {
  _FakeRepo({ThreadDetail? detail})
      : _detail = detail,
        super(
          ThreadRepository(ThreadsApi(_dummyClient())),
          _ScriptedApi(),
        );

  final ThreadDetail? _detail;

  @override
  Future<ThreadDetail?> getCachedThread(String threadId) async => _detail;
}

/// In-memory [OutboxStore] with the real dedupe contract.
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

  OutboxOp _copy(OutboxOp op,
      {int? attempts, OutboxState? state, String? payloadJson}) {
    return OutboxOp(
      opId: op.opId,
      idempotencyKey: op.idempotencyKey,
      action: op.action,
      emailIds: op.emailIds,
      payloadJson: payloadJson ?? op.payloadJson,
      createdAt: op.createdAt,
      attempts: attempts ?? op.attempts,
      state: state ?? op.state,
    );
  }

  @override
  Future<OutboxOp> enqueue(OutboxOp op) async {
    final existing = _byKey(op.idempotencyKey);
    if (existing != null) {
      if (existing.state == OutboxState.failed) {
        ops.remove(existing.opId);
      } else {
        return existing;
      }
    }
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
  Future<void> markFailed(String opId, {bool permanent = true}) async {
    if (!permanent) return incrementAttempts(opId);
    _replace(opId, (op) => _copy(op, state: OutboxState.failed));
  }

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

/// [OutboxDrainer] whose drain is gated by a [Completer] the test controls.
class _GatedDrainer extends OutboxDrainer {
  _GatedDrainer(_MemStore store)
      : super(
          store: store,
          emails: _ScriptedApi(),
          compose: _ScriptedComposeApi(),
        );

  int drainCalls = 0;
  Completer<void> gate = Completer<void>();

  @override
  Future<void> drain() {
    drainCalls++;
    return gate.future;
  }
}

class _FakeMailCache implements MailCache {
  final Map<String, Email> written = {};

  @override
  Future<void> writeEmail(Email email) async => written[email.id] = email;

  @override
  Future<List<Email>> readEmailsForThread(String threadId) async {
    final matches =
        written.values.where((e) => e.threadId == threadId).toList();
    matches.sort((a, b) {
      final ad = a.date;
      final bd = b.date;
      if (ad == null && bd == null) return 0;
      if (ad == null) return 1;
      if (bd == null) return -1;
      return ad.compareTo(bd);
    });
    return matches;
  }

  @override
  Future<PaginatedEmails?> readCachedPage(
          {required int page,
          required int pageSize,
          String? folderId,
          FolderType? folderType}) =>
      throw UnimplementedError();

  @override
  Future<void> writePage(
          {required int page,
          required int pageSize,
          String? folderId,
          FolderType? folderType,
          required PaginatedEmails result}) =>
      throw UnimplementedError();

  @override
  Future<Email?> readEmail(String id) async => written[id];

  @override
  Future<void> clear() async => written.clear();
}

class _FakeListCache implements ThreadListCache {
  final List<String> deletedThreads = [];
  final List<ThreadSummary> upserted = [];

  @override
  Future<void> deleteThread(String threadId) async =>
      deletedThreads.add(threadId);

  @override
  Future<void> upsertThread(ThreadSummary thread) async =>
      upserted.add(thread);

  @override
  Future<CachedThreadPage?> readThreadPage(
          {required int page, required int pageSize, String? folderId}) =>
      throw UnimplementedError();

  @override
  Future<void> writeThreadPage(
          {required int page,
          required int pageSize,
          String? folderId,
          required List<ThreadSummary> threads,
          required bool hasMore}) =>
      throw UnimplementedError();

  @override
  Future<String?> readSyncCursor() => throw UnimplementedError();

  @override
  Future<ThreadSummary?> readThread(String threadId) =>
      throw UnimplementedError();

  @override
  Future<void> writeSyncCursor(String cursor) => throw UnimplementedError();

  @override
  Future<void> clear() => throw UnimplementedError();
}

ThreadDetail _detail({bool isRead = false}) => ThreadDetail(      summary: ThreadSummary(
        id: 't1',
        subject: 'Hello',
        snippet: 'world',
        isRead: isRead,
      ),
      messages: [
        Email(
          id: 'm1',
          threadId: 't1',
          from: const EmailAddress(email: 'a@example.com'),
          isRead: isRead,
        ),
      ],
    );

/// Sentinel: [service] builds a default detail unless [useNoDetail] is set.
const _defaultDetail = 'default';

void main() {
  late _MemStore store;
  late _GatedDrainer drainer;
  late _FakeMailCache mailCache;
  late _FakeListCache listCache;

  ThreadMutationService service({Object? detail = _defaultDetail}) =>
      ThreadMutationService(
        repository: _FakeRepo(
          detail:
              detail == _defaultDetail ? _detail() : detail as ThreadDetail?,
        ),
        store: store,
        drainer: drainer,
        mailCache: mailCache,
        threadListCache: listCache,
      );

  setUp(() {
    store = _MemStore();
    drainer = _GatedDrainer(store);
    mailCache = _FakeMailCache();
    listCache = _FakeListCache();
  });

  group('ThreadMutationService', () {
    test('markRead: local flip lands BEFORE the drain completes', () async {
      final svc = service();
      final future = svc.markRead('t1', const ['m1']);
      await pumpEventQueue();

      // Instant UI: the cache already shows the read flip while the drain
      // is still gated.
      expect(mailCache.written['m1']?.isRead, isTrue);
      expect(
        listCache.upserted.singleWhere((t) => t.id == 't1').isRead,
        isTrue,
      );
      // Op enqueued with the documented idempotency key.
      final op = store.ops.values.single;
      expect(op.idempotencyKey, 't1:markRead');
      expect(op.action, OutboxAction.markRead);
      expect(op.emailIds, ['m1']);
      // Drain fired exactly once, still in flight.
      expect(drainer.drainCalls, 1);
      expect(drainer.gate.isCompleted, isFalse);

      drainer.gate.complete();
      await future;
    });

    test('markRead: retried call dedupes on the idempotency key', () async {
      final svc = service();
      final f1 = svc.markRead('t1', const ['m1']);
      drainer.gate.complete();
      await f1;
      drainer.gate = Completer<void>();
      final f2 = svc.markRead('t1', const ['m1']);
      drainer.gate.complete();
      await f2;
      expect(store.ops.values, hasLength(1));
      expect(drainer.drainCalls, 2);
    });

    test('markRead with no cached detail still enqueues (offline-first)',
        () async {
      final svc = service(detail: null);
      final future = svc.markRead('t1', const ['m1']);
      drainer.gate.complete();
      await future;
      expect(mailCache.written, isEmpty);
      expect(store.ops.values.single.idempotencyKey, 't1:markRead');
    });

    test('markUnread flips read state back locally', () async {
      final svc = service(detail: _detail(isRead: true));
      final future = svc.markUnread('t1', const ['m1']);
      drainer.gate.complete();
      await future;
      expect(mailCache.written['m1']?.isRead, isFalse);
      expect(
        listCache.upserted.singleWhere((t) => t.id == 't1').isRead,
        isFalse,
      );
      expect(store.ops.values.single.action, OutboxAction.markUnread);
    });

    test('archive removes the thread from the list cache locally', () async {
      final svc = service();
      final future = svc.archive('t1', const ['m1']);
      drainer.gate.complete();
      await future;
      expect(listCache.deletedThreads, ['t1']);
      final op = store.ops.values.single;
      expect(op.action, OutboxAction.archive);
      expect(op.action.batchWireName, 'archive');
    });

    test('unarchive re-inserts the cached summary locally', () async {
      final svc = service();
      final future = svc.unarchive('t1', const ['m1']);
      drainer.gate.complete();
      await future;
      expect(listCache.upserted.map((t) => t.id), contains('t1'));
      final op = store.ops.values.single;
      expect(op.action, OutboxAction.unarchive);
      // No batch wire name exists for unarchive (dedicated endpoint).
      expect(op.action.batchWireName, isNull);
    });

    test('deleteThread forwards the hard flag in payloadJson', () async {
      final svc = service();
      final soft = svc.deleteThread('t1', const ['m1']);
      drainer.gate.complete();
      await soft;
      expect(listCache.deletedThreads, ['t1']);
      expect(store.ops.values.single.payloadJson, isNull);

      store.ops.clear();
      drainer.gate = Completer<void>();
      final hard = svc.deleteThread('t1', const ['m1'], hard: true);
      drainer.gate.complete();
      await hard;
      final op = store.ops.values.single;
      expect(op.payloadJson, '{"hard":true}');
      expect(op.extras, {'hard': true});
    });

    test('failedOps stream emits permanent failures (no auto-rollback)',
        () async {
      final api = _ScriptedApi()
        ..onBatch = (_) => ApiResult.failure(
              const ApiError(
                  code: 'E400', message: 'bad', statusCode: 400),
            );
      final realDrainer = OutboxDrainer(
        store: store,
        emails: api,
        compose: _ScriptedComposeApi(),
      );
      addTearDown(realDrainer.dispose);
      final svc = ThreadMutationService(
        repository: _FakeRepo(detail: _detail()),
        store: store,
        drainer: realDrainer,
        mailCache: mailCache,
        threadListCache: listCache,
      );

      final emitted = <List<OutboxOp>>[];
      final sub = svc.failedOps().listen(emitted.add);

      await svc.markRead('t1', const ['m1']);
      for (var i = 0; i < 20 && emitted.isEmpty; i++) {
        await pumpEventQueue();
      }
      await sub.cancel();

      // The op failed permanently AND the local flip was NOT rolled back.
      expect(emitted, isNotEmpty);
      expect(emitted.last.single.action, OutboxAction.markRead);
      expect((await store.failedOps()).single.idempotencyKey, 't1:markRead');
      expect(mailCache.written['m1']?.isRead, isTrue);
    });

    test('retryOp requeues a failed op and fires the drain', () async {
      final svc = service();
      final op = OutboxOp(
        idempotencyKey: 't1:markRead',
        action: OutboxAction.markRead,
        emailIds: const ['m1'],
        attempts: 4,
        state: OutboxState.failed,
      );
      store.ops[op.opId] = op;

      final future = svc.retryOp(op.opId);
      drainer.gate.complete();
      await future;

      final pending = await store.pendingOps();
      expect(pending.single.opId, op.opId);
      expect(pending.single.attempts, 0);
      expect(drainer.drainCalls, 1);
    });

    test('discardOp drops a failed op without sending', () async {
      final svc = service();
      final op = OutboxOp(
        idempotencyKey: 't1:delete',
        action: OutboxAction.delete,
        emailIds: const ['m1'],
        state: OutboxState.failed,
      );
      store.ops[op.opId] = op;

      await svc.discardOp(op.opId);

      expect(store.ops, isEmpty);
      expect(drainer.drainCalls, 0);
    });
  });
}
