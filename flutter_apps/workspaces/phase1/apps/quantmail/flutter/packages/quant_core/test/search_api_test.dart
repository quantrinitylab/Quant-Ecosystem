// ============================================================================
// quant_core - search API wire tests (Search slice: W1, quant_core lane)
//
// Wire tests for [SearchApi] (`GET /search/emails`, `GET /search/all`,
// `GET /search/parse`). Every HTTP test drives the REAL `QuantApiClient`
// (full auth/refresh/retry interceptor stack) over a mock
// [HttpClientAdapter] transport — no real network is touched.
//
// Mocking pattern is copied from `test/mail_api_test.dart`
// ([RecordingAdapter] + [jsonResponse]) with query-parameter capture.
//
// The `TokenManager` is deliberately left EMPTY (no tokens): with no stored
// refresh token the `RefreshInterceptor` fails closed on a 401 (no refresh
// HTTP attempt, no retry), so failure-path tests are fully deterministic.
//
// Defensive-parse coverage matters here: the repaired spec annotates all
// three endpoints with a generic `SuccessWrapper` 200, so the inner data
// shapes are unconfirmed (TODO(UNVERIFIED) in `search_api.dart`) and every
// unknown shape must degrade to empty — never throw.
//
// Run: `flutter test test/search_api_test.dart` from the package root.
// ============================================================================

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/search/search_api.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A single HTTP request observed by [_RecordingAdapter].
class _RecordedRequest {
  /// HTTP method, e.g. `GET`.
  final String method;

  /// Request path, e.g. `/search/emails`.
  final String path;

  /// Query parameters as encoded on the wire (always strings).
  final Map<String, String> queryParams;

  const _RecordedRequest({
    required this.method,
    required this.path,
    required this.queryParams,
  });
}

/// Test-double [HttpClientAdapter]: records every request and answers from a
/// scripted responder. No real network is ever touched.
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
    final recorded = _RecordedRequest(
      method: options.method,
      path: options.uri.path,
      queryParams: Map<String, String>.from(options.uri.queryParameters),
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
  return QuantApiClient(
    config: const QuantApiConfig(
      baseUrl: 'https://test.invalid',
      refreshEndpoint: '/oauth/token',
    ),
    tokenManager: tokens,
    dio: dio,
  );
}

