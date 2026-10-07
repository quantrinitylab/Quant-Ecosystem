// ============================================================================
// quantmax_app - QuantMax omnipresent Flutter client entry point (Shift 1)
// ============================================================================
//
// Cold-start path is deliberately lean: NOTHING blocks the first frame
// (PERF-2). The secure-storage probe runs AFTER runApp, on a post-frame
// callback, so a slow keystore can never delay the first paint.
//
// Auth-state hydration lives in W3's `authStateProvider` (quantmax_core) —
// it runs inside the ProviderScope and cannot be part of a pre-runApp
// sequence. The router's redirect holds position while the stream is loading,
// so there is no login-page flash on cold start.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantMax FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      // First frame goes out immediately — no awaits before this line.
      runApp(const ProviderScope(child: QuantMaxApp()));

      // Post first frame: cold-start housekeeping that must never block
      // paint. Fire-and-forget; AppBootstrap logs failures itself.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(AppBootstrap.initialize());
      });
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantMax unhandled zone error: $error\n$stack');
    },
  );
}
