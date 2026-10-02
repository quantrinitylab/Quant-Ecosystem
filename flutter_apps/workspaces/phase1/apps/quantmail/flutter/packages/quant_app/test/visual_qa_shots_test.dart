// ============================================================================
// quant_app - Visual QA screenshot harness (visual-qa program, Phase 1)
// ============================================================================
//
// Renders key screens in their important states and writes PNG screenshots
// to `visual-qa/shots/<date>/` for human visual review.
//
// Hang-safety (per board complaint on the previous harness):
//  - every test carries an explicit 60s timeout
//  - NO pumpAndSettle on screens with infinite animations (spinners)
//  - only fakes: no network, no browser, no timers that outlive the test
//
// Run: flutter test --update-goldens --timeout 90s test/visual_qa_shots_test.dart
// PNGs land in test/shots_tmp/; copy them to
// ~/workspace/quantmail-omnipresent/visual-qa/shots/<date>/ for review.
// Without --update-goldens the run diffs against test/shots_tmp/ baselines.

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/auth/browser_launcher.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';
import 'package:quant_app/src/screens/login_screen.dart';
import 'package:quant_app/src/screens/thread_screen.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Loads the brand font so screenshots render real glyphs (Inter).
Future<void> _loadBrandFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  final loader = FontLoader('Inter');
  for (final name in ['Inter-Regular.ttf', 'Inter-Bold.ttf']) {
    final file = File('test/fonts/$name');
    final bytes = await file.readAsBytes();
    loader.addFont(Future.value(ByteData.view(bytes.buffer)));
  }
  await loader.load();
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/// Auth fake: starts in [initial], never touches the network.
class _ShotAuthNotifier extends AuthSessionNotifier {
  _ShotAuthNotifier([AuthSessionState? initial])
      : _current = initial ?? const AuthInitial();

  final AuthSessionState _current;

  @override
  Future<AuthSessionState> build() async => _current;
}

/// Browser launcher fake that never opens anything.
class _ShotBrowserLauncher extends BrowserAuthLauncher {
  @override
  Future<bool> openAuthorizeUrl(Uri url) async => true;
}

/// Inbox fake: [mode] picks the emitted state.
enum _InboxMode { loading, empty, list, error }

class _ShotInboxNotifier extends InboxListNotifier {
  _ShotInboxNotifier(this.mode) : _gate = Completer<void>();

  final _InboxMode mode;
  final Completer<void> _gate;

  @override
  Future<InboxListState> build() async {
    if (mode == _InboxMode.loading) {
      await _gate.future; // completes in tearDown; spinner visible meanwhile
    }
    return switch (mode) {
      _InboxMode.empty => const InboxListState(),
      _InboxMode.list => InboxListState(threads: _sampleThreads()),
      _InboxMode.error =>
        const InboxListState(errorMessage: 'Network unavailable. Pull to retry.'),
      _InboxMode.loading => const InboxListState(),
    };
  }

  /// Releases the loading gate (call from addTearDown).
  void release() {
    if (!_gate.isCompleted) _gate.complete();
  }
}

List<ThreadSummary> _sampleThreads() {
  final DateTime now = DateTime.now();
  return [
    ThreadSummary(
      id: 't1',
      subject: 'Q4 launch timeline — action needed',
      snippet: 'Shristi, can you review the milestones before Friday?',
      messageCount: 4,
      lastMessageDate: now.subtract(const Duration(minutes: 5)),
      isRead: false,
      participantNames: ['Aarav Mehta'],
    ),
    ThreadSummary(
      id: 't2',
      subject: 'Flight itinerary: DEL → BOM',
      snippet: 'Your e-ticket is ready for download.',
      messageCount: 1,
      lastMessageDate: now.subtract(const Duration(hours: 2)),
      isRead: false,
      participantNames: ['IndiGo'],
    ),
    ThreadSummary(
      id: 't3',
      subject: 'Re: Design system tokens',
      snippet: 'The radius scale is still missing from brand…',
      messageCount: 12,
      lastMessageDate: now.subtract(const Duration(days: 1)),
      isRead: true,
      participantNames: ['Priya Sharma', 'Rahul Verma'],
    ),
    ThreadSummary(
      id: 't4',
      subject: 'Invoice #INV-2041 paid',
      snippet: 'Thank you for your payment of ₹4,999.00',
      lastMessageDate: now.subtract(const Duration(days: 3)),
      isRead: true,
      participantNames: ['Razorpay'],
    ),
    ThreadSummary(
      id: 't5',
      subject: '',
      snippet: 'A thread with no subject line at all.',
      lastMessageDate: now.subtract(const Duration(days: 30)),
      isRead: true,
      participantNames: [],
    ),
    ThreadSummary(
      id: 't6',
      subject: 'बहुत लंबा विषय जो निश्चित रूप से एक पंक्ति में नहीं समाएगा',
      snippet: 'Devanagari script renders through the Inter fallback stack.',
      lastMessageDate: now.subtract(const Duration(days: 400)),
      isRead: true,
      participantNames: ['देव'],
    ),
  ];
}

