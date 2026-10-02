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
// Run: flutter test --timeout 90s test/visual_qa_shots_test.dart
// Shots land in: ~/workspace/quantmail-omnipresent/visual-qa/shots/<date>/

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

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

/// Date bucket the PNGs go into (update when re-running on another day).
const String _shotDate = '2026-10-03';

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

  // captureImage (flutter_test's OffsetLayer-based capture) works in the
  // fake-async zone; real file I/O must go through runAsync or it hangs.
  final ui.Image image =
      await captureImage(tester.element(find.byKey(boundaryKey)));
  final ByteData? data =
      await image.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) throw StateError('toByteData returned null');
  final Uint8List bytes = Uint8List.fromList(data.buffer.asUint8List());
  expect(bytes, isNotEmpty);

  const String shotDir =
      '/home/hatch/workspace/quantmail-omnipresent/visual-qa/shots/$_shotDate';
  final String path = '$shotDir/$name.png';
  // Sync I/O only: async file writes (even inside runAsync) can deadlock the
  // test's fake-async zone; writeAsBytesSync completes inline.
  Directory(shotDir).createSync(recursive: true);
  File(path).writeAsBytesSync(bytes);

  expect(File(path).existsSync(), isTrue);
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
