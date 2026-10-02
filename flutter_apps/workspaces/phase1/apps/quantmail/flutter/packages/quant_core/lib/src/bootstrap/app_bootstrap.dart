// ============================================================================
// quant_core - app bootstrap
// ============================================================================
//
// Two-phase cold-start initialization.
//
// PERF-2: the old single pre-`runApp` `initialize()` awaited a secure-storage
// probe behind a 2 s timeout guard. Once wired into `main()`, a broken
// keystore would stall the first frame by 2 s and breach the 2.5 s p99
// cold-start budget. The old "call once before runApp" mandate is gone — the
// only pre-`runApp` work is logging setup, everything else is post-first-frame.
//
// Sequence from `main()`:
//
// ```dart
// Future<void> main() async {
//   WidgetsFlutterBinding.ensureInitialized();
//   await AppBootstrap.preRunApp();          // <100 ms, logging setup only
//   final container = ProviderContainer();
//   runApp(UncontrolledProviderScope(
//     container: container,
//     child: const QuantMailApp(),
//   ));
//   AppBootstrap.warmUp(container);          // fire-and-forget, post-first-frame
// }
// ```
//
// M2 auth note: token hydration also lives in `authSessionProvider.build()`
// (quant_core providers, W2) — it runs inside the [ProviderScope]. The
// warm-up below hydrates the SAME [TokenManager] instance (via
// [tokenManagerProvider]); its `hydrate()` is idempotent, so there is
// no duplicate secure-storage read. Hydration happens after the first frame —
// the router's redirect holds position while `authSessionProvider` is loading
// (no login-page flash), per phase1/M2_AUTH_DESIGN.md §b.
//
// Cold-start budget: the pre-`runApp` phase targets <100 ms (no I/O). The
// post-`runApp` warm-up carries a 400 ms failure guard on the secure-storage
// read — belt-and-braces, since the first frame is already scheduled; the
// p99 cold-start budget is 2.5 s.
//
// Still placeholders (not yet wired, Phase 2):
// - drift database open + migration run (offline cache for the inbox);
// - FCM token registration (Phase 2d).

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/silent_refresh.dart';
import '../providers/core_providers.dart';

/// Minimal debugPrint-based logger used before any logging backend exists.
///
/// M2+: route through a real logging package (and a crash reporter) so logs
/// survive release builds, where [debugPrint] is a no-op.
class AppLogger {
  const AppLogger._();

  /// Logs an informational message.
  static void info(String message) => debugPrint('[quantmail] INFO: $message');

  /// Logs a warning.
  static void warning(String message) =>
      debugPrint('[quantmail] WARN: $message');

  /// Logs an error with an optional cause and stack trace.
  static void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint(
      '[quantmail] ERROR: $message${error == null ? '' : ' — $error'}',
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }
}

/// Two-phase startup initialization for the QuantMail Flutter app.
///
/// Never blocks the first frame: [preRunApp] is the only await before
/// `runApp`, and [warmUp] runs everything else after it.
class AppBootstrap {
  const AppBootstrap._();

  /// Phase 1 — pre-`runApp`: logging setup only. Budget <100 ms; performs no
  /// I/O, so nothing here can stall the first frame.
  static Future<void> preRunApp() async {
    AppLogger.info('bootstrap preRunApp starting');
  }

  /// Phase 2 — post-`runApp`: fire-and-forget warm-up. Returns immediately
  /// (void); the work runs on the event loop after the first frame is
  /// scheduled, so a slow or broken keystore can never stall it. Call once
  /// per [ProviderContainer], right after `runApp`.
  static void warmUp(ProviderContainer container) {
    unawaited(_warmUpImpl(container));
  }

  static Future<void> _warmUpImpl(ProviderContainer container) async {
    final stopwatch = Stopwatch()..start();

    await _hydrateTokens(container);

    // Bind the silent-refresh lifecycle. This is a `Provider<void>` kept for
    // its side effect — previously dead wiring, nobody read it.
    container.read(silentRefreshProvider);

    AppLogger.info(
      'bootstrap warmUp complete in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  /// Hydrates the shared [TokenManager] (from [tokenManagerProvider]) with a
  /// 400 ms failure guard. No throwaway instance: this is the same manager
  /// the app's providers use. Failures are logged, never thrown — a broken
  /// keystore must not crash cold start; the auth UI surfaces the problem
  /// instead.
  static Future<void> _hydrateTokens(ProviderContainer container) async {
    try {
      await container
          .read(tokenManagerProvider)
          .hydrate()
          .timeout(const Duration(milliseconds: 400));
    } on Object catch (error, stackTrace) {
      AppLogger.error(
        'token hydration failed during warm-up',
        error,
        stackTrace,
      );
    }
  }
}
