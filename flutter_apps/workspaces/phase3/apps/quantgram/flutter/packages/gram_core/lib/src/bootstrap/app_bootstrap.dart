// ============================================================================
// gram_core - QuantGram app bootstrap
// ============================================================================
//
// One-shot cold-start initialization. Shift 1 (W1) is deliberately thin:
// config security validation (S4) plus logging setup. Anything that can touch
// the network or disk beyond a bounded probe is forbidden before the first
// frame — QuantGram's feed must hit a 60fps first paint, so cold start is
// budgeted, not just logged.
//
// PERF-2 (SECURITY/PERF review, 2026-10-03): the secure-storage readability
// probe MUST NOT run pre-`runApp` (a broken keystore would stall first frame
// up to the guard). It runs via `unawaited()` after `runApp` returns, with a
// 400 ms failure guard. See [probeSecureStorageAfterFirstFrame].

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';

/// Minimal debugPrint-based logger used before any logging backend exists.
///
/// Later shifts: route through a real logging package (and a crash reporter)
/// so logs survive release builds, where [debugPrint] is a no-op.
class AppLogger {
  const AppLogger._();

  /// Logs an informational message.
  static void info(String message) => debugPrint('[quantgram] INFO: $message');

  /// Logs a warning.
  static void warning(String message) =>
      debugPrint('[quantgram] WARN: $message');

  /// Logs an error with an optional cause and stack trace.
  static void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint(
      '[quantgram] ERROR: $message${error == null ? '' : ' — $error'}',
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }
}

/// One-shot startup initialization for the QuantGram Flutter app.
///
/// Call exactly once from `main()` before `runApp`:
///
/// ```dart
/// Future<void> main() async {
///   WidgetsFlutterBinding.ensureInitialized();
///   await AppBootstrap.initialize();
///   runApp(const ProviderScope(child: GramApp()));
///   unawaited(AppBootstrap.probeSecureStorageAfterFirstFrame());
/// }
/// ```
class AppBootstrap {
  const AppBootstrap._();

  /// Runs the pre-`runApp` bootstrap sequence.
  ///
  /// Budget: <100 ms of the cold-start path. Only work that is cheap, pure
  /// and failure-fast is allowed here:
  /// - [AppConfig.validateBaseUrlScheme] (Security S4, pure string parse);
  /// - logging setup (no-op today).
  ///
  /// Explicitly NOT here (auth hydration lives in the W3 provider graph
  /// inside the ProviderScope; secure-storage probe goes post-runApp per
  /// PERF-2; DB open and push-registration arrive in later phases).
  static Future<void> initialize({AppConfig config = const AppConfig()}) async {
    final stopwatch = Stopwatch()..start();
    AppLogger.info('bootstrap starting');

    config.validateBaseUrlScheme();

    AppLogger.info(
      'bootstrap complete in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  /// Secure-storage readability probe, run AFTER the first frame (PERF-2).
  ///
  /// Call with `unawaited()` right after `runApp` returns. Reads one sentinel
  /// key through the raw [FlutterSecureStorage] backend with a 400 ms
  /// timeout guard — failures are logged, never thrown: a broken keystore
  /// must not crash the app; the login UI (W4 router + W3 auth) surfaces the
  /// problem instead.
  ///
  /// TODO(shift): W3's warmed TokenManager should own this probe (share the
  /// instance with the auth providers) instead of constructing a throwaway
  /// [FlutterSecureStorage] here.
  static Future<void> probeSecureStorageAfterFirstFrame() async {
    final stopwatch = Stopwatch()..start();
    const storage = FlutterSecureStorage();
    try {
      await storage
          .read(key: 'quantgram.probe')
          .timeout(const Duration(milliseconds: 400));
      AppLogger.info(
        'secure storage probe ok in ${stopwatch.elapsedMilliseconds}ms',
      );
    } on TimeoutException {
      AppLogger.warning('secure storage probe timed out (400ms guard)');
    } on Object catch (error, stackTrace) {
      AppLogger.error('secure storage probe failed', error, stackTrace);
    }
  }
}
