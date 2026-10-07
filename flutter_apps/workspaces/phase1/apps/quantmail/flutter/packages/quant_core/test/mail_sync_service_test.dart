// ============================================================================
// quant_core - delta-sync service tests (M4: W5)
//
// Tests for W3's real [MailSyncService] (resolved via
// [mailSyncServiceProvider]) over scripted transports:
//
// - syncNow applies a scripted `/emails/changes` page (2 upserts +
//   1 tombstone + nextCursor): threads land in the thread cache, the
//   cursor is persisted, and the follow-up call sends `since=<cursor>`;
// - a 400 INVALID_CURSOR triggers the full-resync path (didFullResync=true,
//   page 1 rewritten from GET /threads, cursor cleared).
//
// The cache is an in-memory [ThreadListCache] fake; the network is the
// recording HttpClientAdapter pattern from `test/mail_api_test.dart`.
//
// Run: `flutter test test/mail_sync_service_test.dart`
// ============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/cache_providers.dart';
import 'package:quant_core/src/mail/cache/thread_cache.dart';
import 'package:quant_core/src/mail/mail_providers.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/sync/sync_providers.dart';
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

/// Email payload fixture for the changes feed.
Map<String, dynamic> _emailJson(String id, String threadId) =>
    <String, dynamic>{
      'id': id,
      'threadId': threadId,
      'subject': 'Subject $id',
      'snippet': 'Snippet $id',
      'from': {'email': 'alice@example.com', 'name': 'Alice'},
      'to': <dynamic>[],
      'cc': <dynamic>[],
      'date': '2026-10-03T10:00:00.000Z',
      'labels': ['INBOX'],
      'isRead': false,
      'isStarred': false,
      'hasAttachments': false,
      'folderId': 'INBOX',
    };

/// In-memory [ThreadListCache] fake with a test-visible thread lookup.
class _FakeThreadListCache implements ThreadListCache {
  final Map<String, CachedThreadPage> _pages = <String, CachedThreadPage>{};
  final Map<String, ThreadSummary> _threads = <String, ThreadSummary>{};
  String? _cursor;

  String _key(int page, int pageSize, String? folderId) =>
      '$page|$pageSize|${folderId ?? ''}';

  /// Test helper: the cached thread with [id], or null.
  ThreadSummary? lookup(String id) => _threads[id];

  @override
  Future<CachedThreadPage?> readThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
  }) async =>
      _pages[_key(page, pageSize, folderId)];

  @override
  Future<void> writeThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
    required List<ThreadSummary> threads,
    required bool hasMore,
  }) async {
    for (final t in threads) {
      _threads[t.id] = t;
    }
    _pages[_key(page, pageSize, folderId)] =
        CachedThreadPage(threads: threads, hasMore: hasMore);
  }

  @override
  Future<void> upsertThread(ThreadSummary thread) async {
    _threads[thread.id] = thread;
  }

  @override
  Future<ThreadSummary?> readThread(String threadId) async =>
      _threads[threadId];

  @override
  Future<void> deleteThread(String threadId) async {
    _threads.remove(threadId);
    for (final key in _pages.keys.toList()) {
      final page = _pages[key]!;
      _pages[key] = CachedThreadPage(
        threads: page.threads.where((t) => t.id != threadId).toList(),
        hasMore: page.hasMore,
      );
    }
  }

  @override
  Future<String?> readSyncCursor() async => _cursor;

  @override
  Future<void> writeSyncCursor(String cursor) async => _cursor = cursor;

  @override
  Future<void> clear() async {
    _pages.clear();
    _threads.clear();
    _cursor = null;
  }
}

