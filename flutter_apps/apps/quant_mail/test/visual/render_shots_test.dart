// Host-rendered screenshots of the Quant Mail screens (390x844 logical px,
// Inter loaded from the bundled asset). Not part of the normal run: set
// QM_SHOTS_DIR to the output folder to render, for example
//   $env:QM_SHOTS_DIR = 'C:\...\quantmail\build\shots'; flutter test test/visual
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/app/app_providers.dart';
import 'package:quant_mail/data/mail_exception.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/data/repositories/repositories.dart';
import 'package:quant_mail/design/components/components.dart';
import 'package:quant_mail/design/quant_mail_theme.dart';
import 'package:quant_mail/features/inbox/mail_list_controller.dart';
import 'package:quant_mail/features/shell/mail_shell.dart';
import 'package:quant_mail/features/thread/thread_screen.dart';

import '../support/mail_test_support.dart';

class _Folders implements FolderRepository {
  const _Folders();

  @override
  Future<List<MailFolder>> folders() async => const <MailFolder>[
        MailFolder(id: 'f1', name: 'Inbox', type: 'INBOX'),
        MailFolder(id: 'f2', name: 'Receipts', type: 'CUSTOM'),
      ];

  @override
  Future<List<MailLabel>> labels() async => const <MailLabel>[
        MailLabel(id: 'l1', name: 'Work', color: '#6AA8FF'),
        MailLabel(id: 'l2', name: 'Builds', color: '#3DDC97'),
        MailLabel(id: 'l3', name: 'Travel', color: '#FFC857'),
      ];
}

MailMessage _m(
  String id,
  String name,
  String subject,
  String snippet,
  Duration ago, {
  bool read = false,
  bool starred = false,
  bool files = false,
  List<String> labels = const <String>[],
}) {
  final DateTime at = kTestNow.subtract(ago);
  return MailMessage(
    id: id,
    threadId: 't$id',
    from: MailAddress(email: '${name.split(' ').first.toLowerCase()}@example.com', name: name),
    to: const <MailAddress>[MailAddress(email: 'ada@example.com', name: 'Ada Lovelace')],
    subject: subject,
    snippet: snippet,
    isRead: read,
    isStarred: starred,
    hasAttachments: files,
    labelIds: labels,
    receivedAt: at,
    createdAt: at,
  );
}

List<MailMessage> _shotMails() => <MailMessage>[
      _m('1', 'Basil Example', 'Quarterly numbers for review', 'Numbers are attached. Please look before Friday.',
          const Duration(minutes: 25), files: true, labels: <String>['l1']),
      _m('2', 'Chloe Placeholder', 'Lunch on Thursday?', 'Are you free around one o\'clock? The new place by the station.',
          const Duration(hours: 3), starred: true),
      _m('3', 'Dev Fixture', 'Build finished on all targets', 'The nightly build passed. Two warnings remain in the analyzer.',
          const Duration(hours: 5), read: true, labels: <String>['l2', 'l1', 'l3']),
      _m('4', 'Esha Mock', 'Photos from the trip', 'Sharing the album link with everyone who came along.',
          const Duration(days: 1, hours: 2), read: true, files: true),
      _m('5', 'Farid Demo', 'Invoice 1042 is ready', 'Your invoice for October is ready to download.',
          const Duration(days: 1, hours: 9)),
      _m('6', 'Gita Stub', 'A very long subject line that keeps going well past the width of a phone screen',
          'And a long preview line that also keeps going and must end with an ellipsis, not an overflow.',
          const Duration(days: 3), read: true),
      _m('7', 'Hari Sample', 'Re: Plans for next month', 'Sounds good, let us go with option two.',
          const Duration(days: 12)),
    ];

