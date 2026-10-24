// The API client refreshes the session ONCE on 401 with the HttpOnly refresh
// cookie, retries the request once, and signs the user out (fail closed) when
// the server refuses. The HTTP layer is a fake adapter: no network.
import 'dart:convert';
import 'dart:typed_data';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/data/mail_exception.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/data/models/session_models.dart';
import 'package:quant_mail/data/network/api_client.dart';
import 'package:quant_mail/data/network/dio_mail_repository.dart';
import 'package:quant_mail/data/network/dio_session_repository.dart';
import 'package:quant_mail/services/quant_auth_service.dart';

const String _base = 'https://quantmail.in/api';
const String _origin = 'https://quantmail.in';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions o) handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  int count(String method, String path) =>
      requests.where((RequestOptions r) => r.method == method && r.uri.path == '/api$path').length;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Map<String, dynamic> body, {List<String> setCookie = const <String>[]}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      if (setCookie.isNotEmpty) 'set-cookie': setCookie,
    },
  );
}

Map<String, dynamic> _emails() => <String, dynamic>{
      'success': true,
      'data': <dynamic>[],
      'totalCount': 0,
      'unreadCount': 0,
      'nextCursor': null,
    };

Map<String, dynamic> _error(int status, String code) => <String, dynamic>{
      'success': false,
      'error': <String, dynamic>{'code': code, 'message': code, 'statusCode': status},
    };

class _Rig {
  _Rig(Future<ResponseBody> Function(RequestOptions o, _Rig rig) script) {
    FlutterSecureStorage.setMockInitialValues(store);
    adapter = _Adapter((RequestOptions o) => script(o, this));
    auth = QuantAuthService();
    jar = DefaultCookieJar();
    session = DioSessionRepository(
      authService: auth,
      cookieJar: jar,
      baseUrl: _base,
      origin: _origin,
      httpClientAdapter: adapter,
    );
    dio = buildApiDio(
      baseUrl: _base,
      origin: _origin,
      session: session,
      cookieJar: jar,
      httpClientAdapter: adapter,
    );
    repo = DioMailRepository(dio);
  }

  final Map<String, String> store = <String, String>{};
  late final _Adapter adapter;
  late final QuantAuthService auth;
  late final CookieJar jar;
  late final DioSessionRepository session;
  late final Dio dio;
  late final DioMailRepository repo;

  /// Signed in with an expired access token and a refresh cookie in the jar.
  Future<void> signIn() async {
    await auth.saveSession(
      accessToken: 'old',
      refreshToken: 'marker',
      user: const QuantUserProfile(id: 'usr_1', email: 'user@quantmail.in', name: 'Test User'),
    );
    await jar.saveFromResponse(
      Uri.parse(_base),
      <Cookie>[Cookie('quantmail_refresh', 'rt1')..path = '/'],
    );
  }

  Future<String> cookieValue() async {
    final List<Cookie> cookies = await jar.loadForRequest(Uri.parse('$_base/auth/refresh'));
    return cookies.where((Cookie c) => c.name == 'quantmail_refresh').map((Cookie c) => c.value).join();
  }
}

String _bearer(RequestOptions o) => '${o.headers['Authorization']}';

