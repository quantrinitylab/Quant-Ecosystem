// ============================================================================
// quant_app - compose UI edge cases (zero-defect QA, 2026-10-03)
//
// UI-level pins for M7 compose critical paths not covered by
// compose_screen_test.dart:
// - empty body + empty subject: the screen allows the send (subjectless /
//   bodiless mail is legal); the request carries '' fields.
// - reply prefill untouched: tapping Send WITHOUT touching the To field
//   still sends to the prefilled recipients — guards the chips field's
//   post-frame onChanged sync (a regression here would show the banner
//   "Add at least one recipient" despite a visible recipient).
//
// All doubles are in-file fakes; nothing touches the network.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quant_app/src/router/app_router.dart';
import 'package:quant_app/src/screens/compose_screen.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_core/quant_core.dart';

import 'helpers/fake_auth_session.dart';
import 'helpers/fake_inbox.dart';
import 'helpers/fake_mutation_service.dart';
import 'helpers/fake_thread.dart';

/// Recording [ComposeService] double: captures send calls.
class _FakeComposeService implements ComposeService {
  /// [ComposeRequest]s passed to [send], in order.
  final List<ComposeRequest> sendCalls = <ComposeRequest>[];

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
  Future<String> undoSend(String emailId) async => 'undo-op';

  @override
  Stream<List<OutboxOp>> failedOps() => const Stream<List<OutboxOp>>.empty();
}

/// Scriptable [SentMessagesNotifier] that never subscribes to the real
/// drainer.
class _FakeSentMessagesNotifier extends SentMessagesNotifier {
  @override
  List<SentMessageInfo> build() => const <SentMessageInfo>[];
}

typedef _RouterBundle = ({
  ProviderContainer container,
  GoRouter router,
});

