// DEBUG-ONLY sample data. This file must never be reachable in a release
// build: it is wired up only by `mailRepositoryProvider` when the runtime
// switch is on AND `kDebugMode` is true, and every screen that shows it also
// shows the "Sample data (debug)" banner. All people and domains are fictional
// (example.com is reserved for documentation).

import '../mail_exception.dart';
import '../models/mail_models.dart';
import '../repositories/repositories.dart';

class _Entry {
  _Entry(this.message, this.kind);

  MailMessage message;
  MailFolderKind kind;
}

class SampleMailRepository implements MailRepository {
  SampleMailRepository({DateTime Function()? clock}) : _clock = clock ?? DateTime.now {
    _seed();
  }

  final DateTime Function() _clock;
  final List<_Entry> _entries = <_Entry>[];

  void _seed() {
    final DateTime now = _clock();
    DateTime ago({int days = 0, int hours = 0, int minutes = 0}) =>
        now.subtract(Duration(days: days, hours: hours, minutes: minutes));

    void add(
      int n,
      String name,
      String subject,
      String body,
      DateTime at, {
      bool read = false,
      bool starred = false,
      MailFolderKind folder = MailFolderKind.inbox,
      List<MailAttachmentInfo> attachments = const <MailAttachmentInfo>[],
      List<String> labels = const <String>[],
      String html = '',
    }) {
      final String local = name.toLowerCase().replaceAll(' ', '.');
      _entries.add(_Entry(
        MailMessage(
          id: 'sample_$n',
          threadId: 'sample_thread_$n',
          from: MailAddress(email: '$local@example.com', name: name),
          to: const <MailAddress>[MailAddress(email: 'you@example.com', name: 'You')],
          subject: subject,
          snippet: body,
          bodyPlain: body,
          bodyHtml: html,
          isRead: read,
          isStarred: starred,
          hasAttachments: attachments.isNotEmpty,
          attachments: attachments,
          labelIds: labels,
          receivedAt: at,
          createdAt: at,
          version: 1,
        ),
        folder,
      ));
    }

    add(1, 'Ada Sample', 'Welcome to the sample inbox',
        'This is fictional sample data for debug builds only.', ago(minutes: 12),
        html: '<p>This is <b>fictional</b> sample data for debug builds only.</p>'
            '<p><img src="https://example.com/remote-image.png" alt="Remote image"></p>'
            '<script>alert("scripts never run")</script>');
    add(2, 'Basil Example', 'Quarterly numbers (draft)', 'Numbers attached. Please review before Friday.',
        ago(hours: 3),
        starred: true,
        labels: <String>['sample_label_work'],
        attachments: const <MailAttachmentInfo>[
          MailAttachmentInfo(id: 'meta_1', filename: 'numbers.xlsx', mimeType: 'application/vnd.ms-excel', size: 48200),
          MailAttachmentInfo(id: 'att_1', filename: 'notes.pdf', mimeType: 'application/pdf', size: 1250000, url: 'https://example.com/notes.pdf'),
        ]);
    add(3, 'Chloe Placeholder', 'Lunch on Thursday?', 'Are you free around one o\'clock?', ago(hours: 5), read: true);
    add(4, 'Dev Fixture', 'Build finished', 'The nightly build passed on all targets.', ago(days: 1, hours: 2),
        labels: <String>['sample_label_work', 'sample_label_ci', 'sample_label_extra']);
    add(5, 'Esha Mock', 'Photos from the trip', 'Sharing the album link with everyone.', ago(days: 1, hours: 9), read: true);
    add(6, 'Farid Demo', 'Invoice 1042', 'Your invoice for October is ready.', ago(days: 3), starred: true);
    add(7, 'Gita Stub', 'Meeting notes', 'Notes from this morning are below.', ago(days: 4), read: true);
    add(8, 'Hari Sample', 'Re: Plans for next month', 'Sounds good, let us go with option two.', ago(days: 6));
    add(9, 'Ira Example', 'Newsletter: what is new', 'Three small improvements this month.', ago(days: 12), read: true);
    add(10, 'Jai Placeholder', 'Reminder: renew domain', 'Your domain renews in 30 days.', ago(days: 20));
    add(11, 'Kavya Fixture', 'Sent: thanks for the update', 'Thanks for the update, speak soon.', ago(days: 2),
        read: true, folder: MailFolderKind.sent);
    add(12, 'Lev Mock', 'Archived example', 'This one lives in the archive.', ago(days: 30), read: true, folder: MailFolderKind.archive);
    add(13, 'Mina Demo', 'Spam example', 'Pretend this is junk mail.', ago(days: 2), folder: MailFolderKind.spam);
  }