/// Realistic email payload per the repaired-spec `Email` schema (copied
/// from `test/mail_api_test.dart`).
Map<String, dynamic> _emailJson({
  required String id,
  String? subject,
  bool isRead = false,
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
      'labels': ['INBOX'],
      'isRead': isRead,
      'isStarred': false,
      'hasAttachments': false,
      'folderId': 'INBOX',
    };

void main() {
  late _RecordingAdapter adapter;
  late SearchApi api;

  setUp(() {
    adapter = _RecordingAdapter();
    api = SearchApi(_makeClient(adapter));
  });

  group('searchMail', () {
    test('sends q/page/pageSize to /search/emails and parses the envelope',
        () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': [_emailJson(id: 'e1'), _emailJson(id: 'e2')],
            'pagination': {'page': 1, 'pageSize': 25, 'total': 2},
          }, 200);
      final result = await api.searchMail('from:ada', page: 1, pageSize: 25);
      expect(result.success, isTrue);
      expect(adapter.requests, hasLength(1));
      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/search/emails');
      expect(req.queryParams['q'], 'from:ada');
      expect(req.queryParams['page'], '1');
      expect(req.queryParams['pageSize'], '25');
      final page = result.data!;
      expect(page.emails.map((e) => e.id), ['e1', 'e2']);
      expect(page.hasMore, isFalse);
    });

    test('clamps pageSize to the spec range 1-100', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': <dynamic>[],
            'pagination': {'page': 1, 'pageSize': 100, 'total': 0},
          }, 200);
      await api.searchMail('x', pageSize: 500);
      expect(adapter.requests.single.queryParams['pageSize'], '100');
    });

    test('propagates backend failure as ApiResult.failure (never throws)',
        () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': false,
            'error': {'code': 'BAD_QUERY', 'message': 'q too short'},
          }, 400);
      final result = await api.searchMail('x');
      expect(result.success, isFalse);
      expect(result.error, isNotNull);
    });

    test('non-array data degrades to an empty page, not a throw', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': {'unexpected': 'object-shape'},
          }, 200);
      final result = await api.searchMail('x');
      expect(result.success, isTrue);
      expect(result.data!.emails, isEmpty);
    });
  });

  group('searchOmni', () {
    test('parses list-shaped data, rich-mapping email hits', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': [
              <String, dynamic>{
                'kind': 'email',
                ..._emailJson(id: 'e9', subject: 'Hello'),
              },
              <String, dynamic>{
                'kind': 'drive',
                'title': 'budget.xlsx',
                'subtitle': '/drive/budget.xlsx',
                'id': 'd1',
              },
            ],
          }, 200);
      final result = await api.searchOmni('budget');
      expect(adapter.requests.single.path, '/search/all');
      expect(adapter.requests.single.queryParams['q'], 'budget');
      expect(result.success, isTrue);
      final hits = result.data!;
      expect(hits, hasLength(2));
      expect(hits[0].kind, 'email');
      expect(hits[0].title, 'Hello');
      expect(hits[0].subtitle, 'Alice');
      expect(hits[0].refId, 'e9');
      expect(hits[0].email, isNotNull);
      expect(hits[0].email!.id, 'e9');
      // Non-mail hit: honest stub, no invented email.
      expect(hits[1].kind, 'drive');
      expect(hits[1].title, 'budget.xlsx');
      expect(hits[1].subtitle, '/drive/budget.xlsx');
      expect(hits[1].refId, 'd1');
      expect(hits[1].email, isNull);
    });

    test('accepts map-shaped data under items/results/emails/hits', () async {
      for (final key in ['items', 'results', 'emails', 'hits']) {
        adapter.requests.clear();
        adapter.responder = (_) async => _json(<String, dynamic>{
              'success': true,
              'data': {
                key: [
                  {'kind': 'document', 'name': 'notes.md', 'id': 'n1'},
                ],
              },
            }, 200);
        final result = await api.searchOmni('notes');
        expect(result.success, isTrue);
        expect(result.data, hasLength(1));
        expect(result.data!.single.title, 'notes.md');
      }
    });

    test('unknown data shape degrades to empty hits, never throws', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': 'a-string-is-not-a-shape',
          }, 200);
      final result = await api.searchOmni('x');
      expect(result.success, isTrue);
      expect(result.data, isEmpty);
    });

    test('mail hit with corrupt email payload falls back to an honest stub',
        () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': [
              {'kind': 'email', 'subject': 'Partial', 'id': 'e-bad'},
            ],
          }, 200);
      final result = await api.searchOmni('x');
      expect(result.success, isTrue);
      final hit = result.data!.single;
      expect(hit.kind, 'email');
      expect(hit.title, 'Partial');
      // Email.fromJson on the partial map either parses (stub fields) or
      // the catch falls back to a stub — either way no throw, no crash.
    });

    test('backend failure propagates as failure', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': false,
            'error': {'code': 'E', 'message': 'boom'},
          }, 500);
      final result = await api.searchOmni('x');
      expect(result.success, isFalse);
    });
  });

  group('parseQuery', () {
    test('sends q to /search/parse and parses the interpretation', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': {
              'terms': ['report'],
              'operators': {'from': 'ada', 'is': 'unread'},
              'suggestions': ['from:ada is:unread'],
            },
          }, 200);
      final result = await api.parseQuery('from:ada is:unread report');
      expect(adapter.requests.single.path, '/search/parse');
      expect(adapter.requests.single.queryParams['q'],
          'from:ada is:unread report');
      expect(result.success, isTrue);
      final interp = result.data!;
      expect(interp.raw, 'from:ada is:unread report');
      expect(interp.terms, ['report']);
      expect(interp.operators, {'from': 'ada', 'is': 'unread'});
      expect(interp.suggestions, ['from:ada is:unread']);
    });

    test('malformed interpretation degrades to empty fields, not a throw',
        () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': true,
            'data': {'terms': 'not-a-list', 'operators': 42},
          }, 200);
      final result = await api.parseQuery('x');
      expect(result.success, isTrue);
      expect(result.data!.terms, isEmpty);
      expect(result.data!.operators, isEmpty);
    });

    test('backend failure propagates as failure', () async {
      adapter.responder = (_) async => _json(<String, dynamic>{
            'success': false,
            'error': {'code': 'E', 'message': 'boom'},
          }, 500);
      final result = await api.parseQuery('x');
      expect(result.success, isFalse);
    });
  });
}
