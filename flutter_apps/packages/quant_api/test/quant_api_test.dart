// QC-F-027 regression tests.
//
// The previous implementation of package:quant_api was simulated:
// QuantApiClient returned canned {'status': 'ok'} maps without any
// network I/O, QuantMailApi.fetchInbox returned a hardcoded inbox with
// invented people, and sendEmail/triageThread always reported success.
// Every test below FAILS against that implementation (it returned
// values instead of throwing) and passes against the fail-closed one.

import 'package:flutter_test/flutter_test.dart';
import 'package:quant_api/quant_api.dart';

void main() {
  group('QuantApiClient fails closed (no simulated responses)', () {
    test('get throws QuantApiNotConnectedException instead of canned ok',
        () async {
      final client = QuantApiClient();
      await expectLater(
        client.get('/mail/threads'),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });

    test('post throws QuantApiNotConnectedException instead of echoing body',
        () async {
      final client = QuantApiClient();
      await expectLater(
        client.post('/mail/send', {'subject': 'hello'}),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });

    test('exception names the attempted operation', () async {
      final client = QuantApiClient();
      try {
        await client.get('/mail/threads');
        fail('expected QuantApiNotConnectedException');
      } on QuantApiNotConnectedException catch (e) {
        expect(e.operation, contains('/mail/threads'));
        expect(e.toString(), contains('no network transport'));
      }
    });

    test('token storage still works (not a network operation)', () {
      final client = QuantApiClient(token: 'initial');
      expect(client.bearerToken, 'initial');
      client.setToken('rotated');
      expect(client.bearerToken, 'rotated');
      client.setToken(null);
      expect(client.bearerToken, isNull);
    });
  });

  group('QuantMailApi has no fabricated data', () {
    test('fetchInbox throws instead of returning the hardcoded inbox',
        () async {
      final api = QuantMailApi(QuantApiClient());
      await expectLater(
        api.fetchInbox(),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });

    test('fetchInbox throws for any lens', () async {
      final api = QuantMailApi(QuantApiClient());
      await expectLater(
        api.fetchInbox(lens: 'priority'),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });

    test('sendEmail never reports success for unsent mail', () async {
      final api = QuantMailApi(QuantApiClient());
      await expectLater(
        api.sendEmail(to: ['a@b.c'], subject: 's', body: 'b'),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });

    test('triageThread never reports success for an untaken action',
        () async {
      final api = QuantMailApi(QuantApiClient());
      await expectLater(
        api.triageThread('th-001', 'archive'),
        throwsA(isA<QuantApiNotConnectedException>()),
      );
    });
  });
}
