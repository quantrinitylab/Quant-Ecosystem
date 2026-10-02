// ============================================================================
// quant_core - inbox provider tests (M4: W5)
//
// Tests for W4's [inboxProvider] ([InboxListNotifier]/[InboxListState]):
//
// - initial build loads page 1 (cache-first, real ThreadListRepository over
//   a mock HttpClientAdapter transport);
// - refresh() re-fetches page 1 from the network;
// - loadMore() appends the next page and stops calling the network once
//   hasMore is false.
//
// Provider overrides: [threadListRepositoryProvider] gets the REAL
// repository over a scripted transport + in-memory [ThreadListCache] fake;
// [mailSyncServiceProvider] gets a no-op subclass whose syncNow resolves
// instantly (the notifier fires a post-first-paint sync in build()).
//
// Run: `flutter test test/inbox_providers_test.dart`
// ============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/cache/thread_cache.dart';
import 'package:quant_core/src/mail/inbox_providers.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/sync/mail_sync_service.dart';
import 'package:quant_core/src/mail/sync/sync_providers.dart';
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

/// Thread-summary JSON fixtures: [count] threads with the given id prefix.
List<Map<String, dynamic>> _threadJsons(int count, String prefix) =>
    List<Map<String, dynamic>>.generate(
      count,
      (i) => <String, dynamic>{
        'id': '$prefix$i',
        'subject': 'Subject $prefix$i',
        'snippet': 'Snippet $prefix$i',
      },
    );

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

/// No-op [MailSyncService]: syncNow resolves instantly with an empty result.
///
/// The notifier fires a post-first-paint sync inside build(); this override
/// keeps that path fast and deterministic without touching the network.
class _NoopSyncService extends MailSyncService {
  _NoopSyncService(super.ref);

  @override
  Future<SyncResult> syncNow({int pageLimit = 100}) =>
      Future<SyncResult>.value(
        const SyncResult(appliedUpserts: 0, appliedDeletes: 0),
      );
}

/// Builds a [ProviderContainer] with the real repository (scripted
/// transport + fake cache) and the no-op sync service.
ProviderContainer _makeContainer(_RecordingAdapter adapter) {
  final cache = _FakeThreadListCache();
  final repo = ThreadListRepository(ThreadsApi(_makeClient(adapter)), cache);
  final container = ProviderContainer(
    overrides: [
      threadListRepositoryProvider.overrideWithValue(repo),
      mailSyncServiceProvider.overrideWith((ref) => _NoopSyncService(ref)),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Serves [threads] for every `/threads` request.
void _serveThreads(
    _RecordingAdapter adapter, List<Map<String, dynamic>> threads) {
  adapter.responder = (req) async => _json(
        {'success': true, 'data': threads},
        200,
      );
}

void main() {
  group('inboxProvider', () {
    test('initial build loads page 1', () async {
      final adapter = _RecordingAdapter();
      _serveThreads(adapter, _threadJsons(3, 't'));
      final container = _makeContainer(adapter);
      container.listen(inboxProvider, (_, __) {});

      final state = await container.read(inboxProvider.future);

      expect(state.threads.map((t) => t.id).toList(), ['t0', 't1', 't2']);
      expect(state.hasMore, isFalse,
          reason: '3 threads < pageSize 50 means no more pages');
      expect(state.isLoadingMore, isFalse);
      expect(state.errorMessage, isNull);
      expect(
        adapter.requests.where((r) => r.path == '/threads'),
        isNotEmpty,
        reason: 'page 1 was fetched from the network',
      );
    });

    test('refresh() re-fetches page 1 from the network', () async {
      final adapter = _RecordingAdapter();
      _serveThreads(adapter, _threadJsons(2, 'old-'));
      final container = _makeContainer(adapter);
      container.listen(inboxProvider, (_, __) {});

      final initial = await container.read(inboxProvider.future);
      expect(initial.threads.map((t) => t.id).toList(), ['old-0', 'old-1']);

      // Exactly one network request so far: the post-first-paint sync's
      // page-1 re-fetch is cache-first, and the build warmed the cache —
      // so it never touches the network.
      expect(adapter.requests.length, 1);
      final before = adapter.requests.length;

      // New server state; refresh() must pick it up.
      _serveThreads(adapter, _threadJsons(2, 'new-'));
      await container.read(inboxProvider.notifier).refresh();

      final refreshed = container.read(inboxProvider).value!;
      expect(refreshed.threads.map((t) => t.id).toList(), ['new-0', 'new-1'],
          reason: 'refresh() replaced the list with the fresh network page');
      expect(adapter.requests.length, before + 1,
          reason: 'refresh() issued exactly one new network request');
      expect(refreshed.errorMessage, isNull);
    });

    test('loadMore() appends the next page, then stops at hasMore=false',
        () async {
      final adapter = _RecordingAdapter();
      final page1 = _threadJsons(50, 'p1-');
      final page2 = _threadJsons(20, 'p2-');
      adapter.responder = (req) async => _json(
            {
              'success': true,
              'data': req.queryParams['page'] == '2' ? page2 : page1,
            },
            200,
          );
      final container = _makeContainer(adapter);
      container.listen(inboxProvider, (_, __) {});

      final initial = await container.read(inboxProvider.future);
      expect(initial.threads, hasLength(50));
      expect(initial.hasMore, isTrue,
          reason: 'a full page (50 == pageSize) means more may exist');
      expect(adapter.requests.length, 1,
          reason: 'build fetched page 1 once; the post-paint sync refetch '
              'is cache-first');

      await container.read(inboxProvider.notifier).loadMore();

      final afterMore = container.read(inboxProvider).value!;
      expect(afterMore.threads, hasLength(70),
          reason: 'page 2 was appended to page 1');
      expect(afterMore.threads.last.id, 'p2-19');
      expect(afterMore.hasMore, isFalse,
          reason: '20 threads < pageSize 50 means the end was reached');
      expect(afterMore.isLoadingMore, isFalse);
      expect(
        adapter.requests.any(
          (r) => r.path == '/threads' && r.queryParams['page'] == '2',
        ),
        isTrue,
        reason: 'loadMore() fetched page 2',
      );

      // hasMore=false: loadMore() must not call the network again.
      final requestCount = adapter.requests.length;
      await container.read(inboxProvider.notifier).loadMore();
      expect(adapter.requests.length, requestCount,
          reason: 'no more pages: loadMore() is a no-op');
      expect(container.read(inboxProvider).value!.threads, hasLength(70));
    });
  });
}
