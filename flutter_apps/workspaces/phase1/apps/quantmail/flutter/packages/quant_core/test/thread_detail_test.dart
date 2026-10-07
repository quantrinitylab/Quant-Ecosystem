// ============================================================================
// quant_core - thread-detail tests (M5: W1; M6 part 2)
//
// Tests for [ThreadDetailRepository] (real class) and
// [threadDetailProvider] family, driven over a mock [HttpClientAdapter]
// transport (same recording pattern as `test/mail_api_test.dart`) with
// in-memory [MailCache]/[ThreadListCache] fakes:
//
// Repository:
// - fetchThread resolves over the network and indexes the detail;
// - getCachedThread serves the indexed detail with zero HTTP calls;
// - getCachedThread tier 2: restores summary + messages cross-session from
//   the drift caches (new detail instance, zero network);
// - getCachedThread tier 2 with no cached messages: summary-only detail;
// - markThreadRead writes the optimistic state to the caches first, then
//   confirms with exactly one POST /emails/batch (markRead action);
// - a second markThreadRead is a no-op (idempotent, no network);
// - confirmation failure rolls back: caches rewritten from the
//   authoritative network re-fetch;
// - confirmation failure + dead network restores the pre-optimistic
//   snapshot instead;
// - a thread with no messages resolves to success without any batch call.
// - (NOTE: markThreadRead is deprecated as of M6 part 2 — the modifier
//   queue owns server confirms. These tests intentionally exercise the
//   deprecated inline path until it is removed after the UI migration.)
//
// Providers:
// - build() resolves over the network when cold;
// - build() surfaces failures as AsyncError carrying ThreadDetailException;
// - markReadOptimistic() flips state to read instantly, calls the mutation
//   service exactly once with the unread ids, returns true, and issues NO
//   inline batch (no double-send);
// - markReadOptimistic() never rolls back — the flipped state stands and
//   true is returned even though the queue (not the notifier) will surface
//   a later failure on failedOps;
// - the family isolates state per thread id;
// - refresh() re-fetches from the network.
//
// DriftMailCache.readEmailsForThread (real drift, MailDatabase.memory()):
// - round-trip: only the thread's emails, date-ascending;
// - empty when nothing matches; null dates sort last;
// - corrupt payload rows are skipped defensively.
//
// failedOpsProvider:
// - emits the drainer failed-ops stream as failures occur.
//
// Run: `flutter test test/thread_detail_test.dart`
// ============================================================================

// ignore_for_file: deprecated_member_use_from_same_package

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/drift_mail_cache.dart';
import 'package:quant_core/src/mail/cache/drift_thread_cache.dart';
import 'package:quant_core/src/mail/cache/mail_database.dart';
import 'package:quant_core/src/mail/cache/thread_cache.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/mail_providers.dart';
import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/outbox/outbox_drainer.dart';
import 'package:quant_core/src/mail/outbox/outbox_op.dart';
import 'package:quant_core/src/mail/outbox/outbox_providers.dart';
import 'package:quant_core/src/mail/outbox/outbox_store.dart';
import 'package:quant_core/src/mail/thread_detail_providers.dart';
import 'package:quant_core/src/mail/thread_detail_repository.dart';
import 'package:quant_core/src/mail/thread_mutation_service.dart';
import 'package:quant_core/src/mail/threads_api.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A single HTTP request observed by [_RecordingAdapter].
class _RecordedRequest {
  final String method;
  final String path;
  final Map<String, dynamic> headers;
  final Map<String, dynamic>? jsonBody;
  final Map<String, String> queryParams;

  const _RecordedRequest({
    required this.method,
    required this.path,
    required this.headers,
    required this.queryParams,
    this.jsonBody,
  });
}

