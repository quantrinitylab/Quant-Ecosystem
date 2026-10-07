// ============================================================================
// quantcooks_app - QuantCooks Flutter client entry point (Phase 3b, Shift 1)
// ============================================================================
//
// Cold-start path is deliberately lean: no heavy initialization happens here.
// Auth-state bootstrap (secure-storage token check) lives behind the router's
// redirect gate; future shifts will add deep-link / push wiring.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantCooks FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      runApp(const ProviderScope(child: CooksApp()));
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantCooks unhandled zone error: $error\n$stack');
    },
  );
}
