// ============================================================================
// quant_app - QuantMail omnipresent Flutter client entry point (Phase 1, M2)
// ============================================================================
//
// Cold-start path is deliberately lean (PERF-2):
// - pre-`runApp`: `AppBootstrap.preRunApp()` — logging setup only, <100 ms.
// - post-`runApp`: `AppBootstrap.warmUp(container)` — fire-and-forget;
//   token hydration + silent-refresh binding run after the first frame is
//   scheduled and can never stall it (p99 cold-start budget: 2.5 s).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_core/quant_core.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantMail FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      // Phase 1 (<100 ms): logging setup only.
      await AppBootstrap.preRunApp();

      final container = ProviderContainer();
      runApp(UncontrolledProviderScope(
        container: container,
        child: const QuantMailApp(),
      ));

      // Phase 2 (fire-and-forget): runs after the first frame; never
      // blocks it.
      AppBootstrap.warmUp(container);
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantMail unhandled zone error: $error\n$stack');
    },
  );
}
