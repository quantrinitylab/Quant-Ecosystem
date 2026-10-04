// ============================================================================
// quant_app - VQA P2 polish regression tests (forge W2, 2026-10-03)
// ============================================================================
//
// Pins the visual-polish batch so it can't regress silently:
// - VQA-P2-01: hairline dividers between inbox rows
// - VQA-P2-02: avatar hue varies per thread id (and is deterministic)
// - Task 1: failed-ops banner labels send/undoSend ops ('Send'/'Undo send')
// - Content-forge copy: login footer, TOTP CTA, validation strings, thread
//   empty state, banner 'Details'
// - quantMail theme (dark + light): single orange accent (P2-11),
//   errorContainer (P2-03), Indic fallback (P2-04), disabled-button dim
//   (P2-05), 48dp secondary targets (P2-06)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_app/src/screens/login_screen.dart';
import 'package:quant_app/src/screens/thread_screen.dart';
import 'package:quant_app/src/widgets/failed_ops_banner.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'helpers/fake_inbox.dart';
import 'helpers/fake_mutation_service.dart';
import 'helpers/fake_thread.dart';

/// Fixed "now" for relative-time determinism in the banner sheet.
final DateTime _now = DateTime.utc(2026, 10, 3, 12, 0);

// -- Minimal fakes (local; other test files define their own) ----------------

class _FakeAuthSessionNotifier extends AuthSessionNotifier {
  _FakeAuthSessionNotifier([AuthSessionState? initial])
      : _current = initial ?? const AuthInitial();

  final AuthSessionState _current;

  @override
  Future<AuthSessionState> build() async => _current;

  @override
  Future<void> login({required String email, required String password}) async {}

  @override
  Future<void> submitTotp(String code) async {}

  @override
  Future<void> logout() async {}
}

Future<void> _pumpLogin(WidgetTester tester,
    {AuthSessionState? initial}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        authSessionProvider.overrideWith(
          () => _FakeAuthSessionNotifier(initial),
        ),
      ],
      child: const MaterialApp(home: LoginScreen()),
    ),
  );
  await tester.pump();
}

Future<ProviderContainer> _pumpInbox(
    WidgetTester tester, List<ThreadSummary> threads) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      inboxProvider.overrideWith(
        () => FakeInboxNotifier.data(InboxListState(threads: threads)),
      ),
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
  await tester.pump();
  await tester.pump();
  return container;
}