/// The REAL router (auth gate live) with an authenticated session and
/// deterministic fakes, identical in shape to compose_screen_test's
/// harness so route-push + pop behavior is exercised for real.
Future<_RouterBundle> _pumpRouter(
  WidgetTester tester, {
  required _FakeComposeService service,
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
      sentMessagesProvider.overrideWith(() => _FakeSentMessagesNotifier()),
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

/// Taps the AppBar Send action and flushes the send future. Targeted
/// pumps (not settle): the LinearProgressIndicator is indeterminate, so
/// settle would hang.
Future<void> _tapSend(WidgetTester tester) async {
  await tester.tap(find.widgetWithIcon(IconButton, Icons.send));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  group('compose UI edge cases', () {
    testWidgets('send with empty body and empty subject: allowed, pops',
        (tester) async {
      final _FakeComposeService service = _FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/compose?to=ravi%40example.com');
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);

      // Type NOTHING into subject or body.
      await _tapSend(tester);

      expect(service.sendCalls, hasLength(1));
      final ComposeRequest request = service.sendCalls.single;
      expect(request.subject, '');
      expect(request.bodyText, '');
      expect(
        request.to.map((EmailAddress a) => a.email),
        <String>['ravi@example.com'],
      );
      // Success pops back to the inbox.
      expect(find.byType(ComposeScreen), findsNothing);
      expect(find.byType(InboxScreen), findsOneWidget);
    });

    testWidgets(
        'reply prefill untouched: send without editing To still sends '
        'to the prefilled recipients', (tester) async {
      final _FakeComposeService service = _FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push(
        '/compose?threadId=t-1&inReplyTo=m-9&to=ravi%40example.com'
        '&subject=Re%3A%20Quarterly%20planning',
      );
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);
      // The prefilled recipient is VISIBLE …
      expect(find.text('ravi@example.com'), findsOneWidget);
      // … and we tap Send WITHOUT touching the To field first.
      await _tapSend(tester);

      // … so the send must carry it (no "Add at least one recipient" banner).
      expect(service.sendCalls, hasLength(1),
          reason: 'prefilled recipients must reach the request even when '
              'the chips field was never edited');
      final ComposeRequest request = service.sendCalls.single;
      expect(
        request.to.map((EmailAddress a) => a.email),
        <String>['ravi@example.com'],
      );
      expect(request.threadId, 't-1');
      expect(request.inReplyTo, 'm-9');
      expect(find.text('Add at least one recipient before sending.'),
          findsNothing);
      expect(find.byType(InboxScreen), findsOneWidget);
    });

    testWidgets('Cc/Bcc: toggling reveals the fields; chips ride the '
        'request', (tester) async {
      final _FakeComposeService service = _FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/compose?to=ravi%40example.com');
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);

      // Reveal the Cc field and add a chip.
      await tester.tap(find.widgetWithText(TextButton, 'Cc'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey<String>('Cc-input')),
        'cc@example.com,',
      );
      await tester.pump();
      expect(find.text('cc@example.com'), findsOneWidget);

      // Reveal the Bcc field and add a chip.
      await tester.tap(find.widgetWithText(TextButton, 'Bcc'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey<String>('Bcc-input')),
        'bcc@example.com,',
      );
      await tester.pump();

      await _tapSend(tester);

      expect(service.sendCalls, hasLength(1));
      final ComposeRequest request = service.sendCalls.single;
      expect(
        request.to.map((EmailAddress a) => a.email),
        <String>['ravi@example.com'],
      );
      expect(
        request.cc.map((EmailAddress a) => a.email),
        <String>['cc@example.com'],
      );
      expect(
        request.bcc.map((EmailAddress a) => a.email),
        <String>['bcc@example.com'],
      );
      expect(find.byType(InboxScreen), findsOneWidget);
    });

    testWidgets('service ArgumentError: defensive path shows the red '
        'snackbar and re-enables send', (tester) async {
      final _FakeComposeService service = _FakeComposeService()
        ..sendImpl = (_) => throw ArgumentError('boom');
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/compose?to=ravi%40example.com');
      await tester.pumpAndSettle();

      await _tapSend(tester);

      expect(find.text('Could not send: boom'), findsOneWidget);
      // The screen stays (no pop) and Send is re-enabled.
      expect(find.byType(ComposeScreen), findsOneWidget);
      final IconButton sendButton =
          tester.widget(find.widgetWithIcon(IconButton, Icons.send));
      expect(sendButton.onPressed, isNotNull);
    });

    testWidgets('dirty close: Discard pops, Keep writing stays',
        (tester) async {
      final _FakeComposeService service = _FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/compose');
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);

      // Clean close pops without a dialog.
      await tester.tap(find.byTooltip('Close'));
      await tester.pump();
      expect(find.byType(InboxScreen), findsOneWidget);

      // Dirty close asks; "Keep writing" dismisses the dialog.
      router.push('/compose');
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey<String>('compose-body')),
        'draft text',
      );
      await tester.tap(find.byTooltip('Close'));
      await tester.pump();
      expect(find.text('Discard draft?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Keep writing'));
      await tester.pump();
      expect(find.byType(ComposeScreen), findsOneWidget);

      // "Discard" pops the screen.
      await tester.tap(find.byTooltip('Close'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Discard'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byType(InboxScreen), findsOneWidget);
    });

    testWidgets('dirty via added recipient: close asks to discard',
        (tester) async {
      final _FakeComposeService service = _FakeComposeService();
      final (:router, container: _) = await _pumpRouter(
        tester,
        service: service,
      );

      router.push('/compose?to=ravi%40example.com');
      await tester.pumpAndSettle();
      expect(find.byType(ComposeScreen), findsOneWidget);

      // Add a recipient beyond the prefill → dirty via the To list.
      await tester.enterText(
        find.byKey(const ValueKey<String>('To-input')),
        'new@example.com,',
      );
      await tester.pump();

      await tester.tap(find.byTooltip('Close'));
      await tester.pump();
      expect(find.text('Discard draft?'), findsOneWidget);
    });
  });
}
