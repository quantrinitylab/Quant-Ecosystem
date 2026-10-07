// ============================================================================
// quant_wave_app - QuantWave omnipresent Flutter client entry point
// (Phase 3, Shift 1 — W1 scaffold)
// ============================================================================
//
// Cold-start path is deliberately lean: no heavy initialization happens here.
// W4 owns the router/login files; this file stays minimal and consistent:
// import app.dart, call runApp.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantWave FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      // TODO(W4): read persisted auth state before runApp and pick the
      // initial location accordingly (authStateProvider + redirect stub).
      runApp(const ProviderScope(child: QuantWaveApp()));
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantWave unhandled zone error: $error\n$stack');
    },
  );
}