Future<void> _loadFonts() async {
  final FontLoader loader = FontLoader('Inter');
  for (final String f in <String>['Regular', 'Medium', 'SemiBold', 'Bold']) {
    final Uint8List bytes = File('assets/fonts/Inter-$f.ttf').readAsBytesSync();
    loader.addFont(Future<ByteData>.value(ByteData.sublistView(bytes)));
  }
  await loader.load();

  // The icon font from the Flutter SDK, otherwise every icon renders as a box.
  final String root = Platform.environment['FLUTTER_ROOT'] ?? r'C:\src\flutter';
  final File icons = File('$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final FontLoader iconLoader = FontLoader('MaterialIcons')
      ..addFont(Future<ByteData>.value(ByteData.sublistView(icons.readAsBytesSync())));
    await iconLoader.load();
  }
}

void main() {
  final String? outDir = Platform.environment['QM_SHOTS_DIR'];
  final bool enabled = outDir != null && outDir.isNotEmpty;

  setUpAll(() async {
    if (!enabled) return;
    TestWidgetsFlutterBinding.ensureInitialized();
    await _loadFonts();
    Directory(outDir).createSync(recursive: true);
  });

  Future<void> shoot(WidgetTester tester, GlobalKey key, String name) async {
    final RenderRepaintBoundary boundary = tester.renderObject(find.byKey(key));
    await tester.runAsync(() async {
      final ui.Image image = await boundary.toImage(pixelRatio: 1);
      final ByteData? data = await image.toByteData(format: ui.ImageByteFormat.png);
      File('$outDir/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
    });
  }

  void phone(WidgetTester tester) {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
  }

  Future<ProviderContainer> pumpShell(
    WidgetTester tester,
    GlobalKey key,
    ScriptedMail mail, {
    bool sample = false,
  }) async {
    final ProviderContainer container = ProviderContainer(
      overrides: testOverrides(
        mail: sample ? null : mail,
        folders: const _Folders(),
        clock: sample ? DateTime.now : null,
      ),
    );
    addTearDown(container.dispose);
    if (sample) container.read(sampleDataSwitchProvider.notifier).set(true);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildQuantMailTheme(ThemeData.dark()),
          home: RepaintBoundary(key: key, child: const MailShell()),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    return container;
  }

  ScriptedMail scripted() {
    final ScriptedMail mail = ScriptedMail();
    mail.onList = (String? c) async => MailPage(items: _shotMails(), unreadCount: 4, totalCount: 7);
    mail.onCounts = (MailView v) =>
        MailCounts(totalCount: v == MailView.drafts ? 2 : 7, unreadCount: v == MailView.inbox ? 4 : 0);
    return mail;
  }

  testWidgets('inbox loading', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    final Completer<MailPage> never = Completer<MailPage>();
    final ScriptedMail mail = ScriptedMail()..onList = (String? c) => never.future;
    await pumpShell(tester, key, mail);
    await shoot(tester, key, '01-inbox-loading');
  }, skip: !enabled);

  testWidgets('inbox loaded (sample data)', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, ScriptedMail(), sample: true);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await shoot(tester, key, '02-inbox-loaded-sample');
  }, skip: !enabled);

  testWidgets('inbox loaded (scripted, labels and files)', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, scripted());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await shoot(tester, key, '02b-inbox-loaded');
  }, skip: !enabled);

  testWidgets('inbox empty', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, ScriptedMail());
    await tester.pump();
    await shoot(tester, key, '03-inbox-empty');
  }, skip: !enabled);

  testWidgets('inbox error', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    final ScriptedMail mail = ScriptedMail()..onList = (String? c) async => throw const MailException(MailErrorKind.network);
    await pumpShell(tester, key, mail);
    await tester.pump();
    await shoot(tester, key, '04-inbox-error');
  }, skip: !enabled);

  testWidgets('inbox offline banner', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    final ScriptedMail mail = scripted();
    final ProviderContainer c = await pumpShell(tester, key, mail);
    await tester.pump();
    mail.onList = (String? cursor) async => throw const MailException(MailErrorKind.network);
    await c.read(mailListProvider(MailView.inbox).notifier).refresh();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await shoot(tester, key, '05-inbox-offline');
  }, skip: !enabled);

  testWidgets('inbox selection mode', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, scripted());
    await tester.pump();
    await tester.longPress(find.byKey(const ValueKey<String>('row-1')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey<String>('row-3')));
    await tester.pump(const Duration(milliseconds: 200));
    await shoot(tester, key, '06-inbox-selection');
  }, skip: !enabled);

  testWidgets('inbox swipe panel', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, scripted());
    await tester.pump();
    final TestGesture g = await tester.startGesture(tester.getCenter(find.byKey(const ValueKey<String>('row-2'))));
    await g.moveBy(const Offset(40, 0));
    await tester.pump();
    await g.moveBy(const Offset(120, 0));
    await tester.pump(const Duration(milliseconds: 100));
    await shoot(tester, key, '07-inbox-swipe');
    await g.cancel();
    await tester.pumpAndSettle();
  }, skip: !enabled);

  testWidgets('thread', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    final ScriptedMail mail = scripted();
    MailMessage msg(String id, String name, String body, {String html = '', List<MailAttachmentInfo> files = const <MailAttachmentInfo>[], Duration ago = const Duration(hours: 1)}) {
      final DateTime at = kTestNow.subtract(ago);
      return MailMessage(
        id: id,
        threadId: 'tt',
        from: MailAddress(email: '${name.split(' ').first.toLowerCase()}@example.com', name: name),
        to: const <MailAddress>[MailAddress(email: 'ada@example.com', name: 'Ada Lovelace')],
        subject: 'Quarterly numbers for review',
        snippet: body,
        bodyPlain: body,
        bodyHtml: html,
        isRead: true,
        hasAttachments: files.isNotEmpty,
        attachments: files,
        receivedAt: at,
        createdAt: at,
      );
    }

    mail.onConversation = (String id) async => MailConversation(
          id: 'tt',
          subject: 'Quarterly numbers for review',
          messages: <MailMessage>[
            msg('a', 'Basil Example', 'First draft is in the shared folder.', ago: const Duration(days: 2)),
            msg('b', 'Ada Lovelace', 'Thanks, I will read it tonight.', ago: const Duration(days: 1)),
            msg(
              'c',
              'Basil Example',
              'Updated numbers are attached.',
              html: '<p>Hi Ada,</p><p>The <b>updated numbers</b> are attached. Highlights:</p>'
                  '<ul><li>Revenue is up 4 percent</li><li>Costs are flat</li></ul>'
                  '<p>Details at <a href="https://example.com/report">the report page</a>.</p>'
                  '<img src="https://tracker.example/pixel.gif" alt="Chart">'
                  '<script>alert(1)</script><blockquote>Earlier note quoted here.</blockquote>',
              files: const <MailAttachmentInfo>[
                MailAttachmentInfo(id: 'meta_1', filename: 'numbers.xlsx', size: 48200),
                MailAttachmentInfo(id: 'att_1', filename: 'notes.pdf', size: 1250000, url: 'https://example.com/notes.pdf'),
              ],
              ago: const Duration(minutes: 25),
            ),
          ],
        );
    final ProviderContainer container = ProviderContainer(overrides: testOverrides(mail: mail, folders: const _Folders()));
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildQuantMailTheme(ThemeData.dark()),
          home: RepaintBoundary(
            key: key,
            child: ThreadScreen(message: _shotMails().first, view: MailView.inbox),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 600)); // capsule entrance animation
    await shoot(tester, key, '08-thread');
  }, skip: !enabled);

  testWidgets('drawer', (WidgetTester tester) async {
    phone(tester);
    final GlobalKey key = GlobalKey();
    await pumpShell(tester, key, scripted());
    await tester.pump();
    tester.state<ScaffoldState>(find.byType(Scaffold).first).openDrawer();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 100));
    await shoot(tester, key, '09-drawer');
    await tester.drag(find.text('Sign out'), const Offset(0, -300));
    await tester.pump(const Duration(milliseconds: 400));
    await shoot(tester, key, '09b-drawer-developer');
  }, skip: !enabled);

  test('QmBottomBar has five labelled items', () {
    expect(kPillarBarItems.map((QmBarItem i) => i.label), <String>['Mail', 'Calendar', 'Drive', 'Contacts', 'Git']);
  });
}
