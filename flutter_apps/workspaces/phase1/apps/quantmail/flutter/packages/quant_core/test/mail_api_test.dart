// ============================================================================
// quant_core - mail API client wire tests (M3: W5)
// ============================================================================
//
// Wire tests for the M3 mail API surface (`EmailsApi`, `ThreadsApi`,
// `EmailChangesApi`) plus the mail domain models. Every HTTP test drives
// the REAL `QuantApiClient` (with its auth/refresh/retry interceptor stack)
// over a mock [HttpClientAdapter] transport — no real network is touched.
//
// Mocking pattern is copied from `test/refresh_wire_test.dart`
// ([RecordingAdapter] + [jsonResponse]), extended with query-parameter
// capture (`RecordedRequest.queryParams`) because several mail assertions
// are about the exact query string sent.
//
// The `TokenManager` is deliberately left EMPTY (no tokens): with no stored
// refresh token the `RefreshInterceptor` fails closed on a 401 (no refresh
// HTTP attempt, no retry), so failure-path tests are fully deterministic.
//
// Run: `flutter test test/mail_api_test.dart` from the package root.
//
// KNOWN CROSS-WORKER FINDINGS — RESOLVED in coordinator reconcile pass:
//  * `EmailsApi.listEmails`/`searchEmails` threw `TypeError` on the spec
//    `PaginatedEmails` envelope (`data` is an array; `_guard`'s
//    `body['data'] as T` cast). FIXED: both methods now go through the new
//    additive `QuantApiClient.getEnvelope` (full-body map, no `data` cast)
//    and parse with `PaginatedEmails.fromJson`. The envelope test below is
//    green.
//  * `mail_providers.dart` vs `threads_api.dart` mismatches
//    (`getThread`→`resolveThread`, `ThreadDetail.emails`→`messages`,
//    `EmailRepository.batch` signature) — FIXED in `mail_providers.dart`.
//    The `EmailRepository.fetchPage` cache-first test is now real.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/emails_api.dart';
import 'package:quant_core/src/mail/mail_providers.dart';
import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_core/src/mail/models/thread.dart';
import 'package:quant_core/src/mail/threads_api.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A single HTTP request observed by [_RecordingAdapter].
class _RecordedRequest {
  /// HTTP method, e.g. `GET`, `POST`.
  final String method;

  /// Request path, e.g. `/emails`, `/emails/e1/read`.
  final String path;

  /// Request headers as seen by the transport.
  final Map<String, dynamic> headers;

  /// Decoded JSON body for requests with one; null otherwise.
  final Map<String, dynamic>? jsonBody;

  /// Query parameters as encoded on the wire (always strings).
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
/// scripted responder. No real network is ever touched. Same shape as the
/// `RecordingAdapter` in `refresh_wire_test.dart`, plus [queryParams].
class _RecordingAdapter implements HttpClientAdapter {
  /// Every request seen, in order.
  final List<_RecordedRequest> requests = <_RecordedRequest>[];

  /// Answers each recorded request. Set before the test drives traffic.
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
/// transport. The token manager holds NO tokens, so 401s fail closed with
/// no refresh attempt — deterministic failure paths.
QuantApiClient _makeClient(_RecordingAdapter adapter) {
  final tokens = TokenManager(storage: InMemoryTokenStorage());
  addTearDown(tokens.dispose);
  final dio = Dio(BaseOptions(baseUrl: 'https://test.invalid'))
    ..httpClientAdapter = adapter;
  // The constructor wires the auth/refresh/retry interceptors onto the
  // passed-in Dio — the exact seam `refresh_wire_test.dart` uses.
  return QuantApiClient(
    config: const QuantApiConfig(
      baseUrl: 'https://test.invalid',
      refreshEndpoint: '/oauth/token',
    ),
    tokenManager: tokens,
    dio: dio,
  );
}

/// Realistic email payload per the repaired-spec `Email` schema.
Map<String, dynamic> _emailJson({
  required String id,
  String? subject,
  bool isRead = false,
  List<String>? labels,
}) =>
    <String, dynamic>{
      'id': id,
      'threadId': 't-$id',
      'subject': subject ?? 'Subject $id',
      'snippet': 'Snippet $id',
      'from': {'email': 'alice@example.com', 'name': 'Alice'},
      'to': [
        {'email': 'bob@example.com'}
      ],
      'cc': [],
      'date': '2026-10-02T10:00:00.000Z',
      'labels': labels ?? ['INBOX'],
      'isRead': isRead,
      'isStarred': false,
      'hasAttachments': false,
      'folderId': 'INBOX',
    };

/// In-memory implementation of the `MailCache` seam from
/// `mail_providers.dart` (read/write page, read/write email,
/// by-thread read, clear).
class _FakeMailCache implements MailCache {
  final Map<String, PaginatedEmails> _pages = <String, PaginatedEmails>{};
  final Map<String, Email> _emails = <String, Email>{};