/// Test-double [HttpClientAdapter]: records every request and answers from a
/// scripted responder. Same shape as the one in `test/mail_api_test.dart`.
class _RecordingAdapter implements HttpClientAdapter {
  final List<_RecordedRequest> requests = <_RecordedRequest>[];
  Future<ResponseBody> Function(_RecordedRequest request)? responder;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    Map<String, dynamic>? body;
    if (requestStream != null) {
      final bytes = await requestStream.fold<List<int>>(
        <int>[],
        (acc, chunk) => acc..addAll(chunk),
      );
      if (bytes.isNotEmpty) {
        final decoded = jsonDecode(utf8.decode(bytes));
        if (decoded is Map<String, dynamic>) body = decoded;
      }
    }
    final recorded = _RecordedRequest(
      method: options.method,
      path: options.uri.path,
      headers: Map<String, dynamic>.from(options.headers),
      queryParams: Map<String, String>.from(options.uri.queryParameters),
      jsonBody: body,
    );
    requests.add(recorded);
    final respond = responder;
    if (respond == null) {
      throw StateError('_RecordingAdapter.responder not configured');
    }
    return respond(recorded);
  }

  @override
  void close({bool force = false}) {}
}

/// Builds a JSON [ResponseBody] with the given status code.
ResponseBody _json(Map<String, dynamic> json, int statusCode) =>
    ResponseBody.fromString(
      jsonEncode(json),
      statusCode,
      headers: const {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// Real [QuantApiClient] (full interceptor stack) over the recording
/// transport. The token manager holds NO tokens, so failures are fully
/// deterministic.
QuantApiClient _makeClient(_RecordingAdapter adapter) {
  final tokens = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(tokens.dispose);
  final dio = Dio(BaseOptions(baseUrl: 'https://test.invalid'))
    ..httpClientAdapter = adapter;
  return QuantApiClient(
    config: const QuantApiConfig(
      baseUrl: 'https://test.invalid',
      refreshEndpoint: '/oauth/token',
    ),
    tokenManager: tokens,
    dio: dio,
  );
}

/// In-memory [MailCache] fake.
class _FakeMailCache implements MailCache {
  final Map<String, Email> emails = <String, Email>{};
  final Map<String, PaginatedEmails> pages = <String, PaginatedEmails>{};

  String _key(int page, int pageSize, String? folderId, FolderType? folderType) =>
      '$page|$pageSize|${folderId ?? folderType?.name ?? ''}';

  @override
  Future<PaginatedEmails?> readCachedPage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
  }) async =>
      pages[_key(page, pageSize, folderId, folderType)];

  @override
  Future<void> writePage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
    required PaginatedEmails result,
  }) async {
    pages[_key(page, pageSize, folderId, folderType)] = result;
  }

  @override
  Future<Email?> readEmail(String id) async => emails[id];

  @override
  Future<void> writeEmail(Email email) async {
    emails[email.id] = email;
  }

  @override
  Future<List<Email>> readEmailsForThread(String threadId) async {
    final matches =
        emails.values.where((e) => e.threadId == threadId).toList();
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
  Future<void> clear() async {
    emails.clear();
    pages.clear();
  }
}

/// Minimal in-memory [ThreadListCache] fake; only [upsertThread] matters
/// here (the optimistic summary write), the rest is inert.
class _FakeThreadListCache implements ThreadListCache {
  final Map<String, ThreadSummary> summaries = <String, ThreadSummary>{};

  @override
  Future<void> upsertThread(ThreadSummary thread) async {
    summaries[thread.id] = thread;
  }

  @override
  Future<ThreadSummary?> readThread(String threadId) async =>
      summaries[threadId];

  @override
  Future<CachedThreadPage?> readThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
  }) async =>
      null;

  @override
  Future<void> writeThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
    required List<ThreadSummary> threads,
    required bool hasMore,
  }) async {}

  @override
  Future<void> deleteThread(String threadId) async {
    summaries.remove(threadId);
  }

  @override
  Future<String?> readSyncCursor() async => null;

  @override
  Future<void> writeSyncCursor(String cursor) async {}

  @override
  Future<void> clear() async => summaries.clear();
}

/// Email JSON fixture.
Map<String, dynamic> _emailJson(String id,
        {String threadId = 't1', bool isRead = false}) =>
    <String, dynamic>{
      'id': id,
      'threadId': threadId,
      'subject': 'Subject of $id',
      'from': {'email': 'a@example.com', 'name': 'A'},
      'isRead': isRead,
    };

