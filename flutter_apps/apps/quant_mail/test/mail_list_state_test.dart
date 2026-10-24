// "Nothing left to read." may appear only after a successful fetch that
// returned zero items. Loading, failure and not-yet-fetched never claim empty.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/app/app_providers.dart';
import 'package:quant_mail/data/mail_exception.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/data/models/session_models.dart';
import 'package:quant_mail/data/repositories/repositories.dart';
import 'package:quant_mail/features/inbox/mail_list_controller.dart';

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

class _ScriptedMail implements MailRepository {
  Future<MailPage> Function(String? cursor) onList = (String? c) async => const MailPage(items: <MailMessage>[]);

  @override
  Future<MailPage> list(MailView view, {String? cursor, int pageSize = 30}) => onList(cursor);

  @override
  Future<MailCounts> counts(MailView view) => throw UnimplementedError();

  @override
  Future<MailConversation> getConversation(String id) => throw UnimplementedError();

  @override
  Future<void> markThreadRead(String id) => throw UnimplementedError();

  @override
  Future<int> applyBatch(MailBatchAction action, List<String> emailIds, {String? idempotencyKey}) =>
      throw UnimplementedError();

  @override
  Future<void> unarchive(String emailId, {String? idempotencyKey}) => throw UnimplementedError();

  @override
  Future<void> restore(String emailId, {String? idempotencyKey}) => throw UnimplementedError();
}

MailMessage _mail(String id) => MailMessage(
      id: id,
      from: const MailAddress(email: 'a@example.com', name: 'A'),
      subject: 's$id',
      createdAt: DateTime(2026, 10, 23),
    );

void main() {
  late _ScriptedMail repo;
  late ProviderContainer container;
  const MailView view = MailView.inbox;

  setUp(() {
    repo = _ScriptedMail();
    container = ProviderContainer(overrides: [
      mailRepositoryProvider.overrideWithValue(repo),
      sessionRepositoryProvider.overrideWithValue(_FakeSession()),
    ]);
    addTearDown(container.dispose);
  });

  MailListState read() => container.read(mailListProvider(view));
  MailListController ctl() => container.read(mailListProvider(view).notifier);

  test('before any fetch: skeleton, never empty', () {
    expect(read().showEmpty, isFalse);
    expect(read().showSkeleton, isTrue);
  });

  test('while the first fetch is running: never empty', () async {
    final Completer<MailPage> gate = Completer<MailPage>();
    repo.onList = (String? c) => gate.future;

    final Future<void> pending = ctl().load();

    expect(read().isLoading, isTrue);
    expect(read().showEmpty, isFalse);
    gate.complete(const MailPage(items: <MailMessage>[]));
    await pending;
    expect(read().showEmpty, isTrue);
  });

  test('failed first fetch: error state, never empty', () async {
    repo.onList = (String? c) async => throw const MailException(MailErrorKind.network);

    await ctl().load();

    expect(read().showFullError, isTrue);
    expect(read().showEmpty, isFalse);
    expect(read().hasLoaded, isFalse);
    expect(read().isOffline, isTrue);
  });

  test('successful fetch with zero items: empty', () async {
    repo.onList = (String? c) async => const MailPage(items: <MailMessage>[], unreadCount: 0);

    await ctl().load();

    expect(read().hasLoaded, isTrue);
    expect(read().showEmpty, isTrue);
    expect(read().showFullError, isFalse);
  });

  test('refresh failure keeps the last list, shows a banner, and is not empty', () async {
    repo.onList = (String? c) async => MailPage(items: <MailMessage>[_mail('1')]);
    await ctl().load();
    repo.onList = (String? c) async => throw const MailException(MailErrorKind.timeout);

    await ctl().refresh();

    expect(read().items.map((MailMessage m) => m.id), <String>['1']);
    expect(read().showErrorBanner, isTrue);
    expect(read().isOffline, isTrue);
    expect(read().showEmpty, isFalse);
  });

  test('a failed refresh after an empty result does not claim empty again', () async {
    await ctl().load();
    expect(read().showEmpty, isTrue);
    repo.onList = (String? c) async => throw const MailException(MailErrorKind.server, statusCode: 500);

    await ctl().refresh();

    expect(read().showEmpty, isFalse);
    expect(read().showErrorBanner, isTrue);
  });

  test('load more appends by cursor and keeps the list when it fails', () async {
    repo.onList = (String? c) async => MailPage(items: <MailMessage>[_mail('1')], nextCursor: 'c1');
    await ctl().load();
    repo.onList = (String? c) async => throw const MailException(MailErrorKind.network);

    await ctl().loadMore();

    expect(read().items, hasLength(1));
    expect(read().loadMoreError, isNotNull);
    expect(read().hasMore, isTrue);

    String? usedCursor;
    repo.onList = (String? c) async {
      usedCursor = c;
      return MailPage(items: <MailMessage>[_mail('1'), _mail('2')]);
    };
    await ctl().loadMore();

    expect(usedCursor, 'c1');
    expect(read().items.map((MailMessage m) => m.id), <String>['1', '2']);
    expect(read().hasMore, isFalse);
  });
}