Future<void> _pumpThreadEmpty(WidgetTester tester) async {
  final ProviderContainer container = ProviderContainer(
    overrides: <Override>[
      threadDetailProvider.overrideWith(
        () => FakeThreadNotifier.data(fakeThreadDetail(messages: <Email>[])),
      ),
      threadMutationServiceProvider.overrideWithValue(
        RecordingThreadMutationService(),
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
}

OutboxOp _op(String opId, OutboxAction action) {
  return OutboxOp(
    opId: opId,
    idempotencyKey: 't-1:${action.name}',
    action: action,
    emailIds: const <String>['m-1'],
    createdAt: _now.subtract(const Duration(minutes: 5)),
  );
}

Future<void> _pumpBanner(WidgetTester tester, List<OutboxOp> ops) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        clockProvider.overrideWithValue(FakeQuantClock(_now)),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: FailedOpsBanner(
            ops: ops,
            onRetry: (_) {},
            onDiscard: (_) {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

List<ThreadSummary> _threads(int n) {
  return List<ThreadSummary>.generate(
    n,
    (int i) => ThreadSummary(
      id: 'thread-$i',
      subject: 'Subject $i',
      snippet: 'Snippet $i',
      isRead: i.isOdd,
      participantNames: <String>['Sender $i'],
    ),
  );
}

Set<Color?> _avatarColors(WidgetTester tester) {
  return tester
      .widgetList<CircleAvatar>(find.byType(CircleAvatar))
      .map((CircleAvatar a) => a.backgroundColor)
      .toSet();
}

void main() {
  group('P2-01 inbox dividers', () {
    testWidgets('renders a hairline divider per row', (tester) async {
      await _pumpInbox(tester, _threads(3));

      // One divider under every row (inside the fixed-extent items) —
      // scoped to the list so the AppBar hairline doesn't count.
      final Finder rowDividers = find.descendant(
        of: find.byType(ListView),
        matching: find.byType(Divider),
      );
      expect(rowDividers, findsNWidgets(3));
      final Divider divider = tester.widget<Divider>(rowDividers.first);
      expect(divider.height, 1);
    });
  });

  group('P2-02 avatar hue variation', () {
    testWidgets('avatars vary across thread ids', (tester) async {
      await _pumpInbox(tester, _threads(6));

      final Set<Color?> colors = _avatarColors(tester);
      expect(colors.length, greaterThan(1),
          reason: 'expected hue variation, got $colors');
    });

    testWidgets('avatar color is deterministic for the same thread id',
        (tester) async {
      await _pumpInbox(tester, _threads(4));
      final Color? first = _avatarColors(tester).first;

      // Re-pump with the same data: the same thread must get the same hue
      // (FNV-1a, not String.hashCode — stable across runs for goldens).
      await _pumpInbox(tester, _threads(4));
      final Color? second = _avatarColors(tester).first;
      expect(second, first);
    });
  });

  group('failed-ops banner action labels (task 1)', () {
    testWidgets("labels send and undoSend ops ('Send'/'Undo send')",
        (tester) async {
      await _pumpBanner(tester, <OutboxOp>[
        _op('op-send', OutboxAction.send),
        _op('op-undo', OutboxAction.undoSend),
      ]);

      await tester.tap(find.text('Details'));
      await tester.pumpAndSettle();

      expect(find.text('Send'), findsOneWidget);
      expect(find.text('Undo send'), findsOneWidget);
    });
  });

  group('content-forge copy', () {
    testWidgets("login footer uses 'Secured with your Quant ID'",
        (tester) async {
      await _pumpLogin(tester);

      expect(find.text('Secured with your Quant ID'), findsOneWidget);
      expect(find.text('Secured with OAuth2 + PKCE'), findsNothing);
    });

    testWidgets("TOTP view CTA reads 'Verify code'", (tester) async {
      await _pumpLogin(
        tester,
        initial: const AuthTwoFactorRequired('challenge'),
      );

      expect(
        find.widgetWithText(ElevatedButton, 'Verify code'),
        findsOneWidget,
      );
    });

    testWidgets('empty-field validation is Hinglish', (tester) async {
      await _pumpLogin(tester);

      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pump();

      expect(find.text('Email dalna zaroori hai'), findsOneWidget);
      expect(find.text('Password dalna zaroori hai'), findsOneWidget);
    });

    testWidgets('thread empty state is delightful Hinglish', (tester) async {
      await _pumpThreadEmpty(tester);

      expect(find.text('Koi message nahi'), findsOneWidget);
      expect(
        find.text('Messages abhi nahi mile — neeche kheenchke refresh karo.'),
        findsOneWidget,
      );
      expect(find.text('No messages'), findsNothing);
    });

    testWidgets("inbox empty state hints what's next", (tester) async {
      await _pumpInbox(tester, const <ThreadSummary>[]);

      expect(find.text("Sab padh liya! 🎉"), findsOneWidget);
      expect(find.text('Naya mail aate hi yahan dikhega.'), findsOneWidget);
    });
  });

  group('P2-06 secondary touch targets', () {
    testWidgets('login Back button is at least 48dp tall', (tester) async {
      await _pumpLogin(
        tester,
        initial: const AuthTwoFactorRequired('challenge'),
      );

      final TextButton back =
          tester.widget<TextButton>(find.widgetWithText(TextButton, 'Back'));
      final Size min =
          back.style?.minimumSize?.resolve(<WidgetState>{}) ?? Size.zero;
      expect(min.height, greaterThanOrEqualTo(48));
      expect(min.width, greaterThanOrEqualTo(64));
    });

    testWidgets('inbox error Retry is at least 48dp', (tester) async {
      final ProviderContainer container = ProviderContainer(
        overrides: <Override>[
          inboxProvider.overrideWith(
            () => FakeInboxNotifier.data(
              const InboxListState(errorMessage: 'boom'),
            ),
          ),
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
      await tester.pump();
      await tester.pump();

      final FilledButton retry = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Retry'),
      );
      final Size min =
          retry.style?.minimumSize?.resolve(<WidgetState>{}) ?? Size.zero;
      expect(min.height, greaterThanOrEqualTo(48));
      expect(min.width, greaterThanOrEqualTo(64));
    });
  });

  group('quantMail theme polish', () {
    test('P2-11: TextButton speaks the orange primary CTA language', () {
      for (final ThemeData theme in <ThemeData>[
        QuantTheme.quantMailDark,
        QuantTheme.quantMailLight,
      ]) {
        final Color? fg = theme.textButtonTheme.style?.foregroundColor
            ?.resolve(<WidgetState>{});
        expect(fg, theme.colorScheme.primary);
      }
    });

    test('P2-03: errorContainer is a deep desaturated red (dark)', () {
      final ColorScheme dark = QuantTheme.quantMailDark.colorScheme;
      expect(dark.errorContainer, const Color(0xFF3A1214));
      expect(dark.onErrorContainer, QuantColors.error300);
      final ColorScheme light = QuantTheme.quantMailLight.colorScheme;
      expect(light.errorContainer, QuantColors.error100);
      expect(light.onErrorContainer, QuantColors.error900);
    });

    test('P2-04: Indic font fallback is wired', () {
      for (final ThemeData theme in <ThemeData>[
        QuantTheme.quantMailDark,
        QuantTheme.quantMailLight,
      ]) {
        expect(
          theme.textTheme.bodyMedium?.fontFamilyFallback,
          contains('Noto Sans Devanagari'),
        );
      }
    });

    test('P2-05: disabled ElevatedButton dims (M3 onSurface 12%/38%)', () {
      for (final ThemeData theme in <ThemeData>[
        QuantTheme.quantMailDark,
        QuantTheme.quantMailLight,
      ]) {
        final ColorScheme scheme = theme.colorScheme;
        final ButtonStyle? style = theme.elevatedButtonTheme.style;
        expect(
          style?.backgroundColor?.resolve(<WidgetState>{WidgetState.disabled}),
          scheme.onSurface.withValues(alpha: 0.12),
        );
        expect(
          style?.foregroundColor?.resolve(<WidgetState>{WidgetState.disabled}),
          scheme.onSurface.withValues(alpha: 0.38),
        );
        // Enabled stays full primary CTA.
        expect(
          style?.backgroundColor?.resolve(<WidgetState>{}),
          scheme.primary,
        );
      }
    });
  });
}
