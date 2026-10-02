// ============================================================================
// quantube_core - app bootstrap
// ============================================================================
//
// One-shot cold-start initialization. Deliberately thin: [initialize] does
// only fast, synchronous work (logging + config sanity) BEFORE `runApp`, and
// the secure-storage readability probe runs AFTER the first frame via
// `unawaited()` — never pre-first-frame.
//
// PERF-2 lesson (board, perf-budget 2026-10-03 ~01:05 IST): the probe's 2 s
// timeout guard must not sit on the cold-start critical path. A broken
// keystore would otherwise stall the first frame by up to 2 s and breach the
// p99 2.5 s startup budget. Correct wiring from `main()`:
//
// ```dart
// Future<void> main() async {
//   WidgetsFlutterBinding.ensureInitialized();
//   await AppBootstrap.initialize();           // fast, <100 ms
//   runApp(const ProviderScope(child: QuanTubeApp()));
//   // PERF-2: post-first-frame, never awaited — a broken keystore must not
//   // block the first frame.
//   unawaited(AppBootstrap.probeSecureStorage());
// }
// ```
//
// Token hydration for the actual session runs inside the [ProviderScope]
// (`authSessionProvider.build()`) — it cannot live in the static pre-`runApp`
// sequence. The router's redirect holds position while `authSessionProvider`
// is loading (no login-page flash).

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Minimal debugPrint-based logger used before any logging backend exists.
///
/// Route through a real logging package (and a crash reporter) so logs
/// survive release builds, where [debugPrint] is a no-op.
class AppLogger {
  const AppLogger._();

  /// Logs an informational message.
  static void info(String message) => debugPrint('[quantube] INFO: $message');

  /// Logs a warning.
  static void warning(String message) =>
      debugPrint('[quantube] WARN: $message');

  /// Logs an error with an optional cause and stack trace.
  static void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint(
      '[quantube] ERROR: $message${error == null ? '' : ' — $error'}',
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }
}

/// One-shot startup initialization for the QuanTube Flutter app.
///
/// Call [initialize] exactly once from `main()` before `runApp` (fast,
/// synchronous work only — see the PERF-2 note above), then
/// `unawaited(AppBootstrap.probeSecureStorage())` right after `runApp`.
class AppBootstrap {
  const AppBootstrap._();

  /// Runs the pre-`runApp` bootstrap sequence.
  ///
  /// Budget: <100 ms of the cold-start path. Only synchronous, near-free
  /// work here — logging setup and config sanity. No storage I/O, no network:
  /// nothing in this method may await past the first frame.
  static Future<void> initialize() async {
    final stopwatch = Stopwatch()..start();
    AppLogger.info('bootstrap starting');

    // Fast sync work only. Config sanity (https-only assertion, board S4)
    // happens at provider-graph build time, not here — there is no config
    // to validate until the ProviderScope exists.

    AppLogger.info(
      'bootstrap complete in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  /// Cheap no-op check that the secure-storage backend is readable, using a
  /// throwaway [TokenManager] (which defaults to the flutter_secure_storage
  /// backend).
  ///
  /// PERF-2: call with `unawaited()` AFTER `runApp` — never await this
  /// before the first frame. Failures are logged, never thrown: a broken
  /// keystore must not crash cold start — the auth UI surfaces the problem
  /// instead. The 2 s cap is a failure guard, not expected cost.
  ///
  /// Future (PERF-2 P2 notes): tighten the guard 2 s → 400 ms and share the
  /// warmed [TokenManager] that the provider graph hydrates, instead of
  /// this throwaway probe instance.
  static Future<void> probeSecureStorage() async {
    final probe = TokenManager();
    try {
      await probe.hydrate().timeout(const Duration(seconds: 2));
    } on Object catch (error, stackTrace) {
      AppLogger.error('secure storage probe failed', error, stackTrace);
    } finally {
      probe.dispose();
    }
  }

  /// Placeholders for later shifts (documented here, not yet wired):
  /// - drift database open + migration run (offline library/downloads cache);
  /// - playback service init (Phase 3+, the video/audio face of QuanTube);
  /// - push notification token registration (Phase 2d).
  static void phasePlaceholders() {
    // TODO(UNVERIFIED): quantube spec pending (app-foundations) — wire the
    // offline library cache schema + playback service + push registration
    // once the per-app foundation spec lands.
  }
}
