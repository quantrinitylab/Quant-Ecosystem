// ============================================================================
// quant_app - compose screen + send-undo host widget tests (Phase 1, M7)
//
// Pins the M7 compose UI slice: recipient chips validation, send through
// the modifier queue, reply prefill, and the SendUndoHost confirmation
// UX. All doubles are in-file fakes — no test ever touches the network.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/router/app_router.dart';
import 'package:quant_app/src/screens/compose_screen.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_app/src/screens/thread_screen.dart';
import 'package:quant_app/src/widgets/send_undo_host.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_auth_session.dart';
import 'helpers/fake_inbox.dart';
import 'helpers/fake_mutation_service.dart';
import 'helpers/fake_thread.dart';

/// Recording [ComposeService] double: captures the send queue calls so
/// tests can assert the UI routes through the modifier queue. `send` is
/// scriptable via [sendImpl] for failure paths.
class FakeComposeService implements ComposeService {
  /// [ComposeRequest]s passed to [send], in order.
  final List<ComposeRequest> sendCalls = <ComposeRequest>[];

  /// Message ids passed to [undoSend], in order.
  final List<String> undoSendCalls = <String>[];

  /// Optional script for [send]; defaults to a synthetic op id.
  Future<String> Function(ComposeRequest request)? sendImpl;

  @override
  Future<String> send(ComposeRequest request) async {
    sendCalls.add(request);
    final Future<String> Function(ComposeRequest)? impl = sendImpl;
    if (impl != null) return impl(request);
    return 'op-${sendCalls.length}';
  }

  @override
  Future<String> undoSend(String emailId) async {
    undoSendCalls.add(emailId);
    return 'undo-op-${undoSendCalls.length}';
  }

  @override
  Stream<List<OutboxOp>> failedOps() => const Stream<List<OutboxOp>>.empty();
}

/// Scriptable [SentMessagesNotifier]: does NOT subscribe to the real
/// drainer (that would drag the SQLite outbox stack into widget tests);
/// tests push [SentMessageInfo]s via [push].
class FakeSentMessagesNotifier extends SentMessagesNotifier {
  FakeSentMessagesNotifier({
    List<SentMessageInfo> initial = const <SentMessageInfo>[],
  }) : _initial = initial;

  final List<SentMessageInfo> _initial;

  @override
  List<SentMessageInfo> build() => List<SentMessageInfo>.of(_initial);

  /// Appends a server-confirmed send, driving [SendUndoHost].
  void push(SentMessageInfo info) {
    state = <SentMessageInfo>[...state, info];
  }
}

/// Pumps [ComposeScreen] standalone (no router): enough for validation /
/// chips / prefill tests. The screen only pops on send/close, which these
/// tests never trigger.
Future<void> _pumpCompose(
  WidgetTester tester, {
  required FakeComposeService service,
  FakeSentMessagesNotifier? sent,
  String? threadId,
  String? inReplyTo,
  List<EmailAddress> initialTo = const <EmailAddress>[],
  String initialSubject = '',
}) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      composeServiceProvider.overrideWithValue(service),
      sentMessagesProvider.overrideWith(
        () => sent ?? FakeSentMessagesNotifier(),
      ),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(
          body: ComposeScreen(
            threadId: threadId,
            inReplyTo: inReplyTo,
            initialTo: initialTo,
            initialSubject: initialSubject,
          ),
        ),
      ),
    ),
  );
  // Frame 1: build. Frame 2: the chips field's post-frame initial sync.
  await tester.pump();
  await tester.pump();
}

/// The To field's inner text input.
Finder _toInput() => find.byKey(const ValueKey<String>('To-input'));

/// The chip's remove affordance for [email]. Widget-tree predicate (not
/// `bySemanticsLabel`): the semantics tree isn't built in widget tests —
/// see the PROGRESS.md note on `ensureSemantics` ordering.
Finder _removeChip(String email) => find.byWidgetPredicate(
      (Widget widget) =>
          widget is Semantics && widget.properties.label == 'Remove $email',
    );

/// Pumps [SendUndoHost] in a bare scaffold; returns the scriptable
/// sent-messages notifier.
Future<FakeSentMessagesNotifier> _pumpHost(
  WidgetTester tester, {
  required FakeComposeService service,
}) async {
  final FakeSentMessagesNotifier sent = FakeSentMessagesNotifier();
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      sentMessagesProvider.overrideWith(() => sent),
      composeServiceProvider.overrideWithValue(service),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        home: Scaffold(body: SendUndoHost()),
      ),
    ),
  );
  await tester.pump();
  return sent;
}

typedef _RouterBundle = ({
  ProviderContainer container,
  GoRouter router,
});