  String _key(int page, int pageSize, String? folderId, FolderType? folderType) =>
      '$page|$pageSize|${folderId ?? ''}|${folderType?.name ?? ''}';

  @override
  Future<PaginatedEmails?> readCachedPage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
  }) async =>
      _pages[_key(page, pageSize, folderId, folderType)];

  @override
  Future<void> writePage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
    required PaginatedEmails result,
  }) async {
    _pages[_key(page, pageSize, folderId, folderType)] = result;
  }

  @override
  Future<Email?> readEmail(String id) async => _emails[id];

  @override
  Future<void> writeEmail(Email email) async => _emails[email.id] = email;

  @override
  Future<List<Email>> readEmailsForThread(String threadId) async {
    final matches =
        _emails.values.where((e) => e.threadId == threadId).toList();
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
    _pages.clear();
    _emails.clear();
  }
}

void main() {
  group('EmailsApi.listEmails', () {
    test('parses the spec PaginatedEmails envelope', () async {
      // Wire shape grounded in the repaired spec (openapi.repaired.yaml
      // L26855): `{success, data: Email[], pagination: {page,pageSize,total}}`.
      // Regression pin: `data` is an ARRAY, so this must go through
      // `QuantApiClient.getEnvelope` (the generic `get<T>` unwrap casts
      // `data as T`, which throws `TypeError` on arrays).
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': [
                  _emailJson(id: 'e1', subject: 'Hello', isRead: false),
                  _emailJson(
                    id: 'e2',
                    subject: 'World',
                    isRead: true,
                    labels: ['INBOX', 'STARRED'],
                  ),
                ],
                'pagination': {'page': 1, 'pageSize': 50, 'total': 120},
              },
              200,
            );
      final api = EmailsApi(_makeClient(adapter));

      final result = await api.listEmails();

      expect(result.success, isTrue);
      expect(result.data, isNotNull);
      final page = result.data!;
      expect(page.emails, hasLength(2));
      expect(page.emails.first.id, 'e1');
      expect(page.emails.first.subject, 'Hello');
      expect(page.emails.first.isRead, isFalse);
      expect(page.emails.first.labels, contains('INBOX'));
      expect(page.emails[1].isRead, isTrue);
      expect(page.pageInfo.total, 120);
      expect(page.pageInfo.hasMore, isTrue, reason: '1 * 50 < 120');
    });

    test('PaginatedEmails.fromJson parses the documented envelope shape',
        () {
      // The model itself is spec-correct (green): this isolates the
      // listEmails failure above to the client wiring, not the model.
      final page = PaginatedEmails.fromJson({
        'success': true,
        'data': [_emailJson(id: 'e1')],
        'pagination': {'page': 1, 'pageSize': 50, 'total': 120},
      });
      expect(page.success, isTrue);
      expect(page.emails.single.id, 'e1');
      expect(page.hasMore, isTrue);

      // Degradation: a missing data/pagination still yields a usable page.
      final sparse = PaginatedEmails.fromJson({'success': true});
      expect(sparse.emails, isEmpty);
      expect(sparse.pageInfo.hasMore, isFalse);
    });

    test('sends folderType wire name, clamps pageSize, omits null filters',
        () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': [],
                'pagination': {'page': 2, 'pageSize': 100, 'total': 0},
              },
              200,
            );
      final api = EmailsApi(_makeClient(adapter));

      // Request-shape assertions only: the response parse is pinned by the
      // test above (currently red on W1's wiring), so its outcome is
      // irrelevant here.
      try {
        await api.listEmails(
          page: 2,
          pageSize: 200,
          folderType: FolderType.inbox,
        );
      } catch (_) {
        // Swallowed deliberately: see the comment above.
      }

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/emails');
      expect(req.queryParams['page'], '2');
      expect(
        req.queryParams['pageSize'],
        '100',
        reason: 'clamped to the spec max 1..100',
      );
      expect(req.queryParams['folderType'], 'INBOX');
      expect(
        req.queryParams.containsKey('folderId'),
        isFalse,
        reason: 'null filters are omitted from the query',
      );
    });

    test('401 surfaces as ApiResult.failure (never throws)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {'code': 'UNAUTHENTICATED', 'message': 'token expired'},
              401,
            );
      final api = EmailsApi(_makeClient(adapter));

      // If the client threw on transport failures, this await would throw.
      final result = await api.listEmails();

      expect(result.success, isFalse);
      expect(result.data, isNull);
      expect(result.error, isA<ApiError>());
      expect(result.error!.statusCode, 401);
      expect(result.error!.code, 'UNAUTHENTICATED');
      expect(
        adapter.requests,
        hasLength(1),
        reason: 'no tokens stored -> refresh fails closed, no retry storm',
      );
    });
  });

  group('EmailsApi.getEmail', () {
    test('returns the parsed Email for a single-object payload', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': _emailJson(id: 'e9', subject: 'Thread reply'),
              },
              200,
            );
      final api = EmailsApi(_makeClient(adapter));

      final result = await api.getEmail('e9');

      expect(adapter.requests.single.path, '/emails/e9');
      expect(result.success, isTrue);
      final email = result.data!;
      expect(email.id, 'e9');
      expect(email.subject, 'Thread reply');
      expect(email.from.email, 'alice@example.com');
      expect(email.from.name, 'Alice');
      expect(email.date, DateTime.utc(2026, 10, 2, 10));
    });
  });

  group('EmailsApi.searchEmails', () {
    test('hits /emails/search with q and pagination params', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': [],
                'pagination': {'page': 1, 'pageSize': 20, 'total': 0},
              },
              200,
            );
      final api = EmailsApi(_makeClient(adapter));

      // Request-shape assertions only (same W1 response-shape caveat as
      // listEmails); the spec documents `q` as the query parameter.
      try {
        await api.searchEmails('invoice', page: 1, pageSize: 20);
      } catch (_) {
        // Swallowed deliberately: see the listEmails comment.
      }

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/emails/search');
      expect(req.queryParams['q'], 'invoice');
      expect(req.queryParams['page'], '1');
      expect(req.queryParams['pageSize'], '20');
    });
  });

  group('EmailsApi mutations', () {
    test('markRead POSTs to /emails/{id}/read', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json({'success': true, 'data': {}}, 200);
      final api = EmailsApi(_makeClient(adapter));

      final result = await api.markRead('e1');

      expect(result.success, isTrue);
      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/emails/e1/read');
      expect(req.jsonBody, isNotNull);
      expect(req.jsonBody, isEmpty, reason: 'spec body is empty; {} is sent');
    });

    test('snooze POSTs snoozeUntil as UTC ISO-8601', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json({'success': true, 'data': {}}, 200);
      final api = EmailsApi(_makeClient(adapter));

      final result =
          await api.snooze('e1', DateTime.utc(2026, 10, 5, 9, 30));

      expect(result.success, isTrue);
      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/emails/e1/snooze');
      expect(req.jsonBody!['snoozeUntil'], '2026-10-05T09:30:00.000Z');
    });

    test('deleteEmail DELETEs /emails/{id}', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json({'success': true, 'data': {}}, 200);
      final api = EmailsApi(_makeClient(adapter));

      final result = await api.deleteEmail('e1');

      expect(result.success, isTrue);
      final req = adapter.requests.single;
      expect(req.method, 'DELETE');
      expect(req.path, '/emails/e1');
    });
  });

  group('Email model', () {
    test('Email.fromJson degrades on missing optionals and bad dates', () {
      final sparse = Email.fromJson({'id': 'x'});
      expect(sparse.id, 'x');
      expect(sparse.subject, isNull);
      expect(sparse.snippet, isNull);
      expect(sparse.threadId, isNull);
      expect(sparse.to, isEmpty);
      expect(sparse.cc, isEmpty);
      expect(sparse.labels, isEmpty);
      expect(sparse.isRead, isFalse);
      expect(sparse.isStarred, isFalse);
      expect(sparse.hasAttachments, isFalse);
      expect(sparse.date, isNull);
      expect(sparse.from.email, isEmpty);

      // A bad date string degrades to null instead of throwing.
      expect(Email.fromJson({'id': 'y', 'date': 'not-a-date'}).date, isNull);
      expect(Email.fromJson({'id': 'z', 'date': 12345}).date, isNull);

      // Bare-string addresses are accepted as the email value.
      expect(
        Email.fromJson({'id': 'w', 'from': 'bare@example.com'}).from.email,
        'bare@example.com',
      );
    });

    test('FolderType.wireName covers all 8 values', () {
      const expected = {
        FolderType.inbox: 'INBOX',
        FolderType.sent: 'SENT',
        FolderType.drafts: 'DRAFTS',
        FolderType.trash: 'TRASH',
        FolderType.spam: 'SPAM',
        FolderType.archive: 'ARCHIVE',
        FolderType.starred: 'STARRED',
        FolderType.snoozed: 'SNOOZED',
      };
      expect(FolderType.values, hasLength(8));
      for (final entry in expected.entries) {
        expect(entry.key.wireName, entry.value);
      }
      expect(
        FolderType.values.map((f) => f.wireName).toSet(),
        hasLength(8),
        reason: 'wire names are unique',
      );
    });

    test('ThreadSummary.fromJson degrades on sparse payloads', () {
      final sparse = ThreadSummary.fromJson({'id': 't9'});
      expect(sparse.id, 't9');
      expect(sparse.subject, isNull);
      expect(sparse.messageCount, isNull);
      expect(sparse.lastMessageDate, isNull);
      expect(sparse.isRead, isTrue, reason: 'defaults to read when unknown');
      expect(sparse.participantNames, isEmpty);

      expect(ThreadSummary.fromJson({}).id, isEmpty);

      final full = ThreadSummary.fromJson({
        'id': 't1',
        'subject': 'Re: launch',
        'messageCount': 4,
        'lastMessageDate': '2026-10-02T12:00:00.000Z',
        'isRead': false,
        'participants': [
          {'name': 'Alice'},
          {'email': 'bob@example.com'},
          'carol@example.com',
        ],
      });
      expect(full.messageCount, 4);
      expect(full.isRead, isFalse);
      expect(
        full.participantNames,
        ['Alice', 'bob@example.com', 'carol@example.com'],
      );
    });
  });

  group('ThreadsApi / EmailChangesApi', () {
    test('resolveThread parses a bare-summary map', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': {
                  'id': 't1',
                  'subject': 'Launch thread',
                  'messageCount': 2,
                },
              },
              200,
            );
      final api = ThreadsApi(_makeClient(adapter));

      final result = await api.resolveThread('t1');

      expect(adapter.requests.single.path, '/threads/t1');
      expect(result.success, isTrue);
      expect(result.data!.summary.id, 't1');
      expect(result.data!.summary.subject, 'Launch thread');
      expect(result.data!.messages, isEmpty);
    });

    test('fetchChanges sends limit and omits since on first sync', () async {
      // TODO(UNVERIFIED): `GET /emails/changes` is a STAGED backend contract
      // (phase2/repo-staging/delta-sync/NOTES.md; backend P0-1 not merged).
      // This test pins the staged client-side contract only — re-verify
      // `since`/`nextCursor` semantics against the merged backend.
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              {
                'success': true,
                'data': {
                  'changes': [
                    {'id': 'e1', 'message': _emailJson(id: 'e1')},
                    {'id': 'e2', 'deleted': true},
                  ],
                  'nextCursor': 'cursor-abc',
                },
              },
              200,
            );
      final api = EmailChangesApi(_makeClient(adapter));

      final result = await api.fetchChanges();

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/emails/changes');
      expect(req.queryParams['limit'], '100', reason: 'staged default');
      expect(
        req.queryParams.containsKey('since'),
        isFalse,
        reason: 'omitted on first sync',
      );

      expect(result.success, isTrue);
      final page = result.data!;
      expect(page.changes, hasLength(2));
      expect(page.changes[0].deleted, isFalse);
      expect(page.changes[0].email!.id, 'e1');
      expect(page.changes[1].deleted, isTrue);
      expect(page.changes[1].email, isNull, reason: 'tombstone: no payload');
      expect(page.nextSince, 'cursor-abc');
    });
  });

  group('cache seam', () {
    test('EmailRepository.fetchPage is cache-first (fake MailCache)',
        () async {
      final adapter = _RecordingAdapter();
      final client = _makeClient(adapter);
      final api = EmailsApi(client);
      final cache = _FakeMailCache();
      final repo = EmailRepository(api, cache);

      Map<String, dynamic> pageEnvelope(String subject, int total) => {
            'success': true,
            'data': [_emailJson(id: 'e1', subject: subject)],
            'pagination': {'page': 1, 'pageSize': 50, 'total': total},
          };
      adapter.responder =
          (req) async => _json(pageEnvelope('network', 1), 200);

      // 1. Cold cache -> network, and the result is written through.
      final first = await repo.fetchPage();
      expect(first.success, isTrue);
      expect(first.data!.emails.single.subject, 'network');
      expect(adapter.requests.length, 1);

      // 2. Warm cache -> zero adapter calls, cached page returned.
      final second = await repo.fetchPage();
      expect(second.success, isTrue);
      expect(second.data!.emails.single.subject, 'network');
      expect(adapter.requests.length, 1,
          reason: 'cache hit must not touch the network');

      // 3. forceRefresh -> adapter hit again, cache rewritten with fresh page.
      adapter.responder =
          (req) async => _json(pageEnvelope('fresh', 1), 200);
      final third = await repo.fetchPage(forceRefresh: true);
      expect(third.success, isTrue);
      expect(third.data!.emails.single.subject, 'fresh');
      expect(adapter.requests.length, 2);
      final fourth = await repo.fetchPage();
      expect(fourth.data!.emails.single.subject, 'fresh');

      // 4. Network failure + warm cache -> stale page returned, no throw.
      adapter.responder = (req) async => _json(
            {
              'success': false,
              'error': {'code': 'DOWN', 'message': 'boom'}
            },
            500,
          );
      final fifth = await repo.fetchPage();
      expect(fifth.success, isTrue,
          reason: 'warm cache degrades instead of surfacing the failure');
      expect(fifth.data!.emails.single.subject, 'fresh');

      // 5. Network failure + cold cache -> failure propagates.
      await cache.clear();
      final sixth = await repo.fetchPage();
      expect(sixth.success, isFalse);
      expect(sixth.error, isNotNull);
    });

    test('in-memory MailCache mirror round-trips pages and emails', () async {
      final cache = _FakeMailCache();
      expect(await cache.readCachedPage(page: 1, pageSize: 50), isNull);

      final page = PaginatedEmails(
        emails: [Email.fromJson(_emailJson(id: 'e1'))],
        pageInfo: const PageInfo(page: 1, pageSize: 50, total: 1),
      );
      await cache.writePage(page: 1, pageSize: 50, result: page);
      expect(
        (await cache.readCachedPage(page: 1, pageSize: 50))
            ?.emails
            .single
            .id,
        'e1',
      );

      // Keys are exact: a different page or folder misses.
      expect(await cache.readCachedPage(page: 2, pageSize: 50), isNull);
      expect(
        await cache.readCachedPage(
          page: 1,
          pageSize: 50,
          folderType: FolderType.inbox,
        ),
        isNull,
      );

      await cache.writeEmail(Email.fromJson(_emailJson(id: 'e9')));
      expect((await cache.readEmail('e9'))?.id, 'e9');
      expect(await cache.readEmail('missing'), isNull);

      await cache.clear();
      expect(await cache.readCachedPage(page: 1, pageSize: 50), isNull);
      expect(await cache.readEmail('e9'), isNull);
    });
  });
}
