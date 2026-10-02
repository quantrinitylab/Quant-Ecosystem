// ============================================================================
// quant_wave_core - app bootstrap
// ============================================================================
//
// One-shot cold-start initialization. Deliberately thin: logging setup plus
// a secure-storage readability probe. PKCE auth init lives in
// `authSessionProvider.build()` (providers in this package) — hydration runs
// inside the ProviderScope, so it cannot live in this static pre-`runApp`
// sequence. The local database open and push-token registration (later
// phases) remain placeholders in [AppBootstrap.initialize].

import 'package:flutter/foundation.dart';

import 'package:quant_wave_core/src/auth/token_manager.dart';

/// Minimal debugPrint-based logger used before any logging backend exists.
///
/// Later: route through a real logging package (and a crash reporter) so
/// logs survive release builds, where [debugPrint] is a no-op.
class AppLogger {
  const AppLogger._();

  /// Logs an informational message.
  static void info(String message) => debugPrint('[quantwave] INFO: $message');

  /// Logs a warning.
  static void warning(String message) =>
      debugPrint('[quantwave] WARN: $message');

  /// Logs an error with an optional cause and stack trace.
  static void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint(
      '[quantwave] ERROR: $message${error == null ? '' : ' — $error'}',
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }
}

/// One-shot startup initialization for the QuantWave Flutter app.
///
/// Call exactly once from `main()` before `runApp`:
///
/// ```dart
/// Future<void> main() async {
///   WidgetsFlutterBinding.ensureInitialized();
///   await AppBootstrap.initialize();
///   runApp(const ProviderScope(child: QuantWaveApp()));
/// }
/// ```
class AppBootstrap {
  const AppBootstrap._();

  /// Runs the bootstrap sequence.
  ///
  /// Budget: <100 ms of the cold-start path (the secure-storage probe is
  /// typically a few ms; the 2 s cap in [_probeSecureStorage] is a failure
  /// guard, not expected cost).
  ///
  /// Auth note: token hydration lives in `authSessionProvider.build()` — it
  /// runs inside the [ProviderScope], so it cannot be part of this static
  /// pre-`runApp` sequence. The secure-storage readability probe below stays
  /// here unchanged: it is the only pre-scope auth touchpoint and keeps its
  /// <2 s failure guard.
  ///
  /// Cold-start budget: the static sequence still targets <100 ms (the probe
  /// is a few ms). Hydration happens after the first frame — the router's
  /// redirect holds position while `authSessionProvider` is loading (no
  /// login-page flash).
  ///
  /// Still to add (documented here, not yet wired):
  /// - local database open + migration run (offline cache for the timeline);
  /// - push token registration (later phase).
  static Future<void> initialize() async {
    final stopwatch = Stopwatch()..start();
    AppLogger.info('bootstrap starting');

    await _probeSecureStorage();

    AppLogger.info(
      'bootstrap complete in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  /// Cheap no-op check that the secure-storage backend is readable, using a
  /// throwaway [TokenManager] (which defaults to the flutter_secure_storage
  /// backend). Failures are logged, never thrown: a broken keystore must not
  /// crash cold start — the auth UI surfaces the problem instead.
  static Future<void> _probeSecureStorage() async {
    final probe = TokenManager();
    try {
      await probe.hydrate().timeout(const Duration(seconds: 2));
    } on Object catch (error, stackTrace) {
      AppLogger.error('secure storage probe failed', error, stackTrace);
    } finally {
      probe.dispose();
    }
  }
}
