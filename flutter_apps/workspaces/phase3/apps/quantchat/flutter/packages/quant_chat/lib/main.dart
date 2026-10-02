// ============================================================================
// quant_chat - QuantChat omnipresent Flutter client entry point (shift 1)
// ============================================================================
//
// Cold-start path is deliberately lean: no heavy initialization happens here.
// Auth bootstrap (persisted auth-state check via TokenManager from
// quant_foundation, driving the initial route) will be wired in a later
// shift when W4's router lands with its redirect/refresh logic.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantChat FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      // TODO(auth bootstrap): read persisted auth state (TokenManager from
      // quant_foundation) before runApp and let the router pick the initial
      // location (login vs chat list) accordingly.
      runApp(const ProviderScope(child: QuantChatApp()));
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantChat unhandled zone error: $error\n$stack');
    },
  );
}
