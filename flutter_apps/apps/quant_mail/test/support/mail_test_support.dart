// Shared fakes for the screen tests. No network, no plugins.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:quant_mail/app/app_providers.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/data/models/session_models.dart';
import 'package:quant_mail/data/repositories/repositories.dart';
import 'package:quant_mail/design/quant_mail_theme.dart';
import 'package:quant_mail/features/inbox/inbox_state.dart';

/// A fixed "now" so day headers and row times do not depend on the clock.
final DateTime kTestNow = DateTime(2026, 10, 23, 15, 30);

class FakeSession implements SessionRepository {
  FakeSession({this.signedIn = true});

  final bool signedIn;
  int signOutCalls = 0;

  @override
  SessionState get state => signedIn
      ? const SessionState.signedIn(
          SessionUser(id: 'u1', email: 'ada@example.com', displayName: 'Ada Lovelace'),
        )
      : const SessionState.signedOut();

  @override
  Stream<SessionState> get changes => const Stream<SessionState>.empty();

  @override
  String? get accessToken => signedIn ? 'token' : null;

  @override
  Future<bool> refreshAccessToken() async => false;

  @override
  Future<void> signOut({String? message}) async => signOutCalls++;
}

class ScriptedMail implements MailRepository {
  Future<MailPage> Function(String? cursor) onList = (String? c) async => const MailPage(items: <MailMessage>[]);
  Future<MailConversation> Function(String id)? onConversation;
  final List<MailBatchAction> batchCalls = <MailBatchAction>[];

  @override
  Future<MailPage> list(MailView view, {String? cursor, int pageSize = 30}) => onList(cursor);

  MailCounts Function(MailView view) onCounts = (MailView v) => const MailCounts(totalCount: 0, unreadCount: 0);

  @override
  Future<MailCounts> counts(MailView view) async => onCounts(view);

  @override
  Future<MailConversation> getConversation(String id) =>
      onConversation == null ? throw UnimplementedError() : onConversation!(id);

  @override
  Future<void> markThreadRead(String id) async {}

  @override
  Future<int> applyBatch(MailBatchAction action, List<String> emailIds, {String? idempotencyKey}) async {
    batchCalls.add(action);
    return emailIds.length;
  }

  @override
  Future<void> unarchive(String emailId, {String? idempotencyKey}) async {}

  @override
  Future<void> restore(String emailId, {String? idempotencyKey}) async {}
}

class EmptyFolders implements FolderRepository {
  const EmptyFolders();

  @override
  Future<List<MailFolder>> folders() async => const <MailFolder>[];

  @override
  Future<List<MailLabel>> labels() async => const <MailLabel>[];
}

MailMessage testMail(String id, {bool read = false, bool starred = false, DateTime? at, String? html}) {
  final DateTime when = at ?? kTestNow.subtract(const Duration(hours: 1));
  return MailMessage(
    id: id,
    threadId: 't$id',
    from: MailAddress(email: 'sender$id@example.com', name: 'Sender $id'),
    to: const <MailAddress>[MailAddress(email: 'ada@example.com', name: 'Ada')],
    subject: 'Subject $id',
    snippet: 'Snippet $id',
    bodyPlain: 'Body $id',
    bodyHtml: html ?? '',
    isRead: read,
    isStarred: starred,
    receivedAt: when,
    createdAt: when,
  );
}

/// Overrides that make every screen run without plugins or network.
List<Override> testOverrides({
  MailRepository? mail,
  FolderRepository? folders,
  SessionRepository? session,
  bool debugMode = true,
  DateTime Function()? clock,
}) {
  return <Override>[
    sessionRepositoryProvider.overrideWithValue(session ?? FakeSession()),
    if (mail != null) mailRepositoryProvider.overrideWithValue(mail),
    folderRepositoryProvider.overrideWithValue(folders ?? const EmptyFolders()),
    debugModeProvider.overrideWithValue(debugMode),
    clockProvider.overrideWithValue(clock ?? () => kTestNow),
    deviceOnlineProvider.overrideWith((Ref ref) => Stream<bool>.value(true)),
  ];
}

/// Pumps [child] inside the Obsidian theme at a phone-sized surface.
Widget testApp(Widget child, {List<Override> overrides = const <Override>[], Key? boundaryKey}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildQuantMailTheme(ThemeData.dark()),
      home: RepaintBoundary(key: boundaryKey, child: child),
    ),
  );
}
