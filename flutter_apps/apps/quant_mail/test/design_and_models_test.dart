// Token contrast (spec 3.1), pure formatters, and wire parsing.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/design/components/components.dart';
import 'package:quant_mail/design/qm_format.dart';
import 'package:quant_mail/design/quant_mail_theme.dart';
import 'package:quant_mail/design/quant_mail_tokens.dart';

void main() {
  const QuantMailTokens t = QuantMailTokens.obsidian;

  test('Obsidian text and accent pairs meet the spec contrast', () {
    expect(QuantMailTokens.contrast(t.textSecondary, t.canvas), greaterThanOrEqualTo(7));
    expect(QuantMailTokens.contrast(t.textMuted, t.panel), greaterThanOrEqualTo(4.5));
    expect(QuantMailTokens.contrast(t.onAccent, t.accent), greaterThanOrEqualTo(7));
    expect(QuantMailTokens.contrast(t.accentText, t.panel), greaterThanOrEqualTo(7));
    for (final QmAvatarTint tint in t.avatarTints) {
      expect(QuantMailTokens.contrast(tint.foreground, tint.background), greaterThanOrEqualTo(4.5));
    }
  });

  testWidgets('theme carries the token extension', (WidgetTester tester) async {
    final ThemeData theme = buildQuantMailTheme(ThemeData.dark());

    expect(theme.extension<QuantMailTokens>(), isNotNull);
    expect(theme.textTheme.bodyMedium?.fontFamily, 'Inter');
  });

  test('day labels and row times', () {
    final DateTime now = DateTime(2026, 10, 23, 12);

    expect(qmDayLabel(DateTime(2026, 10, 23, 8), now), 'Today');
    expect(qmDayLabel(DateTime(2026, 10, 22, 23), now), 'Yesterday');
    expect(qmDayLabel(DateTime(2026, 10, 20), now), 'Tuesday');
    expect(qmDayLabel(DateTime(2026, 9, 1), now), 'September 2026');
    expect(qmRowTime(DateTime(2026, 10, 23, 14, 2), now), '14:02');
    expect(qmRowTime(DateTime(2026, 10, 12), now), '12 Oct');
    expect(qmRowTime(DateTime(2025, 10, 12), now), '12 Oct 2025');
    expect(qmInitials('Ada Lovelace'), 'AL');
    expect(qmInitials('', 'zed@example.com'), 'Z');
  });

  test('row semantics read unread state, sender, subject, time and flags', () {
    expect(
      QmMailRow.semanticsLabel(
        unread: true,
        sender: 'Ada',
        subject: 'Hello',
        timeLabel: '14:02',
        hasAttachments: true,
        starred: true,
      ),
      'Unread, from Ada, Hello, 14:02, has attachments, starred',
    );
  });

  test('email JSON parses defensively', () {
    final MailMessage m = MailMessage.fromJson(<String, dynamic>{
      'id': 'e1',
      'threadId': null,
      'fromAddress': 'ada@example.com',
      'subject': 'Hi',
      'snippet': null,
      'bodyPlain': '  Hello   there  ',
      'toAddresses': <String>['you@example.com'],
      'isRead': false,
      'labels': <String>['l1'],
      'attachments': <dynamic>[
        <String, dynamic>{'id': 'meta_1', 'filename': 'a.txt', 'size': 3, 'url': ''},
        <String, dynamic>{'id': 'att_1', 'filename': 'b.pdf', 'size': 10, 'url': 'https://example.com/b'},
      ],
      'createdAt': '2026-10-23T10:00:00.000Z',
      'receivedAt': null,
    });

    expect(m.from.email, 'ada@example.com');
    expect(m.previewText, 'Hello there');
    expect(m.sortDate, DateTime.parse('2026-10-23T10:00:00.000Z'));
    expect(m.hasAttachments, isTrue);
    expect(m.attachments.map((MailAttachmentInfo a) => a.canDownload), <bool>[false, true]);
    expect(m.labelIds, <String>['l1']);
  });

  test('view query maps to the folderType / folderId parameters', () {
    expect(MailView.inbox.query, isEmpty);
    expect(MailView.starred.query, <String, String>{'folderType': 'STARRED'});
    expect(const MailView(MailFolderKind.custom, folderId: 'f1').query, <String, String>{'folderId': 'f1'});
  });
}
