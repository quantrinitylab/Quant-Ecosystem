// ============================================================================
// quant_app - ThreadScreen navigation + polish tests (VQA-P1-02/P2-08/P2-09)
//
// Pins the visual-qa fixes: the AppBar carries an explicit leading back
// button (never a navigation dead end), the error-state Retry uses the
// inbox's primary FilledButton style (not tonal), and message cards
// surface star/attachment state with accessibility labels.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/thread_screen.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_thread.dart';

/// Pumps [ThreadScreen] with the family overridden by [fakeFactory].
Future<void> _pumpThread(
  WidgetTester tester,
  FakeThreadNotifier Function() fakeFactory,
) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      threadDetailProvider.overrideWith(fakeFactory),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: ThreadScreen(threadId: 't-1')),
    ),
  );
  await tester.pump();
  await tester.pump();
}

/// Finds a [Semantics] widget carrying exactly [label].
///
/// Widget-tree check (no compiled semantics needed): the label lives on
/// the [Semantics] widget itself, so this works without
/// [WidgetTester.ensureSemantics].
Finder _semanticsWithLabel(String label) => find.byWidgetPredicate(
      (Widget widget) =>
          widget is Semantics && widget.properties.label == label,
    );

/// Builds an [Email] fixture with the given star/attachment flags.
Email _email(
  String id, {
  bool isStarred = false,
  bool hasAttachments = false,
}) =>
    Email(
      id: id,
      threadId: 't-1',
      subject: 'Subject $id',
      snippet: 'Snippet $id',
      from: const EmailAddress(email: 'a@example.com', name: 'Asha'),
      date: DateTime(2026, 10, 3, 10, 0),
      isRead: true,
      isStarred: isStarred,
      hasAttachments: hasAttachments,
    );

void main() {
  group('ThreadScreen navigation + polish', () {
    testWidgets('AppBar has an explicit leading back button', (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );

      // VQA-P1-02: the thread view is never a navigation dead end.
      expect(find.byType(BackButton), findsOneWidget);
    });

    testWidgets('error-state Retry uses the primary FilledButton style',
        (tester) async {
      await _pumpThread(tester, FakeThreadNotifier.error);

      // VQA-P2-08: unified with the inbox error state — primary
      // FilledButton.icon with the refresh affordance, not tonal.
      expect(find.widgetWithText(FilledButton, 'Retry'), findsOneWidget);
      expect(
        find.widgetWithIcon(FilledButton, Icons.refresh),
        findsOneWidget,
      );
      expect(find.byType(FilledButton), findsOneWidget);
    });

    testWidgets('starred message shows a filled star with semantics',
        (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(
          fakeThreadDetail(messages: <Email>[_email('m-1', isStarred: true)]),
        ),
      );

      expect(find.byIcon(Icons.star), findsOneWidget);
      expect(_semanticsWithLabel('Starred'), findsOneWidget);
    });

    testWidgets('unstarred message shows an outlined star', (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(
          fakeThreadDetail(messages: <Email>[_email('m-1')]),
        ),
      );

      expect(find.byIcon(Icons.star_outline), findsOneWidget);
      expect(_semanticsWithLabel('Not starred'), findsOneWidget);
      expect(find.byIcon(Icons.star), findsNothing);
    });

    testWidgets('message with attachments shows the clip icon', (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(
          fakeThreadDetail(
            messages: <Email>[_email('m-1', hasAttachments: true)],
          ),
        ),
      );

      expect(find.byIcon(Icons.attach_file), findsOneWidget);
      expect(_semanticsWithLabel('Has attachments'), findsOneWidget);
    });

    testWidgets('message without attachments shows no clip icon',
        (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(
          fakeThreadDetail(messages: <Email>[_email('m-1')]),
        ),
      );

      expect(find.byIcon(Icons.attach_file), findsNothing);
    });
  });
}