/// Builds the REAL router (auth gate live) with an authenticated
/// session, deterministic inbox/thread fakes, and the compose fakes.
Future<_RouterBundle> _pumpRouter(
  WidgetTester tester, {
  required FakeComposeService service,
}) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      authSessionProvider.overrideWith(
        () => FakeAuthSessionNotifier(const AuthAuthenticated()),
      ),
      inboxProvider.overrideWith(
        () => FakeInboxNotifier.data(const InboxListState()),
      ),
      threadDetailProvider.overrideWith(
        () => FakeThreadNotifier.data(fakeThreadDetail()),
      ),
      threadMutationServiceProvider.overrideWithValue(
        RecordingThreadMutationService(),
      ),
      composeServiceProvider.overrideWithValue(service),
      sentMessagesProvider.overrideWith(
        () => FakeSentMessagesNotifier(),
      ),
    ],
  );
  addTearDown(container.dispose);
  final GoRouter router = container.read(appRouterProvider);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  // Frame 1: /login -> redirect -> /inbox. Frame 2: inbox paints.
  await tester.pump();
  await tester.pump();
  return (container: container, router: router);
}

String _routerLocation(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.toString();

void main() {
  group('RecipientChipsField', () {
    testWidgets('invalid email shows inline error, never creates a chip',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      await _pumpCompose(tester, service: service);

      await tester.enterText(_toInput(), 'not-an-email,');
      await tester.pump();

      expect(
        find.text('“not-an-email” is not a valid email address'),
        findsOneWidget,
      );
      // No chip was created for the invalid token.
      expect(_removeChip('not-an-email'), findsNothing);
      // And the invalid token left the field (the tail is empty).
      expect(tester.widget<TextField>(_toInput()).controller?.text, '');
    });

    testWidgets('comma commits a chip; X removes it', (tester) async {
      final FakeComposeService service = FakeComposeService();
      await _pumpCompose(tester, service: service);

      await tester.enterText(_toInput(), 'a@b.com,');
      await tester.pump();

      expect(find.text('a@b.com'), findsOneWidget);
      expect(find.textContaining('is not a valid email address'),
          findsNothing);

      await tester.tap(_removeChip('a@b.com'));
      await tester.pump();

      expect(find.text('a@b.com'), findsNothing);
    });

    testWidgets('space and Done also commit chips', (tester) async {
      final FakeComposeService service = FakeComposeService();
      await _pumpCompose(tester, service: service);

      await tester.enterText(_toInput(), 'a@b.com ');
      await tester.pump();
      expect(find.text('a@b.com'), findsOneWidget);

      await tester.enterText(_toInput(), 'b@c.com');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();
      expect(find.text('b@c.com'), findsOneWidget);
    });
  });

  group('ComposeScreen validation and send', () {
    testWidgets('send with no recipients: inline banner, service NOT called',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      await _pumpCompose(tester, service: service);

      await tester.enterText(
        find.byKey(const ValueKey<String>('compose-subject')),
        'No recipients',
      );
      await tester.tap(find.widgetWithIcon(IconButton, Icons.send));
      await tester.pump();

      expect(service.sendCalls, isEmpty);
      expect(
        find.text('Add at least one recipient before sending.'),
        findsOneWidget,
      );
    });

    testWidgets('send failure surfaces a red snackbar', (tester) async {
      final FakeComposeService service = FakeComposeService()
        ..sendImpl = (_) async => throw StateError('store exploded');
      await _pumpCompose(tester, service: service);

      await tester.enterText(_toInput(), 'a@b.com,');
      await tester.pump();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.send));
      // Targeted pumps (not settle): flush the send future, then let the
      // snackbar entrance play.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(service.sendCalls, hasLength(1));
      expect(find.textContaining('Could not send'), findsOneWidget);
      // The screen stays (no pop on failure).
      expect(find.byType(ComposeScreen), findsOneWidget);
    });
  });

  group('ComposeScreen reply prefill', () {
    testWidgets('initialTo/initialSubject/threadId reflected; title is Reply',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      await _pumpCompose(
        tester,
        service: service,
        threadId: 't-1',
        inReplyTo: 'm-9',
        initialTo: const <EmailAddress>[
          EmailAddress(email: 'ravi@example.com'),
        ],
        initialSubject: 'Re: Quarterly planning',
      );

      expect(find.widgetWithText(AppBar, 'Reply'), findsOneWidget);
      expect(find.text('ravi@example.com'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(
              find.byKey(const ValueKey<String>('compose-subject')),
            )
            .controller
            ?.text,
        'Re: Quarterly planning',
      );
    });
  });

  group('SendUndoHost', () {
    testWidgets(
        'confirmed send with messageId: snackbar with Undo; tap calls undoSend',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      final FakeSentMessagesNotifier sent =
          await _pumpHost(tester, service: service);

      sent.push(SentMessageInfo(
        idempotencyKey: 'send:k1',
        messageId: 'msg-1',
        sentAt: DateTime.now(),
      ));
      // The ref.listen listener fires async: flush it first so
      // showSnackBar starts, then let the 250ms entrance complete —
      // mid-flight the action sits below the viewport and taps miss.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('Message sent'), findsOneWidget);
      expect(find.widgetWithText(SnackBarAction, 'Undo'), findsOneWidget);

      await tester.tap(find.widgetWithText(SnackBarAction, 'Undo'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(service.undoSendCalls, <String>['msg-1']);
      // 'Send cancelled' queues behind 'Message sent' (4s duration);
      // advance past it.
      await tester.pump(const Duration(seconds: 5));
      expect(find.text('Send cancelled'), findsOneWidget);
    });

    testWidgets('confirmed send without messageId: snackbar WITHOUT Undo',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      final FakeSentMessagesNotifier sent =
          await _pumpHost(tester, service: service);

      // A queued send with no server id yet: honest copy, no Undo promise.
      sent.push(SentMessageInfo(
        idempotencyKey: 'send:k2',
        sentAt: DateTime.now(),
      ));
      await tester.pump();

      expect(find.text('Message sent'), findsOneWidget);
      expect(find.widgetWithText(SnackBarAction, 'Undo'), findsNothing);
    });

    testWidgets('duplicate confirmations surface exactly once',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      final FakeSentMessagesNotifier sent =
          await _pumpHost(tester, service: service);

      final SentMessageInfo info = SentMessageInfo(
        idempotencyKey: 'send:k3',
        messageId: 'msg-3',
        sentAt: DateTime.now(),
      );
      sent.push(info);
      sent.push(info);
      await tester.pump();

      // The already-shown key guard suppresses the second surfacing.
      expect(find.text('Message sent'), findsOneWidget);
    });
  });

  group('compose route + reply navigation (real GoRouter)', () {
    testWidgets('send happy path: service called with reply linkage, pops',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );
      expect(_routerLocation(router), '/inbox');

      router.push(
        '/compose?threadId=t-1&inReplyTo=m-9&to=ravi%40example.com'
        '&subject=Re%3A%20Quarterly%20planning',
      );
      // pumpAndSettle (not bare pumps): the route push transition leaves
      // the incoming page horizontally offset mid-flight, so AppBar
      // buttons miss hit-tests until it completes.
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);
      // Reply prefill came through the query string.
      expect(find.text('ravi@example.com'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey<String>('compose-body')),
        'Looks good to me',
      );
      await tester.tap(find.widgetWithIcon(IconButton, Icons.send));
      // Targeted pumps (not settle): the LinearProgressIndicator is
      // indeterminate, so settle would hang. Flush the send future, then
      // let the 300ms pop transition complete (the route stays in the
      // tree mid-transition).
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 500));

      expect(service.sendCalls, hasLength(1));
      final ComposeRequest request = service.sendCalls.single;
      expect(request.threadId, 't-1');
      expect(request.inReplyTo, 'm-9');
      expect(
        request.to.map((EmailAddress a) => a.email),
        <String>['ravi@example.com'],
      );
      expect(request.subject, 'Re: Quarterly planning');
      expect(request.bodyText, 'Looks good to me');
      // Success pops back to the inbox beneath. (No
      // currentConfiguration assert: it stays stale after router.push —
      // widget presence is the reliable signal.)
      expect(find.byType(ComposeScreen), findsNothing);
      expect(find.byType(InboxScreen), findsOneWidget);
    });

    testWidgets(
        'thread reply button prefills To/subject and lands on /compose',
        (tester) async {
      final FakeComposeService service = FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/thread/t-1');
      // pumpAndSettle: the push transition leaves the page offset
      // mid-flight; AppBar buttons miss hit-tests until it completes.
      await tester.pumpAndSettle();
      expect(find.byType(ThreadScreen), findsOneWidget);

      // fakeThreadDetail is oldest-first: the last message is Ravi's (m-2).
      final IconButton replyButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.reply_outlined),
      );
      expect(replyButton.onPressed, isNotNull);

      await tester.tap(find.widgetWithIcon(IconButton, Icons.reply_outlined));
      await tester.pumpAndSettle();

      expect(find.byType(ComposeScreen), findsOneWidget);
      // The /compose query string parsed by the router (threadId,
      // inReplyTo, to, subject) — read off the built screen, which is
      // what the reply action actually produced. (routerDelegate
      // .currentConfiguration stays stale after push(); widget props
      // are the reliable signal.)
      final ComposeScreen compose =
          tester.widget<ComposeScreen>(find.byType(ComposeScreen));
      expect(compose.threadId, 't-1');
      expect(compose.inReplyTo, 'm-2');
      expect(
        compose.initialTo.map((EmailAddress a) => a.email),
        <String>['ravi@example.com'],
      );
      // No double "Re:" — the fake subject already started with one.
      expect(compose.initialSubject, 'Re: Quarterly planning');
      expect(find.text('ravi@example.com'), findsOneWidget);
    });

    testWidgets('reply button disabled while the thread loads',
        (tester) async {
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          threadDetailProvider.overrideWith(FakeThreadNotifier.loading),
          threadMutationServiceProvider.overrideWithValue(
            RecordingThreadMutationService(),
          ),
          composeServiceProvider.overrideWithValue(FakeComposeService()),
          sentMessagesProvider.overrideWith(
            () => FakeSentMessagesNotifier(),
          ),
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

      final IconButton replyButton = tester.widget<IconButton>(
        find.widgetWithIcon(IconButton, Icons.reply_outlined),
      );
      expect(replyButton.onPressed, isNull);
    });
  });
}