// ---------------------------------------------------------------------------
// Pump + capture helpers
// ---------------------------------------------------------------------------

/// Pumps [screen] inside the production QuantMail dark theme, wrapped in a
/// RepaintBoundary, then writes a PNG to the shots directory.
Future<void> _capture(
  WidgetTester tester,
  String name, {
  required Widget screen,
  List<Override> overrides = const [],
  // Advance fake-async time before capture so indeterminate animations
  // (spinners) are caught mid-arc instead of at frame 0.
  Duration? settleFor,
}) async {
  final GlobalKey boundaryKey = GlobalKey();
  await tester.pumpWidget(
    RepaintBoundary(
      key: boundaryKey,
      child: ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: QuantTheme.quantMailDark,
          themeMode: ThemeMode.dark,
          debugShowCheckedModeBanner: false,
          home: screen,
        ),
      ),
    ),
  );
  await tester.binding.setSurfaceSize(const Size(390, 844));
  await tester.pump(); // one frame; never pumpAndSettle (spinners)
  if (settleFor != null) await tester.pump(settleFor);

  // Golden-file mechanism: the framework's own render->PNG->file path, which
  // is proven to work in the test's fake-async zone. Run the harness with
  // --update-goldens to (re)write PNGs into test/shots_tmp/, then copy them
  // to visual-qa/shots/<date>/. Without --update-goldens the same run diffs
  // against the baselines (regression check).
  await expectLater(
    find.byKey(boundaryKey),
    matchesGoldenFile('shots_tmp/$name.png'),
  );
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

void main() {
  testWidgets('shots: login states', (WidgetTester tester) async {
    await tester.runAsync(_loadBrandFonts);
    final launcher = _ShotBrowserLauncher();

    await _capture(
      tester,
      'login_initial',
      screen: const LoginScreen(),
      overrides: [
        authSessionProvider.overrideWith(() => _ShotAuthNotifier()),
        browserLauncherProvider.overrideWithValue(launcher),
      ],
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('shots: login loading + error', (WidgetTester tester) async {
    await tester.runAsync(_loadBrandFonts);
    final launcher = _ShotBrowserLauncher();

    await _capture(
      tester,
      'login_loading',
      screen: const LoginScreen(),
      settleFor: const Duration(milliseconds: 600),
      overrides: [
        authSessionProvider
            .overrideWith(() => _ShotAuthNotifier(const AuthLoading())),
        browserLauncherProvider.overrideWithValue(launcher),
      ],
    );

    await _capture(
      tester,
      'login_error',
      screen: const LoginScreen(),
      overrides: [
        authSessionProvider.overrideWith(() =>
            _ShotAuthNotifier(const AuthFailure('Invalid email or password.'))),
        browserLauncherProvider.overrideWithValue(launcher),
      ],
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('shots: login 2FA + consent', (WidgetTester tester) async {
    await tester.runAsync(_loadBrandFonts);
    final launcher = _ShotBrowserLauncher();

    await _capture(
      tester,
      'login_2fa',
      screen: const LoginScreen(),
      overrides: [
        authSessionProvider.overrideWith(
            () => _ShotAuthNotifier(const AuthTwoFactorRequired('challenge'))),
        browserLauncherProvider.overrideWithValue(launcher),
      ],
    );

    await _capture(
      tester,
      'login_consent',
      screen: const LoginScreen(),
      overrides: [
        authSessionProvider.overrideWith(() => _ShotAuthNotifier(
            AuthConsentRequired(Uri.parse('https://accounts.example.com/o/authorize')))),
        browserLauncherProvider.overrideWithValue(launcher),
      ],
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('shots: inbox states', (WidgetTester tester) async {
    await tester.runAsync(_loadBrandFonts);

    final loading = _ShotInboxNotifier(_InboxMode.loading);
    addTearDown(loading.release);
    await _capture(
      tester,
      'inbox_loading',
      screen: const InboxScreen(),
      settleFor: const Duration(milliseconds: 600),
      overrides: [inboxProvider.overrideWith(() => loading)],
    );

    await _capture(
      tester,
      'inbox_empty',
      screen: const InboxScreen(),
      overrides: [
        inboxProvider.overrideWith(() => _ShotInboxNotifier(_InboxMode.empty))
      ],
    );

    await _capture(
      tester,
      'inbox_error',
      screen: const InboxScreen(),
      overrides: [
        inboxProvider.overrideWith(() => _ShotInboxNotifier(_InboxMode.error))
      ],
    );

    await _capture(
      tester,
      'inbox_list',
      screen: const InboxScreen(),
      overrides: [
        inboxProvider.overrideWith(() => _ShotInboxNotifier(_InboxMode.list))
      ],
    );
  }, timeout: const Timeout(Duration(seconds: 60)));

  testWidgets('shots: thread placeholder', (WidgetTester tester) async {
    await tester.runAsync(_loadBrandFonts);

    await _capture(
      tester,
      'thread_placeholder',
      screen: const ThreadScreen(threadId: 'thread_abc123'),
    );
  }, timeout: const Timeout(Duration(seconds: 60)));
}
