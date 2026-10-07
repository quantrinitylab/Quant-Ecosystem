// ============================================================================
// quant_core - compose API wire tests (M7: compose core, W2)
//
// Wire tests for [ComposeApi]. Every HTTP test drives the REAL
// [QuantApiClient] (full auth/refresh/retry interceptor stack) over a mock
// [HttpClientAdapter] transport — no real network is touched.
//
// Mocking pattern copied from `test/mail_api_test.dart` ([_RecordingAdapter]
// + [_json]): requests are recorded (method/path/body) and answered from a
// scripted responder. The [TokenManager] is deliberately left EMPTY, so
// 401s fail closed with no refresh attempt — deterministic failure paths.
//
// Spec line refs: POST /emails/compose (L17853), POST /emails/{id}/send
// (L18675), POST /emails/{id}/cancel-send (L18236),
// POST /emails/{id}/undo-send (L18922).
//
// Run: `flutter test test/compose_api_test.dart` from the package root.
// ============================================================================

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/src/mail/compose/compose_api.dart';
import 'package:quant_core/src/mail/compose/compose_request.dart';
import 'package:quant_core/src/mail/models/email.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// A single HTTP request observed by [_RecordingAdapter].
class _RecordedRequest {
  final String method;
  final String path;

  /// Full request URI as a string (percent-encoding preserved — [Uri.path]
  /// decodes `%20` etc., so encoding assertions use this).
  final String fullUrl;
  final Map<String, dynamic>? jsonBody;

  const _RecordedRequest({
    required this.method,
    required this.path,
    required this.fullUrl,
    this.jsonBody,
  });
}

/// Test-double [HttpClientAdapter]: records every request and answers from a
/// scripted responder. No real network is ever touched. Same shape as the
/// `RecordingAdapter` in `test/mail_api_test.dart`.
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
      fullUrl: options.uri.toString(),
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

/// Real [QuantApiClient] over the recording transport. Token manager holds
/// NO tokens, so 401s fail closed — deterministic failure paths.
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

ComposeRequest _request() => ComposeRequest(
      to: const [EmailAddress(email: 'bob@example.com', name: 'Bob')],
      subject: 'Hi',
      bodyText: 'Body',
      idempotencyKey: 'job-1',
    );

/// `SuccessWrapper` envelope the backend returns.
Map<String, dynamic> _ok([Map<String, dynamic>? data]) =>
    {'success': true, 'data': data ?? {'id': 'draft-1'}};

/// `Error` envelope the backend returns.
Map<String, dynamic> _err(String code, String message) =>
    {'success': false, 'error': {'code': code, 'message': message}};

void main() {
  group('ComposeApi.compose', () {
    test('POSTs to /emails/compose with the request body (200)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok({'id': 'draft-1'}), 200);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.compose(_request());

      expect(result.success, isTrue);
      expect(result.data, {'id': 'draft-1'});
      expect(adapter.requests, hasLength(1));
      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/emails/compose');
      // The request's own toJson is the body (provisional mapping — see
      // the TODO(UNVERIFIED) on ComposeRequest.toJson).
      expect(req.jsonBody!['to'], [
        {'email': 'bob@example.com', 'name': 'Bob'}
      ]);
      expect(req.jsonBody!['idempotencyKey'], 'job-1');
    });

    test('composeRaw posts the body byte-passthrough (outbox seam)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok(), 200);
      final api = ComposeApi(_makeClient(adapter));

      final body = {'to': [{'email': 'x@y.z'}], 'idempotencyKey': 'k'};
      final result = await api.composeRaw(body);

      expect(result.success, isTrue);
      expect(adapter.requests.single.jsonBody, body);
    });

    test('non-map data shape degrades to {} (never throws)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json({'success': true}, 200);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.compose(_request());

      expect(result.success, isTrue);
      expect(result.data, <String, dynamic>{});
    });

    test('400 surfaces as ApiResult.failure (never throws)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              _err('VALIDATION_FAILED', 'no recipients'),
              400,
            );
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.compose(_request());

      expect(result.success, isFalse);
      expect(result.error, isA<ApiError>());
      expect(result.error!.statusCode, 400);
      expect(adapter.requests, hasLength(1));
    });

    test('401 fails closed (no refresh attempt)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(
              _err('UNAUTHENTICATED', 'token expired'),
              401,
            );
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.compose(_request());

      expect(result.success, isFalse);
      expect(result.error!.statusCode, 401);
      expect(
        adapter.requests,
        hasLength(1),
        reason: 'no tokens stored -> refresh fails closed, no retry storm',
      );
    });
  });

  group('ComposeApi.sendDraft', () {
    test('POSTs to the exact /emails/{id}/send path (200)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok(), 200);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.sendDraft('draft-1');

      expect(result.success, isTrue);
      expect(adapter.requests, hasLength(1));
      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/emails/draft-1/send');
    });

    test('URL-encodes the id', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok(), 200);
      final api = ComposeApi(_makeClient(adapter));

      await api.sendDraft('a b/c');

      // fullUrl preserves percent-encoding (Uri.path would decode it).
      expect(adapter.requests.single.fullUrl,
          contains('/emails/a%20b%2Fc/send'));
    });

    test('404 surfaces as failure (unknown draft)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_err('NOT_FOUND', 'no draft'), 404);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.sendDraft('missing');

      expect(result.success, isFalse);
      expect(result.error!.statusCode, 404);
    });

    test('400 surfaces as failure (validation)', () async {
      final adapter = _RecordingAdapter()
        ..responder =
            (req) async => _json(_err('VALIDATION_FAILED', 'bad'), 400);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.sendDraft('draft-1');

      expect(result.success, isFalse);
      expect(result.error!.statusCode, 400);
    });
  });

  group('ComposeApi.cancelSend', () {
    test('POSTs to the exact /emails/{id}/cancel-send path (201)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok(), 201);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.cancelSend('draft-1');

      expect(result.success, isTrue);
      expect(adapter.requests.single.path, '/emails/draft-1/cancel-send');
    });

    test('404 surfaces as failure', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_err('NOT_FOUND', 'gone'), 404);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.cancelSend('missing');

      expect(result.success, isFalse);
      expect(result.error!.statusCode, 404);
    });
  });

  group('ComposeApi.undoSend', () {
    test('POSTs to the exact /emails/{id}/undo-send path (201)', () async {
      final adapter = _RecordingAdapter()
        ..responder = (req) async => _json(_ok(), 201);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.undoSend('m-1');

      expect(result.success, isTrue);
      expect(adapter.requests.single.path, '/emails/m-1/undo-send');
    });

    test('400 (outside the 30s undo window) surfaces as failure', () async {
      final adapter = _RecordingAdapter()
        ..responder =
            (req) async => _json(_err('VALIDATION_FAILED', 'window passed'), 400);
      final api = ComposeApi(_makeClient(adapter));

      final result = await api.undoSend('m-1');

      expect(result.success, isFalse);
      expect(result.error!.statusCode, 400);
    });
  });
}
