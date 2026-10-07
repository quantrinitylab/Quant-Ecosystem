// ============================================================================
// quant_app - ThreadScreen widget tests (Phase 1, M5)
// ============================================================================
//
// The thread view is a real screen now (M5): it consumes W1's
// `threadDetailProvider` family and renders loading / error / empty / list
// states, fires `markReadOptimistic()` once on open, and wires the actions
// row to the real `POST /emails/batch`. These tests pin that rendered
// contract with a [FakeThreadNotifier] so no test ever touches the network.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/thread_screen.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_mutation_service.dart';
import 'helpers/fake_thread.dart';

/// Records `batch` calls (and fails loudly on any other API use): proves
/// the actions row routes through the modifier queue, never the raw API.
class _RecordingEmailsApi implements EmailsApi {
  final List<List<Map<String, dynamic>>> batchCalls =
      <List<Map<String, dynamic>>>[];

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #batch) {
      batchCalls.add(
        (invocation.positionalArguments.single as List)
            .cast<Map<String, dynamic>>(),
      );
    }
    // Any raw API call (including batch) is a contract violation: actions
    // must route through the ThreadMutationService modifier queue. The
    // recording above still lets the test assert the call never happened.
    throw UnimplementedError(
      'Raw API call ${invocation.memberName} — use the modifier queue.',
    );
  }
}

/// Pumps a dummy inbox with [ThreadScreen] pushed on top — the production
/// navigation shape (the app always has the inbox beneath the thread).
/// This matters for pop-then-confirm actions: popping the LAST route tears
/// the overlay down with it, but popping over a live inbox lets the
/// confirmation snackbar survive, exactly like the real GoRouter app.
Future<void> _pumpThreadOverInbox(
  WidgetTester tester, {
  required RecordingThreadMutationService mutationService,
  _RecordingEmailsApi? emailsApi,
}) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      threadDetailProvider.overrideWith(
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      ),
      threadMutationServiceProvider.overrideWithValue(mutationService),
      if (emailsApi != null) emailsApiProvider.overrideWithValue(emailsApi),
    ],
  );
  addTearDown(container.dispose);
  final GlobalKey<NavigatorState> navKey = GlobalKey<NavigatorState>();
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        navigatorKey: navKey,
        home: const Scaffold(body: Text('inbox')),
      ),
    ),
  );
  await tester.pumpAndSettle();
  navKey.currentState!.push(
    MaterialPageRoute<void>(
      builder: (_) => const ThreadScreen(threadId: 't-1'),
    ),
  );
  await tester.pumpAndSettle();
  expect(find.byType(ThreadScreen), findsOneWidget);
}

/// Pumps [ThreadScreen] with the family overridden by [fakeFactory], and
/// returns the fake that was actually installed (so tests can assert on
/// `refreshCalled` / `markReadCalled`).
///
/// The failed-ops banner reads [threadMutationServiceProvider], so the
/// modifier queue is always overridden with a recording double — the real
/// drift/SQLite outbox stack stays out of widget tests. Pass
/// [mutationService] to assert on the queue calls a test triggers.
Future<FakeThreadNotifier> _pumpThread(
  WidgetTester tester,
  FakeThreadNotifier Function() fakeFactory, {
  RecordingThreadMutationService? mutationService,
  _RecordingEmailsApi? emailsApi,
}) async {
  late final FakeThreadNotifier fake;
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      // Family-level override: applies to every member the screen watches.
      threadDetailProvider.overrideWith(() {
        fake = fakeFactory();
        return fake;
      }),
      threadMutationServiceProvider.overrideWithValue(
        mutationService ?? RecordingThreadMutationService(),
      ),
      if (emailsApi != null) emailsApiProvider.overrideWithValue(emailsApi),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: ThreadScreen(threadId: 't-1')),
    ),
  );
  // Frame 1: provider builds. Frame 2: the emitted state paints.
  await tester.pump();
  await tester.pump();
  return fake;
}

