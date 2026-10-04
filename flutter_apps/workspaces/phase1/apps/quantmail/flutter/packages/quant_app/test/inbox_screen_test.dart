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
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_inbox.dart';
import 'helpers/fake_mutation_service.dart';

Future<void> _pumpInbox(
  WidgetTester tester,
  FakeInboxNotifier Function() fake,
) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      inboxProvider.overrideWith(fake),
      // The failed-ops banner reads the modifier-queue service: a recording
      // double keeps the real drift/SQLite outbox stack out of widget tests.
      threadMutationServiceProvider.overrideWithValue(
        RecordingThreadMutationService(),
      ),
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

      expect(find.text("Sab padh liya! 🎉"), findsOneWidget);
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
      expect(find.text("Sab padh liya! 🎉"), findsNothing);
    });

    testWidgets('shows a spinner while the first page loads',
        (tester) async {
      await _pumpInbox(tester, FakeInboxNotifier.loading);

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text("Sab padh liya! 🎉"), findsNothing);
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

    testWidgets(
        'tapping a thread PUSHES the thread route (back returns to inbox)',
        (tester) async {
      // VQA-P1-02: pushNamed (not goNamed) keeps the inbox on the stack.
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          inboxProvider.overrideWith(
            () => FakeInboxNotifier.data(
              const InboxListState(threads: _threads),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);
      final GoRouter router = GoRouter(
        initialLocation: '/',
        routes: <RouteBase>[
          GoRoute(
            path: '/',
            builder: (BuildContext context, GoRouterState state) =>
                const InboxScreen(),
          ),
          GoRoute(
            path: '/thread/:threadId',
            name: 'thread',
            builder: (BuildContext context, GoRouterState state) => Text(
              'thread:${state.pathParameters['threadId']}',
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(routerConfig: router),
        ),
      );
      await tester.pump();
      await tester.pump();

      await tester.tap(find.text('Quarterly planning').first);
      await tester.pumpAndSettle();

      expect(find.text('thread:t-1'), findsOneWidget);
      expect(router.canPop(), isTrue,
          reason: 'push keeps the inbox beneath the thread route');
    });
  });
}