/// Thread-detail payload fixture: summary under `thread`, messages under
/// `messages` (one of the defensive shapes `ThreadsApi.resolveThread`
/// accepts).
Map<String, dynamic> _threadDetailPayload(
  String id,
  List<Map<String, dynamic>> messages,
) =>
    <String, dynamic>{
      'thread': {
        'id': id,
        'subject': 'Thread $id',
        'isRead': false,
        'messageCount': messages.length,
      },
      'messages': messages,
    };

/// Serves `GET /threads/<id>` with the detail payload and
/// `POST /emails/batch` with success.
void _serveThreadOk(
  _RecordingAdapter adapter,
  String id,
  List<Map<String, dynamic>> messages,
) {
  adapter.responder = (req) async {
    if (req.method == 'GET' && req.path == '/threads/$id') {
      return _json(
        {'success': true, 'data': _threadDetailPayload(id, messages)},
        200,
      );
    }
    if (req.method == 'POST' && req.path == '/emails/batch') {
      return _json(
        {'success': true, 'data': <String, dynamic>{}},
        200,
      );
    }
    return _json({'code': 'NOT_FOUND', 'message': 'unexpected request'}, 404);
  };
}

/// Serves `GET /threads/<id>` with the detail payload but fails
/// `POST /emails/batch` with a 500.
void _serveThreadBatchFails(
  _RecordingAdapter adapter,
  String id,
  List<Map<String, dynamic>> messages,
) {
  adapter.responder = (req) async {
    if (req.method == 'GET' && req.path == '/threads/$id') {
      return _json(
        {'success': true, 'data': _threadDetailPayload(id, messages)},
        200,
      );
    }
    if (req.method == 'POST' && req.path == '/emails/batch') {
      return _json({'code': 'DOWN', 'message': 'batch exploded'}, 500);
    }
    return _json({'code': 'NOT_FOUND', 'message': 'unexpected request'}, 404);
  };
}

/// Builds the real repository over the scripted transport and fake caches.
ThreadDetailRepository _makeRepo(
  _RecordingAdapter adapter,
  _FakeMailCache mailCache,
  _FakeThreadListCache threadCache,
) {
  final client = _makeClient(adapter);
  return ThreadDetailRepository(
    ThreadRepository(ThreadsApi(client), mailCache),
    EmailsApi(client),
    mailCache,
    threadCache,
  );
}

