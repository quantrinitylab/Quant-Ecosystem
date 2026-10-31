// Register and password recovery: validation rules, fail-closed behaviour and
// single-request submit. The HTTP layer is scripted, nothing touches the network.
import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/screens/auth/auth_widgets.dart';
import 'package:quant_mail/screens/auth/quant_register_screen.dart';
import 'package:quant_mail/services/quant_account_service.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this._handler);
  final Future<ResponseBody> Function(RequestOptions options) _handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Map<String, dynamic> body) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

QuantAccountService _service(_Adapter a) => QuantAccountService.forTesting(
      baseUrl: 'https://quantmail.in/api',
      origin: 'https://quantmail.in',
      httpClientAdapter: a,
    );

Future<void> _fill(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('register-handle')), 'qa.tester');
  await tester.enterText(find.byKey(const Key('register-password')), 'correct-horse');
  await tester.enterText(find.byKey(const Key('register-confirm')), 'correct-horse');
  await tester.ensureVisible(find.byKey(const Key('register-terms')));
  await tester.pump();
  await tester.tap(find.byKey(const Key('register-terms')));
  await tester.pump();
}

void main() {
  group('validation rules', () {
    test('handle', () {
      expect(QuantAccountRules.handleError(''), isNotNull);
      expect(QuantAccountRules.handleError('ab'), isNotNull);
      expect(QuantAccountRules.handleError('a' * 31), isNotNull);
      expect(QuantAccountRules.handleError('.abc'), isNotNull);
      expect(QuantAccountRules.handleError('abc'), isNull);
      expect(QuantAccountRules.handleError('Qa.Tester_1-x'), isNull);
      expect(QuantAccountRules.addressFor(' Qa.Tester '), 'qa.tester@quantmail.in');
    });

    test('password and confirm', () {
      expect(QuantAccountRules.passwordError(''), isNotNull);
      expect(QuantAccountRules.passwordError('short'), isNotNull);
      expect(QuantAccountRules.passwordError('aaaaaaaaaa'), isNotNull);
      expect(QuantAccountRules.passwordError('correct-horse'), isNull);
      expect(QuantAccountRules.confirmError('abc12345', 'abc12346'), isNotNull);
      expect(QuantAccountRules.confirmError('abc12345', 'abc12345'), isNull);
    });

    test('reset token from link or bare token', () {
      expect(QuantAccountRules.extractResetToken('https://quantmail.in/reset-password?token=abc123def456ghi789'),
          'abc123def456ghi789');
      expect(QuantAccountRules.extractResetToken('abc123def456ghi789'), 'abc123def456ghi789');
      expect(QuantAccountRules.extractResetToken('nope'), isNull);
    });
  });

  group('account service', () {
    test('network down is a failure, never a success', () async {
      final adapter = _Adapter((o) async => throw DioException.connectionError(requestOptions: o, reason: 'down'));
      final result = await _service(adapter).register(handle: 'qa.tester', password: 'correct-horse', acceptTerms: true);
      expect(result.ok, isFalse);
      expect(result.failure, AccountFailure.network);
    });

    test('sends the web payload and treats 409 as handle taken', () async {
      final adapter = _Adapter((o) async => _json(409, {
            'success': false,
            'error': {'code': 'USER_EXISTS', 'message': 'An account with this username already exists.'},
          }));
      final result = await _service(adapter).register(handle: 'Qa.Tester', password: 'correct-horse', acceptTerms: true);
      expect(result.failure, AccountFailure.handleTaken);
      final sent = adapter.requests.single;
      expect(sent.path, 'https://quantmail.in/api/auth/register');
      expect(sent.headers['Origin'], 'https://quantmail.in');
      expect(sent.data, {
        'email': 'qa.tester@quantmail.in',
        'password': 'correct-horse',
        'username': 'qa.tester',
        'displayName': 'qa.tester',
        'acceptTerms': true,
      });
    });

    test('429 maps to rate limited', () async {
      final adapter = _Adapter((o) async => _json(429, {'success': false}));
      final result = await _service(adapter).requestPasswordReset('x@quantmail.in');
      expect(result.failure, AccountFailure.rateLimited);
    });
  });

  group('register screen', () {
    testWidgets('double tap sends exactly one request', (tester) async {
      final gate = Completer<ResponseBody>();
      final adapter = _Adapter((o) => gate.future);
      await tester.pumpWidget(MaterialApp(home: QuantRegisterScreen(service: _service(adapter))));
      await _fill(tester);

      final button = find.text('Create QuantMail account');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pump();
      await tester.tap(find.byType(AuthPrimaryButton), warnIfMissed: false);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pump(const Duration(milliseconds: 100));

      expect(adapter.requests.length, 1);
      gate.complete(_json(409, {
        'success': false,
        'error': {'code': 'USER_EXISTS', 'message': 'taken'},
      }));
      await tester.pumpAndSettle();
      expect(adapter.requests.length, 1);
      expect(find.textContaining('already taken'), findsOneWidget);
    });

    testWidgets('network down shows an error and stays on the screen', (tester) async {
      final adapter = _Adapter((o) async => throw DioException.connectionError(requestOptions: o, reason: 'down'));
      await tester.pumpWidget(MaterialApp(home: QuantRegisterScreen(service: _service(adapter))));
      await _fill(tester);
      final button = find.text('Create QuantMail account');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(find.textContaining('could not reach'), findsOneWidget);
      expect(find.byType(QuantRegisterScreen), findsOneWidget);
    });

    testWidgets('invalid input sends nothing', (tester) async {
      final adapter = _Adapter((o) async => _json(200, {'success': true}));
      await tester.pumpWidget(MaterialApp(home: QuantRegisterScreen(service: _service(adapter))));
      final button = find.text('Create QuantMail account');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pump();
      expect(adapter.requests, isEmpty);
      expect(find.text('Choose a handle.'), findsOneWidget);
    });
  });
}