  bool _inView(_Entry e, MailView view) {
    switch (view.kind) {
      case MailFolderKind.starred:
        return e.message.isStarred && e.kind != MailFolderKind.trash;
      case MailFolderKind.snoozed:
      case MailFolderKind.scheduled:
      case MailFolderKind.custom:
        return false;
      default:
        return e.kind == view.kind;
    }
  }

  List<_Entry> _view(MailView view) {
    final List<_Entry> items = _entries.where((_Entry e) => _inView(e, view)).toList()
      ..sort((_Entry a, _Entry b) => b.message.sortDate.compareTo(a.message.sortDate));
    return items;
  }

  @override
  Future<MailPage> list(MailView view, {String? cursor, int pageSize = 30}) async {
    final List<_Entry> all = _view(view);
    int start = 0;
    if (cursor != null) {
      final int? parsed = cursor.startsWith('sample:') ? int.tryParse(cursor.substring(7)) : null;
      if (parsed == null || parsed < 0) {
        throw const MailException(MailErrorKind.invalidCursor, code: 'INVALID_CURSOR');
      }
      start = parsed;
    }
    final int end = (start + pageSize).clamp(0, all.length);
    final List<_Entry> slice = start >= all.length ? <_Entry>[] : all.sublist(start, end);
    return MailPage(
      items: slice.map((_Entry e) => e.message).toList(),
      nextCursor: end < all.length ? 'sample:$end' : null,
      totalCount: all.length,
      unreadCount: all.where((_Entry e) => !e.message.isRead).length,
    );
  }

  @override
  Future<MailCounts> counts(MailView view) async {
    final List<_Entry> all = _view(view);
    return MailCounts(totalCount: all.length, unreadCount: all.where((_Entry e) => !e.message.isRead).length);
  }

  _Entry? _find(String id) {
    for (final _Entry e in _entries) {
      if (e.message.id == id || e.message.threadId == id) return e;
    }
    return null;
  }

  @override
  Future<MailConversation> getConversation(String id) async {
    final _Entry? e = _find(id);
    if (e == null) throw const MailException(MailErrorKind.notFound, statusCode: 404);
    return MailConversation(
      id: e.message.threadId ?? e.message.id,
      subject: e.message.subject,
      messages: <MailMessage>[e.message],
      isRead: e.message.isRead,
      isStarred: e.message.isStarred,
    );
  }

  @override
  Future<void> markThreadRead(String id) async {
    final _Entry? e = _find(id);
    if (e != null) e.message = e.message.copyWith(isRead: true);
  }

  @override
  Future<int> applyBatch(MailBatchAction action, List<String> emailIds, {String? idempotencyKey}) async {
    int count = 0;
    for (final String id in emailIds) {
      final _Entry? e = _find(id);
      if (e == null) continue;
      count++;
      switch (action) {
        case MailBatchAction.markRead:
          e.message = e.message.copyWith(isRead: true);
        case MailBatchAction.markUnread:
          e.message = e.message.copyWith(isRead: false);
        case MailBatchAction.star:
          e.message = e.message.copyWith(isStarred: true);
        case MailBatchAction.unstar:
          e.message = e.message.copyWith(isStarred: false);
        case MailBatchAction.archive:
          e.kind = MailFolderKind.archive;
        case MailBatchAction.delete:
          e.kind = MailFolderKind.trash;
      }
    }
    return count;
  }

  @override
  Future<void> unarchive(String emailId, {String? idempotencyKey}) async {
    final _Entry? e = _find(emailId);
    if (e != null) e.kind = MailFolderKind.inbox;
  }

  @override
  Future<void> restore(String emailId, {String? idempotencyKey}) async {
    final _Entry? e = _find(emailId);
    if (e != null) e.kind = MailFolderKind.inbox;
  }
}

class SampleFolderRepository implements FolderRepository {
  const SampleFolderRepository();

  @override
  Future<List<MailFolder>> folders() async => const <MailFolder>[
        MailFolder(id: 'sample_f_inbox', name: 'Inbox', type: 'INBOX'),
        MailFolder(id: 'sample_f_sent', name: 'Sent', type: 'SENT'),
        MailFolder(id: 'sample_f_drafts', name: 'Drafts', type: 'DRAFTS'),
        MailFolder(id: 'sample_f_archive', name: 'Archive', type: 'ARCHIVE'),
        MailFolder(id: 'sample_f_trash', name: 'Trash', type: 'TRASH'),
        MailFolder(id: 'sample_f_spam', name: 'Spam', type: 'SPAM'),
      ];

  @override
  Future<List<MailLabel>> labels() async => const <MailLabel>[
        MailLabel(id: 'sample_label_work', name: 'Work', color: '#6AA8FF'),
        MailLabel(id: 'sample_label_ci', name: 'Builds', color: '#3DDC97'),
        MailLabel(id: 'sample_label_extra', name: 'Extra', color: '#FFC857'),
      ];
}