Future<ResponseBody> _refreshOk(RequestOptions o) async => _json(
      200,
      <String, dynamic>{
        'success': true,
        'data': <String, dynamic>{'accessToken': 'new', 'expiresIn': 900, 'tokenType': 'Bearer'},
      },
      setCookie: <String>['quantmail_refresh=rt2; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict'],
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('401 triggers exactly one refresh with the cookie, then one retry that succeeds', () async {
    String? refreshCookieHeader;
    final _Rig rig = _Rig((RequestOptions o, _Rig r) async {
      if (o.uri.path == '/api/auth/refresh') {
        refreshCookieHeader = '${o.headers['cookie']}';
        return _refreshOk(o);
      }
      return _bearer(o) == 'Bearer new' ? _json(200, _emails()) : _json(401, _error(401, 'UNAUTHORIZED'));
    });
    await rig.signIn();

    final page = await rig.repo.list(const MailView(MailFolderKind.inbox));

    expect(page.items, isEmpty);
    expect(rig.adapter.count('POST', '/auth/refresh'), 1);
    expect(rig.adapter.count('GET', '/emails'), 2);
    expect(refreshCookieHeader, contains('quantmail_refresh=rt1'));
    expect(rig.session.accessToken, 'new');
    expect(rig.session.state.isSignedIn, isTrue);
    expect(await rig.cookieValue(), 'rt2', reason: 'the rotated cookie replaces the old one');
  });

  test('concurrent 401s share ONE refresh', () async {
    final _Rig rig = _Rig((RequestOptions o, _Rig r) async {
      if (o.uri.path == '/api/auth/refresh') return _refreshOk(o);
      return _bearer(o) == 'Bearer new' ? _json(200, _emails()) : _json(401, _error(401, 'UNAUTHORIZED'));
    });
    await rig.signIn();

    await Future.wait(<Future<Object?>>[
      rig.repo.list(const MailView(MailFolderKind.inbox)),
      rig.repo.list(const MailView(MailFolderKind.sent)),
      rig.repo.counts(const MailView(MailFolderKind.drafts)),
    ]);

    expect(rig.adapter.count('POST', '/auth/refresh'), 1);
    expect(rig.session.state.isSignedIn, isTrue);
  });

  test('refresh rejected: signed out with a clear message, nothing retried, nothing left behind', () async {
    final _Rig rig = _Rig((RequestOptions o, _Rig r) async {
      if (o.uri.path == '/api/auth/refresh') return _json(401, _error(401, 'INVALID_REFRESH_SESSION'));
      return _json(401, _error(401, 'UNAUTHORIZED'));
    });
    await rig.signIn();

    await expectLater(
      rig.repo.list(const MailView(MailFolderKind.inbox)),
      throwsA(isA<MailException>().having((MailException e) => e.kind, 'kind', MailErrorKind.unauthorized)),
    );

    expect(rig.adapter.count('POST', '/auth/refresh'), 1, reason: 'never a refresh loop');
    expect(rig.adapter.count('GET', '/emails'), 1, reason: 'no retry after a failed refresh');
    expect(rig.session.state.isSignedIn, isFalse);
    expect(rig.session.state.endedMessage, kSessionEndedMessage);
    expect(rig.auth.isAuthenticated, isFalse);
    expect(rig.store, isEmpty, reason: 'keystore wiped');
    expect(await rig.cookieValue(), '', reason: 'cookie jar wiped');
  });

  test('a second 401 after a successful refresh signs out instead of looping', () async {
    final _Rig rig = _Rig((RequestOptions o, _Rig r) async {
      if (o.uri.path == '/api/auth/refresh') return _refreshOk(o);
      return _json(401, _error(401, 'UNAUTHORIZED'));
    });
    await rig.signIn();

    await expectLater(rig.repo.list(const MailView(MailFolderKind.inbox)), throwsA(isA<MailException>()));

    expect(rig.adapter.count('POST', '/auth/refresh'), 1);
    expect(rig.adapter.count('GET', '/emails'), 2);
    expect(rig.session.state.isSignedIn, isFalse);
    expect(rig.session.state.endedMessage, kSessionEndedMessage);
  });

  test('refresh with no answer (offline) keeps the session and reports a connectivity error', () async {
    final _Rig rig = _Rig((RequestOptions o, _Rig r) async {
      if (o.uri.path == '/api/auth/refresh') {
        throw DioException(requestOptions: o, type: DioExceptionType.connectionError);
      }
      return _json(401, _error(401, 'UNAUTHORIZED'));
    });
    await rig.signIn();

    await expectLater(
      rig.repo.list(const MailView(MailFolderKind.inbox)),
      throwsA(isA<MailException>().having((MailException e) => e.isConnectivity, 'isConnectivity', isTrue)),
    );

    expect(rig.session.state.isSignedIn, isTrue);
    expect(rig.session.accessToken, 'old');
  });
}
