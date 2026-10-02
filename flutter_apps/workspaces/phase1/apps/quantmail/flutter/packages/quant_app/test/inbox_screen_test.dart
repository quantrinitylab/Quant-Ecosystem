// ============================================================================
// quant_app - InboxScreen widget tests (Phase 1, M4)
// ============================================================================
//
// The inbox is a real list screen now (M4): it consumes [inboxProvider] and
// renders loading / error / empty / list states. These tests pin that
// rendered contract — the old M1 static-placeholder copy is gone — using a
// [FakeInboxNotifier] so no test ever touches the network or the cache.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_inbox.dart';

Future<void> _pumpInbox(
  WidgetTester tester,
  FakeInboxNotifier Function() fake,
) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      inboxProvider.overrideWith(fake),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: InboxScreen()),
    ),
  );
  // Frame 1: provider builds. Frame 2: the emitted state paints.
  await tester.pump();
  await tester.pump();
}

const List<ThreadSummary> _threads = <ThreadSummary>[
  ThreadSummary(
    id: 't-1',
    subject: 'Quarterly planning',
    snippet: 'Agenda attached for Thursday',
    isRead: false,
    participantNames: <String>['Asha'],
  ),
  ThreadSummary(
    id: 't-2',
    subject: 'Invoice #1042',
    snippet: 'Thanks for the payment',
    messageCount: 3,
    participantNames: <String>['Billing'],
  ),
];

void main() {
  group('InboxScreen', () {
    testWidgets('shows the Inbox title in the app bar', (tester) async {
      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(const InboxListState()),
      );

      expect(find.widgetWithText(AppBar, 'Inbox'), findsOneWidget);
    });

    testWidgets('renders the empty state when there are no threads',
        (tester) async {
      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(const InboxListState()),
      );

      expect(find.text("You're all caught up"), findsOneWidget);
      // No rows, no spinner, no error.
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('Something went wrong'), findsNothing);
    });

    testWidgets('renders one row per thread from the provider state',
        (tester) async {
      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(
          const InboxListState(threads: _threads),
        ),
      );

      expect(find.text('Quarterly planning'), findsOneWidget);
      expect(find.text('Agenda attached for Thursday'), findsOneWidget);
      expect(find.text('Invoice #1042'), findsOneWidget);
      // Unread thread gets the bold/unread treatment; read thread does not.
      expect(find.text("You're all caught up"), findsNothing);
    });

    testWidgets('shows a spinner while the first page loads',
        (tester) async {
      await _pumpInbox(tester, FakeInboxNotifier.loading);

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text("You're all caught up"), findsNothing);
    });

    testWidgets('shows an error with retry when the fetch fails',
        (tester) async {
      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(
          const InboxListState(errorMessage: 'No connection'),
        ),
      );

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('No connection'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Retry'), findsOneWidget);
    });
  });
}
