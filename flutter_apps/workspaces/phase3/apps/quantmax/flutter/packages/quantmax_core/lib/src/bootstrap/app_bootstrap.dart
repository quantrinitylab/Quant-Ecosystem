// ============================================================================
// quantmax_core - app bootstrap
// ============================================================================
//
// One-shot cold-start initialization. Shift 1 is deliberately thin: logging
// setup plus a secure-storage readability probe.
//
// PERF-2: [AppBootstrap.initialize] is called AFTER runApp (post first
// frame) from `main.dart` — it must NEVER block the first paint. The probe
// carries its own 2 s failure guard; failures are logged, never thrown.
//
// W3 note: token hydration lives in W3's `authStateProvider.build()` — it
// runs inside the ProviderScope, so it cannot be part of this static
// sequence. This probe is the only pre-scope storage touchpoint.

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Minimal debugPrint-based logger used before any logging backend exists.
///
/// Later: route through a real logging package (and a crash reporter) so logs
/// survive release builds, where [debugPrint] is a no-op.
class AppLogger {
  const AppLogger._();

  /// Logs an informational message.
  static void info(String message) => debugPrint('[quantmax] INFO: $message');

  /// Logs a warning.
  static void warning(String message) =>
      debugPrint('[quantmax] WARN: $message');

  /// Logs an error with an optional cause and stack trace.
  static void error(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint(
      '[quantmax] ERROR: $message${error == null ? '' : ' — $error'}',
    );
    if (stackTrace != null) {
      debugPrint(stackTrace.toString());
    }
  }
}

/// One-shot startup initialization for the QuantMax Flutter app.
///
/// Call exactly once, AFTER [runApp], on a post-frame callback:
///
/// ```dart
/// runApp(const ProviderScope(child: QuantMaxApp()));
/// WidgetsBinding.instance.addPostFrameCallback((_) {
///   unawaited(AppBootstrap.initialize());
/// });
/// ```
class AppBootstrap {
  const AppBootstrap._();

  static bool _initialized = false;

  /// Runs the Shift 1 bootstrap sequence.
  ///
  /// Idempotent: second calls are no-ops (the post-frame callback fires
  /// once, but hot-restart edge cases should not double-probe).
  static Future<void> initialize() async {
    if (_initialized) {
      return;
    }
    _initialized = true;

    final stopwatch = Stopwatch()..start();
    AppLogger.info('bootstrap starting');

    await _probeSecureStorage();

    AppLogger.info(
      'bootstrap complete in ${stopwatch.elapsedMilliseconds}ms',
    );
  }

  /// Cheap no-op check that the secure-storage backend is readable.
  ///
  /// Failures are logged, never thrown: a broken keystore must not crash the
  /// app — the auth UI surfaces the problem instead. Uses a throwaway key
  /// so no real credential is ever touched here.
  static Future<void> _probeSecureStorage() async {
    const probeKey = 'quantmax.bootstrap.probe';
    final storage = FlutterSecureStorage();
    try {
      await storage.read(key: probeKey).timeout(const Duration(seconds: 2));
      await storage.delete(key: probeKey).timeout(const Duration(seconds: 2));
    } on Object catch (error, stackTrace) {
      AppLogger.error('secure storage probe failed', error, stackTrace);
    }
  }
}
