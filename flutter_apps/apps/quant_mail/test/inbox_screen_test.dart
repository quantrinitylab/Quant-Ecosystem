// Honesty rules on the real InboxScreen: "Nothing left to read." only after a
// successful fetch with zero items, an error state when the fetch fails, the
// sample banner and the Developer switch only in debug builds with the switch
// on, and no Mail shell without a session.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/app/app_providers.dart';
import 'package:quant_mail/data/mail_exception.dart';
import 'package:quant_mail/data/models/mail_models.dart';
import 'package:quant_mail/design/components/components.dart';
import 'package:quant_mail/design/quant_mail_theme.dart';
import 'package:quant_mail/features/drawer/mail_drawer.dart';
import 'package:quant_mail/features/inbox/mail_list_controller.dart';
import 'package:quant_mail/features/inbox/inbox_screen.dart';
import 'package:quant_mail/features/shell/mail_shell.dart';
import 'package:quant_mail/screens/auth/quant_login_screen.dart';

import 'support/mail_test_support.dart';

Future<void> _pumpInbox(WidgetTester tester, ScriptedMail mail, {bool debugMode = true}) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    testApp(
      Scaffold(body: InboxScreen(onOpenDrawer: () {})),
      overrides: testOverrides(mail: mail, debugMode: debugMode),
    ),
  );
}

void main() {
  const String emptyText = 'Nothing left to read.';

  testWidgets('while the first fetch runs: skeleton, never the empty claim', (WidgetTester tester) async {
    final ScriptedMail mail = ScriptedMail();
    final Completer<MailPage> gate = Completer<MailPage>();
    mail.onList = (String? c) => gate.future;

    await _pumpInbox(tester, mail);
    await tester.pump();

    expect(find.byType(QmMailListSkeleton), findsOneWidget);
    expect(find.text(emptyText), findsNothing);

    gate.complete(const MailPage(items: <MailMessage>[]));
    await tester.pump();
    await tester.pump();
    expect(find.text(emptyText), findsOneWidget);
  });

  testWidgets('zero items after a successful fetch: empty state', (WidgetTester tester) async {
    await _pumpInbox(tester, ScriptedMail());
    await tester.pump();
    await tester.pump();

    expect(find.text(emptyText), findsOneWidget);
  });

  testWidgets('failed fetch: error state with Retry, no empty claim', (WidgetTester tester) async {
    final ScriptedMail mail = ScriptedMail();
    mail.onList = (String? c) async => throw const MailException(MailErrorKind.network);

    await _pumpInbox(tester, mail);
    await tester.pump();
    await tester.pump();

    expect(find.text("Can't reach Quant Mail."), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.text(emptyText), findsNothing);
  });

  testWidgets('refresh failure keeps the last list and shows the offline banner', (WidgetTester tester) async {
    final ScriptedMail mail = ScriptedMail();
    mail.onList = (String? c) async => MailPage(items: <MailMessage>[testMail('1')]);

    await _pumpInbox(tester, mail);
    await tester.pump();
    await tester.pump();
    expect(find.text('Sender 1'), findsOneWidget);

    mail.onList = (String? c) async => throw const MailException(MailErrorKind.timeout);
    final ProviderContainer container = ProviderScope.containerOf(tester.element(find.byType(InboxScreen)));
    await container.read(mailListProvider(MailView.inbox).notifier).refresh();
    await tester.pump();

    expect(find.text('Sender 1'), findsOneWidget);
    expect(find.textContaining("You're offline"), findsOneWidget);
    expect(find.text(emptyText), findsNothing);
  });

  testWidgets('sample banner and Developer switch only in debug builds', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    for (final bool debug in <bool>[true, false]) {
      await tester.pumpWidget(
        testApp(
          Scaffold(drawer: const MailDrawer(), body: const SizedBox()),
          overrides: testOverrides(mail: ScriptedMail(), debugMode: debug),
        ),
      );
      final ScaffoldState scaffold = tester.firstState(find.byType(Scaffold));
      scaffold.openDrawer();
      await tester.pumpAndSettle();
      expect(find.text('Developer'.toUpperCase()), debug ? findsOneWidget : findsNothing);
      expect(find.text('Sample data'), debug ? findsOneWidget : findsNothing);
      expect(find.text('Sample data (debug)'), findsNothing); // switch is off by default
      await tester.pumpWidget(const SizedBox());
    }
  });

  testWidgets('turning the switch on shows the banner on the inbox', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final ProviderContainer container = ProviderContainer(overrides: testOverrides());
    addTearDown(container.dispose);
    expect(container.read(sampleDataActiveProvider), isFalse); // default OFF
    container.read(sampleDataSwitchProvider.notifier).set(true);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: buildQuantMailTheme(ThemeData.dark()),
          home: Scaffold(body: InboxScreen(onOpenDrawer: () {})),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Sample data (debug)'), findsOneWidget);
    expect(find.text('Welcome to the sample inbox'), findsOneWidget);
  });

  testWidgets('the shell does not render without a session and goes to Sign in', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      testApp(const MailShell(), overrides: testOverrides(session: FakeSession(signedIn: false))),
    );

    expect(find.byType(InboxScreen), findsNothing);
    await tester.pump();
    await tester.pump();
    expect(find.byType(QuantLoginScreen), findsOneWidget);
    expect(find.byType(InboxScreen), findsNothing);
  });

  testWidgets('the shell shows five labelled pillars and builds the others lazily', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(testApp(const MailShell(), overrides: testOverrides(mail: ScriptedMail())));
    await tester.pump();

    for (final String label in <String>['Mail', 'Calendar', 'Drive', 'Contacts', 'Git']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('My Drive'), findsNothing);
    await tester.tap(find.text('Drive'));
    await tester.pump();
    expect(find.text('My Drive'), findsOneWidget);
  });
}