/// Provider container with [threadDetailRepositoryProvider] overridden by
/// the real repository under test, and [threadMutationServiceProvider]
/// overridden by [service] when given (the notifier's modifier-queue
/// entry point — tests that exercise `markReadOptimistic` pass a
/// recording double so no real store/drainer/database is touched).
ProviderContainer _makeContainer(
  ThreadDetailRepository repo, {
  ThreadMutationService? service,
}) {
  final container = ProviderContainer(
    overrides: [
      threadDetailRepositoryProvider.overrideWithValue(repo),
      if (service != null)
        threadMutationServiceProvider.overrideWithValue(service),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Never-called HTTP client for constructor-only doubles (the transport is
/// never used: these doubles override every exercised entry point).
QuantApiClient _dummyClient() {
  final tokens = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(tokens.dispose);
  return QuantApiClient(
    config: const QuantApiConfig(
      baseUrl: 'https://example.invalid',
      refreshEndpoint: '/oauth/token',
    ),
    tokenManager: tokens,
  );
}

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

/// Inert [OutboxStore]: only satisfies the [ThreadMutationService]
/// constructor — the recording doubles override every exercised method.
class _NoopStore implements OutboxStore {
  @override
  Future<OutboxOp> enqueue(OutboxOp op) => throw UnimplementedError();

  @override
  Future<List<OutboxOp>> pendingOps() => throw UnimplementedError();

  @override
  Future<List<OutboxOp>> failedOps() => throw UnimplementedError();

  @override
  Future<void> markDispatched(String opId) => throw UnimplementedError();

  @override
  Future<void> markFailed(String opId, {bool permanent = true}) =>
      throw UnimplementedError();

  @override
  Future<void> remove(String opId) => throw UnimplementedError();

  @override
  Future<void> incrementAttempts(String opId) => throw UnimplementedError();

  @override
  Future<void> requeue(String opId) => throw UnimplementedError();
}

/// Recording [ThreadMutationService] double: [markRead] records its call
/// and returns — no local flip, no enqueue, no drain, no network.
class _RecordingService extends ThreadMutationService {
  _RecordingService({OutboxDrainer? drainer})
      : super(
          repository: ThreadDetailRepository(
            ThreadRepository(ThreadsApi(_dummyClient())),
            EmailsApi(_dummyClient()),
          ),
          store: _NoopStore(),
          drainer: drainer ??
              OutboxDrainer(
                store: _NoopStore(),
                emails: EmailsApi(_dummyClient()),
                compose: _ScriptedComposeApi(),
              ),
        );

  int markReadCalls = 0;
  String? lastThreadId;
  List<String>? lastMessageIds;

  @override
  Future<void> markRead(String threadId, List<String> messageIds) async {
    markReadCalls++;
    lastThreadId = threadId;
    lastMessageIds = List<String>.of(messageIds);
  }
}

/// [OutboxDrainer] whose [failedOps] getter serves a test-owned stream —
/// for the [failedOpsProvider] smoke test.
class _StreamDrainer extends OutboxDrainer {
  _StreamDrainer(this._controller)
      : super(
          store: _NoopStore(),
          emails: EmailsApi(_dummyClient()),
          compose: _ScriptedComposeApi(),
        );

  final StreamController<List<OutboxOp>> _controller;

  @override
  Stream<List<OutboxOp>> get failedOps => _controller.stream;
}

void main() {
  group('ThreadDetailRepository', () {
    test('fetchThread resolves over the network and indexes the detail',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final mailCache = _FakeMailCache();
      final repo = _makeRepo(adapter, mailCache, _FakeThreadListCache());

      final result = await repo.fetchThread('t1');

      expect(result.success, isTrue);
      expect(result.data, isNotNull);
      expect(result.data!.summary.id, 't1');
      expect(result.data!.messages.map((m) => m.id).toList(), ['m1', 'm2']);

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/threads/t1');

      // Write-through: messages landed in the mail cache.
      expect((await mailCache.readEmail('m1'))?.isRead, isFalse);
      expect((await mailCache.readEmail('m2'))?.isRead, isFalse);
    });

    test('getCachedThread serves the indexed detail with zero HTTP calls',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1')]);
      final repo = _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache());

      await repo.fetchThread('t1');
      adapter.requests.clear();

      final cached = await repo.getCachedThread('t1');

      expect(cached, isNotNull);
      expect(cached!.summary.id, 't1');
      expect(cached.messages.single.id, 'm1');
      expect(adapter.requests, isEmpty,
          reason: 'cache-first must not touch the network');
    });

    test('getCachedThread returns null when cold', () async {
      final adapter = _RecordingAdapter();
      final repo = _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache());

      expect(await repo.getCachedThread('t1'), isNull);
      expect(adapter.requests, isEmpty);
    });

    test(
        'getCachedThread tier 2: restores summary + messages cross-session '
        'from the drift caches', () async {
      final db = MailDatabase.memory();
      addTearDown(db.close);
      final mailCache = DriftMailCache(db);
      final threadCache = DriftThreadCache(db);

      // Seed as a previous session would: one summary row + message rows.
      await threadCache.upsertThread(const ThreadSummary(
        id: 't1',
        subject: 'Hello',
        snippet: 'world',
        messageCount: 2,
        isRead: false,
      ));
      const from = EmailAddress(email: 'a@example.com');
      await mailCache.writeEmail(Email(
        id: 'm-new',
        threadId: 't1',
        from: from,
        date: DateTime.utc(2026, 1, 2),
      ));
      await mailCache.writeEmail(Email(
        id: 'm-old',
        threadId: 't1',
        from: from,
        date: DateTime.utc(2026, 1, 1),
      ));
      await mailCache.writeEmail(Email(
        id: 'm-other',
        threadId: 't9',
        from: from,
        date: DateTime.utc(2026, 1, 3),
      ));

      // Cold session: a fresh repository with an empty _detailIndex.
      final adapter = _RecordingAdapter();
      final repo = ThreadDetailRepository(
        ThreadRepository(ThreadsApi(_makeClient(adapter)), mailCache),
        EmailsApi(_makeClient(adapter)),
        mailCache,
        threadCache,
      );

      final cached = await repo.getCachedThread('t1');

      expect(cached, isNotNull);
      expect(cached!.summary.id, 't1');
      expect(cached.summary.subject, 'Hello');
      expect(cached.messages.map((m) => m.id).toList(), ['m-old', 'm-new'],
          reason: 'messages restored date-ascending; other-thread mail '
              'excluded');
      expect(adapter.requests, isEmpty,
          reason: 'cross-session restore touches no network');
    });

    test(
        'getCachedThread tier 2 with no cached messages returns a '
        'summary-only detail', () async {
      final db = MailDatabase.memory();
      addTearDown(db.close);
      final mailCache = DriftMailCache(db);
      final threadCache = DriftThreadCache(db);

      await threadCache.upsertThread(const ThreadSummary(
        id: 't1',
        subject: 'Hello',
        isRead: false,
      ));

      final adapter = _RecordingAdapter();
      final repo = ThreadDetailRepository(
        ThreadRepository(ThreadsApi(_makeClient(adapter)), mailCache),
        EmailsApi(_makeClient(adapter)),
        mailCache,
        threadCache,
      );

      final cached = await repo.getCachedThread('t1');

      expect(cached, isNotNull);
      expect(cached!.summary.id, 't1');
      expect(cached.messages, isEmpty,
          reason: 'nothing cached for the thread: header still paints, '
              'messages stay empty');
      expect(adapter.requests, isEmpty);
    });

    test('markThreadRead: optimistic cache write, then one batch confirm',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final mailCache = _FakeMailCache();
      final threadCache = _FakeThreadListCache();
      final repo = _makeRepo(adapter, mailCache, threadCache);

      await repo.fetchThread('t1');
      adapter.requests.clear();

      final result = await repo.markThreadRead('t1');

      expect(result.success, isTrue);
      expect(
        result.data!.messages.every((m) => m.isRead),
        isTrue,
        reason: 'the returned detail reflects the confirmed read state',
      );

      // Exactly one batch request carrying both message ids.
      expect(adapter.requests, hasLength(1));
      final batch = adapter.requests.single;
      expect(batch.method, 'POST');
      expect(batch.path, '/emails/batch');
      expect(batch.jsonBody?['action'], 'markRead');
      expect(
        (batch.jsonBody?['emailIds'] as List).map((e) => e.toString()).toList(),
        ['m1', 'm2'],
      );

      // Optimistic writes landed in both caches before confirmation.
      expect((await mailCache.readEmail('m1'))?.isRead, isTrue);
      expect((await mailCache.readEmail('m2'))?.isRead, isTrue);
      expect(threadCache.summaries['t1']?.isRead, isTrue,
          reason: 'the inbox summary flips to read too');
    });

    test('markThreadRead is idempotent: no network when already read',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final repo = _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache());

      await repo.fetchThread('t1');
      final first = await repo.markThreadRead('t1');
      expect(first.success, isTrue);
      adapter.requests.clear();

      final second = await repo.markThreadRead('t1');

      expect(second.success, isTrue);
      expect(adapter.requests, isEmpty,
          reason: 'all messages already read: no batch call issued');
    });

    test('markThreadRead skips already-read messages in the batch', () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1',
          [_emailJson('m1', isRead: true), _emailJson('m2')]);
      final repo = _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache());

      await repo.fetchThread('t1');
      adapter.requests.clear();
      final result = await repo.markThreadRead('t1');

      expect(result.success, isTrue);
      expect(adapter.requests, hasLength(1));
      expect(
        (adapter.requests.single.jsonBody?['emailIds'] as List)
            .map((e) => e.toString())
            .toList(),
        ['m2'],
        reason: 'only the unread message is sent to the server',
      );
    });

    test(
        'markThreadRead failure rolls back to the authoritative network state',
        () async {
      final adapter = _RecordingAdapter();
      // The server still reports the messages as UNREAD (the markRead batch
      // never landed), so the rollback must restore unread state.
      _serveThreadBatchFails(
          adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final mailCache = _FakeMailCache();
      final threadCache = _FakeThreadListCache();
      final repo = _makeRepo(adapter, mailCache, threadCache);

      await repo.fetchThread('t1');
      adapter.requests.clear();

      final result = await repo.markThreadRead('t1');

      expect(result.success, isFalse);
      expect(result.error, isNotNull);

      // Optimistic write first, then the authoritative re-fetch.
      expect(adapter.requests.map((r) => '${r.method} ${r.path}').toList(), [
        'POST /emails/batch',
        'GET /threads/t1',
      ]);

      // Caches no longer claim the messages are read.
      expect((await mailCache.readEmail('m1'))?.isRead, isFalse);
      expect((await mailCache.readEmail('m2'))?.isRead, isFalse);
      expect(threadCache.summaries['t1']?.isRead, isFalse);
      final rolledBack = await repo.getCachedThread('t1');
      expect(rolledBack!.messages.every((m) => !m.isRead), isTrue);
    });

    test(
        'markThreadRead failure + dead network restores the pre-optimistic '
        'snapshot', () async {
      final adapter = _RecordingAdapter();
      var batchShouldFail = false;
      adapter.responder = (req) async {
        if (req.method == 'POST' && req.path == '/emails/batch') {
          return batchShouldFail
              ? _json({'code': 'DOWN', 'message': 'batch exploded'}, 500)
              : _json({'success': true, 'data': <String, dynamic>{}}, 200);
        }
        if (req.method == 'GET' && req.path == '/threads/t1') {
          // First the initial fetch succeeds; every later GET dies, so the
          // rollback re-fetch cannot reach the network either.
          if (adapter.requests
                  .where((r) => r.method == 'GET')
                  .length >
              1) {
            return _json({'code': 'DOWN', 'message': 'offline'}, 500);
          }
          return _json(
            {
              'success': true,
              'data': _threadDetailPayload('t1', [_emailJson('m1')])
            },
            200,
          );
        }
        return _json({'code': 'NOT_FOUND', 'message': 'unexpected'}, 404);
      };
      final mailCache = _FakeMailCache();
      final repo = _makeRepo(adapter, mailCache, _FakeThreadListCache());

      await repo.fetchThread('t1');
      batchShouldFail = true;

      final result = await repo.markThreadRead('t1');

      expect(result.success, isFalse);
      // The snapshot (unread) was written back: the cache stays honest.
      expect((await mailCache.readEmail('m1'))?.isRead, isFalse);
      final restored = await repo.getCachedThread('t1');
      expect(restored!.messages.single.isRead, isFalse);
    });

    test('markThreadRead on a message-less thread succeeds without a batch',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', const []);
      final repo = _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache());

      await repo.fetchThread('t1');
      adapter.requests.clear();

      final result = await repo.markThreadRead('t1');

      expect(result.success, isTrue);
      expect(result.data!.messages, isEmpty);
      expect(adapter.requests, isEmpty,
          reason: 'nothing to mark: no batch call issued');
    });
  });

  group('threadDetailProvider', () {
    test('build resolves over the network when cold', () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final container =
          _makeContainer(_makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()));

      final detail = await container.read(threadDetailProvider('t1').future);

      expect(detail.summary.id, 't1');
      expect(detail.messages.map((m) => m.id).toList(), ['m1', 'm2']);
      expect(
        adapter.requests.where((r) => r.method == 'GET'),
        hasLength(1),
      );
    });

    test('build surfaces failures as ThreadDetailException AsyncError',
        () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async =>
            _json({'code': 'DOWN', 'message': 'backend exploded'}, 500);
      final container =
          _makeContainer(_makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()));

      await expectLater(
        container.read(threadDetailProvider('t1').future),
        throwsA(isA<ThreadDetailException>()),
      );
      final state = container.read(threadDetailProvider('t1'));
      expect(state.hasError, isTrue);
      expect(state.error, isA<ThreadDetailException>());
    });

    test(
        'markReadOptimistic flips state instantly and enqueues via the '
        'mutation service (no inline batch)', () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final service = _RecordingService();
      final container = _makeContainer(
        _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()),
        service: service,
      );

      await container.read(threadDetailProvider('t1').future);
      final queued = await container
          .read(threadDetailProvider('t1').notifier)
          .markReadOptimistic();

      expect(queued, isTrue, reason: 'true once the op is enqueued');
      final state = container.read(threadDetailProvider('t1'));
      expect(state.value!.messages.every((m) => m.isRead), isTrue);

      // Exactly one service call with the thread id and the unread ids.
      expect(service.markReadCalls, 1);
      expect(service.lastThreadId, 't1');
      expect(service.lastMessageIds, ['m1', 'm2']);

      // The queue owns the server confirm: no inline POST /emails/batch.
      expect(
        adapter.requests
            .where((r) => r.method == 'POST' && r.path == '/emails/batch'),
        isEmpty,
        reason: 'calling the repository confirm too would double-send',
      );
    });

    test(
        'markReadOptimistic sends only the unread ids to the service', () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1',
          [_emailJson('m1', isRead: true), _emailJson('m2')]);
      final service = _RecordingService();
      final container = _makeContainer(
        _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()),
        service: service,
      );

      await container.read(threadDetailProvider('t1').future);
      final queued = await container
          .read(threadDetailProvider('t1').notifier)
          .markReadOptimistic();

      expect(queued, isTrue);
      expect(service.markReadCalls, 1);
      expect(service.lastMessageIds, ['m2'],
          reason: 'already-read messages never reach the queue');
    });

    test(
        'markReadOptimistic never rolls back: the flipped state stands and '
        'true is returned (failures surface on failedOps)', () async {
      final adapter = _RecordingAdapter();
      _serveThreadOk(adapter, 't1', [_emailJson('m1'), _emailJson('m2')]);
      final service = _RecordingService();
      final container = _makeContainer(
        _makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()),
        service: service,
      );

      await container.read(threadDetailProvider('t1').future);
      // Under the old contract a failed confirm restored the unread state
      // and returned false. The new contract: enqueue → true, no rollback,
      // the queue's failedOps stream is the only failure surface.
      final queued = await container
          .read(threadDetailProvider('t1').notifier)
          .markReadOptimistic();

      expect(queued, isTrue);
      final state = container.read(threadDetailProvider('t1'));
      expect(state.value!.messages.every((m) => m.isRead), isTrue,
          reason: 'no rollback — the instant flip is never reverted');
    });

    test('family isolates state per thread id', () async {
      final adapter = _RecordingAdapter();
      adapter.responder = (req) async {
        if (req.method == 'GET' && req.path == '/threads/t1') {
          return _json(
            {
              'success': true,
              'data': _threadDetailPayload('t1', [_emailJson('m1', threadId: 't1')])
            },
            200,
          );
        }
        if (req.method == 'GET' && req.path == '/threads/t2') {
          return _json(
            {
              'success': true,
              'data': _threadDetailPayload('t2', [_emailJson('m2', threadId: 't2')])
            },
            200,
          );
        }
        if (req.method == 'POST' && req.path == '/emails/batch') {
          return _json({'success': true, 'data': <String, dynamic>{}}, 200);
        }
        return _json({'code': 'NOT_FOUND', 'message': 'unexpected'}, 404);
      };
      final container =
          _makeContainer(_makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()),
              service: _RecordingService());

      await container.read(threadDetailProvider('t1').future);
      await container.read(threadDetailProvider('t2').future);

      final confirmed = await container
          .read(threadDetailProvider('t1').notifier)
          .markReadOptimistic();

      expect(confirmed, isTrue);
      expect(
        container
            .read(threadDetailProvider('t1'))
            .value!
            .messages
            .every((m) => m.isRead),
        isTrue,
      );
      expect(
        container
            .read(threadDetailProvider('t2'))
            .value!
            .messages
            .every((m) => !m.isRead),
        isTrue,
        reason: 'marking t1 read leaves the t2 family member untouched',
      );
    });

    test('refresh re-fetches the thread from the network', () async {
      final adapter = _RecordingAdapter();
      var subject = 'v1';
      adapter.responder = (req) async {
        if (req.method == 'GET' && req.path == '/threads/t1') {
          return _json(
            {
              'success': true,
              'data': {
                'thread': {'id': 't1', 'subject': subject},
                'messages': [_emailJson('m1')],
              }
            },
            200,
          );
        }
        return _json({'code': 'NOT_FOUND', 'message': 'unexpected'}, 404);
      };
      final container =
          _makeContainer(_makeRepo(adapter, _FakeMailCache(), _FakeThreadListCache()));

      await container.read(threadDetailProvider('t1').future);
      expect(container.read(threadDetailProvider('t1')).value!.summary.subject,
          'v1');

      subject = 'v2';
      await container.read(threadDetailProvider('t1').notifier).refresh();

      expect(container.read(threadDetailProvider('t1')).value!.summary.subject,
          'v2');
      expect(
        adapter.requests.where((r) => r.method == 'GET'),
        hasLength(2),
        reason: 'build fetched once, refresh fetched again',
      );
    });
  });

  group('DriftMailCache.readEmailsForThread', () {
    late MailDatabase db;
    late DriftMailCache cache;

    setUp(() {
      db = MailDatabase.memory();
      cache = DriftMailCache(db);
      addTearDown(db.close);
    });

    Email email(String id, String threadId, DateTime? date) => Email(
          id: id,
          threadId: threadId,
          from: const EmailAddress(email: 'a@example.com'),
          date: date,
        );

    test('round-trip: only the thread\u2019s emails, date-ascending',
        () async {
      await cache.writeEmail(email('m1', 'tA', DateTime.utc(2026, 1, 3)));
      await cache.writeEmail(email('m2', 'tA', DateTime.utc(2026, 1, 1)));
      await cache.writeEmail(email('m3', 'tB', DateTime.utc(2026, 1, 2)));

      final result = await cache.readEmailsForThread('tA');

      expect(result.map((e) => e.id).toList(), ['m2', 'm1'],
          reason: 'other-thread mail excluded, oldest first');
    });

    test('empty list when no cached email matches', () async {
      await cache.writeEmail(email('m1', 'tB', DateTime.utc(2026, 1, 1)));

      expect(await cache.readEmailsForThread('tA'), isEmpty);
      expect(await cache.readEmailsForThread('missing'), isEmpty);
    });

    test('null dates sort last', () async {
      await cache.writeEmail(email('m1', 'tA', null));
      await cache.writeEmail(email('m2', 'tA', DateTime.utc(2026, 1, 1)));

      final result = await cache.readEmailsForThread('tA');

      expect(result.map((e) => e.id).toList(), ['m2', 'm1']);
    });

    test('corrupt payload rows are skipped defensively', () async {
      await cache.writeEmail(email('m1', 'tA', DateTime.utc(2026, 1, 1)));
      // A row no JSON parser can read — the read must not poison on it.
      await db.into(db.cachedEmails).insert(
            CachedEmailsCompanion(
              id: const Value('corrupt'),
              payloadJson: const Value('{not valid json'),
            ),
          );

      final result = await cache.readEmailsForThread('tA');

      expect(result.map((e) => e.id).toList(), ['m1']);
    });
  });

  group('failedOpsProvider', () {
    test('emits the drainer failed-ops stream as failures occur', () async {
      final controller = StreamController<List<OutboxOp>>();
      addTearDown(controller.close);
      final service =
          _RecordingService(drainer: _StreamDrainer(controller));
      final container = ProviderContainer(
        overrides: [threadMutationServiceProvider.overrideWithValue(service)],
      );
      addTearDown(container.dispose);

      final op = OutboxOp(
        idempotencyKey: 't1:markRead',
        action: OutboxAction.markRead,
        emailIds: const ['m1'],
      );
      controller.add([op]);

      final first = await container.read(failedOpsProvider.future);

      expect(first, hasLength(1));
      expect(first.single.idempotencyKey, 't1:markRead');
      expect(first.single.emailIds, ['m1']);
    });
  });
}
