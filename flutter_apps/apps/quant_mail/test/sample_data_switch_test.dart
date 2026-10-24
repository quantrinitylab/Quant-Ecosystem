// Sample data is debug-only: default OFF, on only when the switch is on AND
// this is a debug build, and then the UI must show the debug banner.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/app/app_providers.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/data/models/session_models.dart';
import 'package:quant_mail/data/network/dio_mail_repository.dart';
import 'package:quant_mail/data/repositories/repositories.dart';
import 'package:quant_mail/data/sample/sample_mail_repository.dart';
import 'package:quant_mail/design/components/components.dart';

class _FakeSession implements SessionRepository {
  @override
  SessionState get state => const SessionState.signedOut();

  @override
  Stream<SessionState> get changes => const Stream<SessionState>.empty();

  @override
  String? get accessToken => null;

  @override
  Future<bool> refreshAccessToken() async => false;

  @override
  Future<void> signOut({String? message}) async {}
}

ProviderContainer _container({bool debugMode = true}) {
  final ProviderContainer c = ProviderContainer(overrides: [
    debugModeProvider.overrideWithValue(debugMode),
    sessionRepositoryProvider.overrideWithValue(_FakeSession()),
    apiDioProvider.overrideWithValue(Dio()),
  ]);
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('default is OFF and the real repository is used', () {
    final ProviderContainer c = _container();

    expect(c.read(sampleDataSwitchProvider), isFalse);
    expect(c.read(sampleDataActiveProvider), isFalse);
    expect(c.read(mailRepositoryProvider), isA<DioMailRepository>());
    expect(c.read(folderRepositoryProvider), isA<DioFolderRepository>());
  });

  test('switch ON in a debug build selects the sample repositories', () {
    final ProviderContainer c = _container();

    c.read(sampleDataSwitchProvider.notifier).set(true);

    expect(c.read(sampleDataActiveProvider), isTrue);
    expect(c.read(mailRepositoryProvider), isA<SampleMailRepository>());
    expect(c.read(folderRepositoryProvider), isA<SampleFolderRepository>());

    c.read(sampleDataSwitchProvider.notifier).set(false);
    expect(c.read(mailRepositoryProvider), isA<DioMailRepository>());
  });

  test('outside a debug build the switch cannot turn sample data on', () {
    final ProviderContainer c = _container(debugMode: false);

    c.read(sampleDataSwitchProvider.notifier).set(true);

    expect(c.read(sampleDataSwitchProvider), isFalse);
    expect(c.read(sampleDataActiveProvider), isFalse);
    expect(c.read(mailRepositoryProvider), isA<DioMailRepository>());
  });

  test('sample repository serves fictional mail, never real addresses', () async {
    final SampleMailRepository repo = SampleMailRepository(clock: () => DateTime(2026, 10, 23, 12));

    final MailPage page = await repo.list(MailView.inbox);

    expect(page.items, isNotEmpty);
    expect(page.items.every((MailMessage m) => m.from.email.endsWith('@example.com')), isTrue);
  });

  testWidgets('the sample banner always says so', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: QmSampleDataBanner())));

    expect(find.text('Sample data (debug)'), findsOneWidget);
  });
}
