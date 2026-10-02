// ============================================================================
// quant_core - thread-list repository tests (M4: W5)
//
// Tests for W4's cache-through [ThreadListRepository] (real class) driven
// over a mock [HttpClientAdapter] transport (same recording pattern as
// `test/mail_api_test.dart`) with an in-memory [ThreadListCache] fake:
//
// - cold cache -> network, result written through to the cache;
// - warm cache -> zero HTTP calls;
// - forceRefresh -> network hit and cache rewrite;
// - network failure + warm cache -> stale page served, no throw;
// - network failure + cold cache -> failure propagates.
//
// Run: `flutter test test/thread_list_repository_test.dart`
// ============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/thread_cache.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/thread_list_repository.dart';
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

/// Thread-summary JSON fixture.
Map<String, dynamic> _threadJson(String id, {String? subject}) =>
    <String, dynamic>{
      'id': id,
      'subject': subject ?? 'Subject $id',
      'snippet': 'Snippet $id',
    };

/// In-memory [ThreadListCache] fake: exact-key page store plus a per-id
/// thread index, mirroring the drift implementation's contract.
class _FakeThreadListCache implements ThreadListCache {
  final Map<String, CachedThreadPage> _pages = <String, CachedThreadPage>{};
  final Map<String, ThreadSummary> _threads = <String, ThreadSummary>{};
  String? _cursor;

  String _key(int page, int pageSize, String? folderId) =>
      '$page|$pageSize|${folderId ?? ''}';

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

/// Scripted `/threads` responder serving [threads] as a bare-list envelope.
void _serveThreads(_RecordingAdapter adapter, List<Map<String, dynamic>> threads) {
  adapter.responder = (req) async => _json(
        {'success': true, 'data': threads},
        200,
      );
}

void main() {
  group('ThreadListRepository.fetchPage', () {
    test('cold cache -> network, result written through to the cache',
        () async {
      final adapter = _RecordingAdapter();
      _serveThreads(adapter, [_threadJson('t1'), _threadJson('t2')]);
      final cache = _FakeThreadListCache();
      final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);

      final result = await repo.fetchPage(page: 1, pageSize: 10);

      expect(result.success, isTrue);
      expect(result.data, isNotNull);
      expect(result.data!.threads.map((t) => t.id).toList(), ['t1', 't2']);

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/threads');
      expect(req.queryParams['page'], '1');
      expect(req.queryParams['pageSize'], '10');

      // Write-through: the page is now cached under the exact key.
      final cached =
          await cache.readThreadPage(page: 1, pageSize: 10);
      expect(cached, isNotNull);
      expect(cached!.threads.map((t) => t.id).toList(), ['t1', 't2']);
    });

    test('warm cache -> zero HTTP calls', () async {
      final adapter = _RecordingAdapter();
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 10,
        threads: [ThreadSummary(id: 'cached', subject: 'Cached')],
        hasMore: false,
      );
      final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);

      final result = await repo.fetchPage(page: 1, pageSize: 10);

      expect(result.success, isTrue);
      expect(result.data!.threads.single.id, 'cached');
      expect(adapter.requests, isEmpty,
          reason: 'cache hit must not touch the network');
    });

    test('forceRefresh -> network hit and cache rewrite', () async {
      final adapter = _RecordingAdapter();
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 10,
        threads: [ThreadSummary(id: 'stale', subject: 'Stale')],
        hasMore: false,
      );
      _serveThreads(adapter, [_threadJson('fresh')]);
      final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);

      final result = await repo.fetchPage(
        page: 1,
        pageSize: 10,
        forceRefresh: true,
      );

      expect(result.success, isTrue);
      expect(result.data!.threads.single.id, 'fresh');
      expect(adapter.requests, hasLength(1),
          reason: 'forceRefresh bypasses the cache');

      final cached = await cache.readThreadPage(page: 1, pageSize: 10);
      expect(cached!.threads.single.id, 'fresh',
          reason: 'the fresh network page overwrote the cache');
    });

    test('network failure + warm cache -> stale page served, no throw',
        () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {'code': 'DOWN', 'message': 'backend exploded'},
              500,
            );
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 10,
        threads: [ThreadSummary(id: 'stale', subject: 'Stale')],
        hasMore: true,
      );
      final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);

      // Must not throw: the stale cached page degrades instead.
      final result = await repo.fetchPage(page: 1, pageSize: 10);

      expect(result.success, isTrue);
      expect(result.data!.threads.single.id, 'stale');
      expect(result.data!.hasMore, isTrue,
          reason: 'the cached page keeps its stored hasMore');
    });

    test('network failure + cold cache -> failure propagates', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {'code': 'DOWN', 'message': 'backend exploded'},
              500,
            );
      final repo =
          ThreadListRepository(ThreadsApi(_makeClient(adapter)), null);

      final result = await repo.fetchPage(page: 1, pageSize: 10);

      expect(result.success, isFalse);
      expect(result.data, isNull);
      expect(result.error, isNotNull);
      expect(result.error!.statusCode, 500);
    });

    test('empty network page does not wipe a warm non-empty cached page',
        () async {
      // W4's documented empty-overwrite guard: `ThreadsApi.listThreads`
      // degrades to an empty list on unknown `data` shapes; that defensive
      // empty must never delete the user's offline inbox.
      final adapter = _RecordingAdapter();
      _serveThreads(adapter, const []);
      final cache = _FakeThreadListCache();
      await cache.writeThreadPage(
        page: 1,
        pageSize: 10,
        threads: [ThreadSummary(id: 'kept', subject: 'Kept')],
        hasMore: false,
      );
      final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);

      final result = await repo.fetchPage(
        page: 1,
        pageSize: 10,
        forceRefresh: true,
      );

      expect(result.success, isTrue);
      expect(result.data!.threads, isEmpty,
          reason: 'the caller still sees the (empty) network result');
      final cached = await cache.readThreadPage(page: 1, pageSize: 10);
      expect(cached!.threads.single.id, 'kept',
          reason: 'the warm cached page survives the empty overwrite');
    });
  });
}
