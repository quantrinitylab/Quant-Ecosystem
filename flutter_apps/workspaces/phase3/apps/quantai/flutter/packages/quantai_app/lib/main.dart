// ============================================================================
// quantai_app - entry point (Shift 1)
// ============================================================================
//
// PERF-2 lesson: do NO blocking init before runApp — no secure-storage
// probe, no config fetch. The app paints first; the auth provider hydrates
// asynchronously behind the login screen's bootstrapping view.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';

/// Application entry point.
///
/// Errors from the framework go through [FlutterError.onError]; everything
/// else is captured by the zone. Nothing blocks before [runApp].
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (FlutterErrorDetails details) {
    // Keep the default console output; the zone below captures the crash.
    FlutterError.presentError(details);
    Zone.current.handleUncaughtError(details.exception, details.stack!);
  };

  runZonedGuarded(
    () => runApp(const ProviderScope(child: QuantAiApp())),
    (Object error, StackTrace stack) {
      // Last-resort crash handler: log and let the zone take it.
      debugPrint('QuantAI uncaught zone error: $error');
      debugPrintStack(stackTrace: stack);
    },
  );
}