/// Container with the REAL sync service; the cache and both API seams are
/// overridden with scripted fakes.
ProviderContainer _makeContainer({
  required _FakeThreadListCache cache,
  required _RecordingAdapter changesAdapter,
  required _RecordingAdapter threadsAdapter,
}) {
  final container = ProviderContainer(
    overrides: [
      threadListCacheProvider.overrideWithValue(cache),
      emailChangesApiProvider
          .overrideWithValue(EmailChangesApi(_makeClient(changesAdapter))),
      threadsApiProvider
          .overrideWithValue(ThreadsApi(_makeClient(threadsAdapter))),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('MailSyncService.syncNow', () {
    test('applies upserts + tombstone, persists cursor, resends since',
        () async {
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 100,
        threads: const [
          ThreadSummary(id: 't-del', subject: 'Doomed'),
          ThreadSummary(id: 't-keep', subject: 'Kept'),
        ],
        hasMore: false,
      );
      final changesAdapter = _RecordingAdapter()
        ..responder = (req) async {
          // First call: no cursor yet. Later calls: since=<cursor>.
          if (!req.queryParams.containsKey('since')) {
            return _json(
              {
                'success': true,
                'data': {
                  'changes': [
                    {'id': 'e-u1', 'message': _emailJson('e-u1', 't-u1')},
                    {'id': 'e-u2', 'message': _emailJson('e-u2', 't-u2')},
                    {'id': 't-del', 'deleted': true},
                  ],
                  'nextCursor': 'c1',
                },
              },
              200,
            );
          }
          // End of feed on the follow-up call.
          return _json(
            {
              'success': true,
              'data': {'changes': <dynamic>[]},
            },
            200,
          );
        };
      final threadsAdapter = _RecordingAdapter();
      final container = _makeContainer(
        cache: cache,
        changesAdapter: changesAdapter,
        threadsAdapter: threadsAdapter,
      );

      final result =
          await container.read(mailSyncServiceProvider).syncNow();

      expect(result.error, isNull);
      expect(result.succeeded, isTrue);
      expect(result.appliedUpserts, 2);
      expect(result.appliedDeletes, 1);
      expect(result.nextSince, 'c1');
      expect(result.didFullResync, isFalse);

      // Upserts landed in the thread cache, keyed by thread id.
      final u1 = cache.lookup('t-u1');
      expect(u1, isNotNull);
      expect(u1!.subject, 'Subject e-u1');
      expect(u1.participantNames, ['Alice']);
      expect(cache.lookup('t-u2'), isNotNull);

      // The tombstone removed its thread; the unrelated thread survived.
      expect(cache.lookup('t-del'), isNull,
          reason: 'tombstone deleted the thread from the cache');
      expect(cache.lookup('t-keep'), isNotNull);

      // The cursor was persisted after the page was applied.
      expect(await cache.readSyncCursor(), 'c1');

      // Request 1 omitted `since` (first sync); request 2 sent since=c1.
      expect(changesAdapter.requests, hasLength(2));
      expect(changesAdapter.requests[0].path, '/emails/changes');
      expect(
        changesAdapter.requests[0].queryParams.containsKey('since'),
        isFalse,
        reason: 'first sync omits the cursor',
      );
      expect(changesAdapter.requests[0].queryParams['limit'], '100');
      expect(changesAdapter.requests[1].queryParams['since'], 'c1',
          reason: 'the follow-up call resumes from the persisted cursor');

      // A second syncNow() run resumes from the cursor too.
      await container.read(mailSyncServiceProvider).syncNow();
      expect(changesAdapter.requests.last.queryParams['since'], 'c1');
    });

    test('INVALID_CURSOR 400 -> full resync: didFullResync + page-1 rewrite',
        () async {
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 100,
        threads: const [ThreadSummary(id: 't-old', subject: 'Stale')],
        hasMore: false,
      );
      await cache.writeSyncCursor('stale-cursor');
      final changesAdapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {'code': 'INVALID_CURSOR', 'message': 'cursor malformed'},
              400,
            );
      final threadsAdapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': [
                  {'id': 't-new1', 'subject': 'Fresh 1'},
                  {'id': 't-new2', 'subject': 'Fresh 2'},
                ],
              },
              200,
            );
      final container = _makeContainer(
        cache: cache,
        changesAdapter: changesAdapter,
        threadsAdapter: threadsAdapter,
      );

      final result =
          await container.read(mailSyncServiceProvider).syncNow();

      expect(result.didFullResync, isTrue);
      expect(result.error, isNotNull);
      expect(result.error!.code, 'INVALID_CURSOR');
      expect(result.appliedUpserts, 0);
      expect(result.appliedDeletes, 0);

      // The resync seed came from GET /threads page 1 (pageSize 100).
      expect(threadsAdapter.requests, hasLength(1));
      final seedReq = threadsAdapter.requests.single;
      expect(seedReq.path, '/threads');
      expect(seedReq.queryParams['page'], '1');
      expect(seedReq.queryParams['pageSize'], '100');

      // Page 1 was rewritten with the resynced threads.
      final page = await cache.readThreadPage(page: 1, pageSize: 100);
      expect(page, isNotNull);
      expect(page!.threads.map((t) => t.id).toList(), ['t-new1', 't-new2']);
      expect(cache.lookup('t-old'), isNotNull,
          reason: 'upserts never delete: the stale row stays in the index, '
              'but page 1 no longer references it');

      // The cursor was cleared before the resync (a crash there retries the
      // resync instead of resuming mid-feed).
      expect(await cache.readSyncCursor(), isEmpty);
    });

    test('concurrent syncNow() calls share one in-flight run (P2-1)',
        () async {
      final cache = _FakeThreadListCache();
      final release = Completer<void>();
      var changesCalls = 0;
      final changesAdapter = _RecordingAdapter()
        ..responder = (req) async {
          changesCalls++;
          await release.future; // hold the run open mid-flight
          return _json(
            {
              'success': true,
              'data': {'changes': <dynamic>[]},
            },
            200,
          );
        };
      final threadsAdapter = _RecordingAdapter();
      final container = _makeContainer(
        cache: cache,
        changesAdapter: changesAdapter,
        threadsAdapter: threadsAdapter,
      );
      final service = container.read(mailSyncServiceProvider);

      // The check-and-set in syncNow() is synchronous: by the time the
      // second call runs, the guard is already set — no scheduling delay
      // needed to force the overlap.
      final f1 = service.syncNow();
      final f2 = service.syncNow();
      release.complete();
      final r1 = await f1;
      final r2 = await f2;

      // Exactly ONE underlying /emails/changes request for both callers.
      expect(changesCalls, 1);
      expect(r1.succeeded, isTrue);
      expect(r2.succeeded, isTrue);

      // Sequential calls still run fully — the guard clears on completion.
      await service.syncNow();
      expect(changesCalls, 2);
    });
  });
}
