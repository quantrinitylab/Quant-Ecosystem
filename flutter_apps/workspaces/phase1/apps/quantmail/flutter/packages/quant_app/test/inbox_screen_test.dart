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
      expect(
        find.ancestor(
          of: find.text('Retry'),
          matching: find.bySubtype<FilledButton>(),
        ),
        findsOneWidget,
      );
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

    testWidgets('Outlook parity: Focused vs Other tabs filter threads',
        (tester) async {
      const List<ThreadSummary> threadsWithTabs = <ThreadSummary>[
        ThreadSummary(
          id: 't-focused',
          subject: 'Important client email',
          snippet: 'Please review',
          isFocused: true,
        ),
        ThreadSummary(
          id: 't-other',
          subject: 'Weekly newsletter',
          snippet: 'Your updates',
          isFocused: false,
        ),
      ];

      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(
          const InboxListState(threads: threadsWithTabs),
        ),
      );

      // Default: Focused tab is active
      expect(find.text('Focused'), findsOneWidget);
      expect(find.text('Other'), findsOneWidget);
      expect(find.text('Important client email'), findsOneWidget);
      expect(find.text('Weekly newsletter'), findsNothing);

      // Switch to Other tab
      await tester.tap(find.text('Other'));
      await tester.pumpAndSettle();

      expect(find.text('Weekly newsletter'), findsOneWidget);
      expect(find.text('Important client email'), findsNothing);

      // Switch back to Focused tab
      await tester.tap(find.text('Focused'));
      await tester.pumpAndSettle();

      expect(find.text('Important client email'), findsOneWidget);
      expect(find.text('Weekly newsletter'), findsNothing);
    });

    testWidgets('Outlook parity: Flagged filter chip filters flagged threads',
        (tester) async {
      const List<ThreadSummary> threadsWithFlags = <ThreadSummary>[
        ThreadSummary(
          id: 't-flagged',
          subject: 'Action required',
          snippet: 'Follow up today',
          isFlagged: true,
        ),
        ThreadSummary(
          id: 't-normal',
          subject: 'FYI update',
          snippet: 'No action needed',
          isFlagged: false,
        ),
      ];

      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(
          const InboxListState(threads: threadsWithFlags),
        ),
      );

      // Before filtering, both show (in focused tab by default)
      expect(find.text('Action required'), findsOneWidget);
      expect(find.text('FYI update'), findsOneWidget);

      // Tap Flagged filter chip
      await tester.tap(find.widgetWithText(FilterChip, 'Flagged'));
      await tester.pumpAndSettle();

      expect(find.text('Action required'), findsOneWidget);
      expect(find.text('FYI update'), findsNothing);

      // Tap again to toggle off
      await tester.tap(find.widgetWithText(FilterChip, 'Flagged'));
      await tester.pumpAndSettle();

      expect(find.text('Action required'), findsOneWidget);
      expect(find.text('FYI update'), findsOneWidget);
    });

    testWidgets('Outlook parity: Dual AI + Compose floating pill actions',
        (tester) async {
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          inboxProvider.overrideWith(
            () => FakeInboxNotifier.data(
              const InboxListState(threads: _threads),
            ),
          ),
          threadMutationServiceProvider.overrideWithValue(
            RecordingThreadMutationService(),
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
            path: '/compose',
            name: 'compose',
            builder: (BuildContext context, GoRouterState state) =>
                const Text('compose-screen'),
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
      await tester.pumpAndSettle();

      // Find Quanty AI button and sparkle icon
      expect(find.text('Quanty AI'), findsOneWidget);
      expect(find.byIcon(Icons.auto_awesome), findsOneWidget);

      // Tap Quanty AI
      await tester.tap(find.text('Quanty AI'));
      await tester.pump();
      expect(find.text('Quanty AI assistant activated'), findsOneWidget);
      await tester.pump(const Duration(seconds: 3));

      // Find Compose button and tap it
      expect(find.text('Compose'), findsOneWidget);
      expect(find.byIcon(Icons.edit_outlined), findsOneWidget);

      await tester.tap(find.text('Compose'));
      await tester.pumpAndSettle();

      expect(find.text('compose-screen'), findsOneWidget);
    });

    testWidgets('Outlook parity: Flag and Pin indicators on _ThreadRow',
        (tester) async {
      const List<ThreadSummary> indicatorsThreads = <ThreadSummary>[
        ThreadSummary(
          id: 't-pinned-flagged',
          subject: 'Pinned and Flagged',
          snippet: 'Very important',
          isPinned: true,
          isFlagged: true,
        ),
      ];

      await _pumpInbox(
        tester,
        () => FakeInboxNotifier.data(
          const InboxListState(threads: indicatorsThreads),
        ),
      );

      expect(find.byIcon(Icons.push_pin), findsOneWidget);
      expect(find.byIcon(Icons.flag), findsOneWidget);
    });
  });
}