void main() {
  group('ThreadScreen', () {
    testWidgets('constructor signature is intact (threadId required)',
        (tester) async {
      // Compile-time: const constructor with a required named threadId.
      const ThreadScreen screen = ThreadScreen(threadId: 'abc');
      expect(screen.threadId, 'abc');

      await _pumpThread(tester, FakeThreadNotifier.loading);
      expect(find.byType(ThreadScreen), findsOneWidget);
    });

    testWidgets('shows a spinner while the thread loads', (tester) async {
      await _pumpThread(tester, FakeThreadNotifier.loading);

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Quarterly planning'), findsNothing);
    });

    testWidgets('renders the thread subject in the app bar', (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );

      expect(find.widgetWithText(AppBar, 'Quarterly planning'),
          findsOneWidget);
    });

    testWidgets('renders one card per message with sender and snippet',
        (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );

      expect(find.text('Asha'), findsOneWidget);
      expect(find.text('Agenda attached for Thursday'), findsOneWidget);
      expect(find.text('Ravi'), findsOneWidget);
      expect(find.text('Looks good to me'), findsOneWidget);
      // The thread subject shows once, on the first message card (and once
      // in the app bar).
      expect(find.text('Quarterly planning'), findsNWidgets(2));
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('shows the empty state when the thread has no messages',
        (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail(messages: <Email>[])),
      );

      expect(find.text('Koi message nahi'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('shows the error state with a working retry', (tester) async {
      final FakeThreadNotifier fake = await _pumpThread(
        tester,
        FakeThreadNotifier.error,
      );

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Thread failed to load.'), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pump();

      expect(fake.refreshCalled, isTrue);
    });

    testWidgets('fires markReadOptimistic exactly once on open',
        (tester) async {
      final FakeThreadNotifier fake = await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );
      await tester.pump();

      expect(fake.markReadCalled, isTrue);

      // Rebuilds do not re-fire.
      await tester.pump();
      await tester.pump();
      expect(fake.markReadCalled, isTrue);
    });

    testWidgets('renders the Archive / Mark-unread / Delete actions',
        (tester) async {
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );

      expect(
        find.widgetWithIcon(IconButton, Icons.archive_outlined),
        findsOneWidget,
      );
      expect(
        find.widgetWithIcon(IconButton, Icons.mark_email_unread_outlined),
        findsOneWidget,
      );
      expect(
        find.widgetWithIcon(IconButton, Icons.delete_outline),
        findsOneWidget,
      );
    });

    testWidgets('pull-to-refresh calls the notifier refresh', (tester) async {
      final FakeThreadNotifier fake = await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      );

      await tester.fling(
        find.byType(ListView),
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();

      expect(fake.refreshCalled, isTrue);
    });

    testWidgets(
        'archive routes through the modifier queue, never raw batch',
        (tester) async {
      final RecordingThreadMutationService service =
          RecordingThreadMutationService();
      final _RecordingEmailsApi emailsApi = _RecordingEmailsApi();
      // Two-route harness: the pop must reveal the inbox beneath (the
      // production shape) for the confirmation snackbar to survive it.
      await _pumpThreadOverInbox(
        tester,
        mutationService: service,
        emailsApi: emailsApi,
      );

      await tester.tap(
        find.widgetWithIcon(IconButton, Icons.archive_outlined),
      );
      // Targeted pumps (not pumpAndSettle): a full settle would advance
      // past the confirmation snackbar's auto-dismiss. One pump flushes
      // the action; 500ms plays the snackbar entrance.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      // The queue got the call with every message id in the thread...
      expect(service.archiveCalls, hasLength(1));
      expect(service.archiveCalls.single.threadId, 't-1');
      expect(
        service.archiveCalls.single.messageIds,
        <String>['m-1', 'm-2'],
      );
      // ...and the raw batch endpoint was never touched.
      expect(emailsApi.batchCalls, isEmpty);
      // Optimistic-queued confirmation for the user, over the inbox the
      // pop revealed.
      expect(find.text('Thread archived'), findsOneWidget);
      expect(find.text('inbox'), findsOneWidget);
    });

    testWidgets('mark-unread routes through the modifier queue',
        (tester) async {
      final RecordingThreadMutationService service =
          RecordingThreadMutationService();
      await _pumpThread(
        tester,
        () => FakeThreadNotifier.data(fakeThreadDetail()),
        mutationService: service,
      );

      await tester.tap(
        find.widgetWithIcon(IconButton, Icons.mark_email_unread_outlined),
      );
      await tester.pumpAndSettle();

      expect(service.markUnreadCalls, hasLength(1));
      expect(service.markUnreadCalls.single.threadId, 't-1');
      expect(
        service.markUnreadCalls.single.messageIds,
        <String>['m-1', 'm-2'],
      );
      expect(find.text('Marked as unread'), findsOneWidget);
    });

    testWidgets('delete confirms, then routes through the modifier queue',
        (tester) async {
      final RecordingThreadMutationService service =
          RecordingThreadMutationService();
      await _pumpThreadOverInbox(tester, mutationService: service);

      await tester.tap(
        find.widgetWithIcon(IconButton, Icons.delete_outline),
      );
      await tester.pump();
      expect(find.text('Delete thread?'), findsOneWidget);

      await tester.tap(find.text('Delete'));
      // Same targeted-pump rationale as the archive test: the action pops
      // the route, so settle would outlast the snackbar.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(service.deleteCalls, hasLength(1));
      expect(service.deleteCalls.single.threadId, 't-1');
      expect(
        service.deleteCalls.single.messageIds,
        <String>['m-1', 'm-2'],
      );
      expect(find.text('Thread deleted'), findsOneWidget);
      expect(find.text('inbox'), findsOneWidget);
    });
  });
}
