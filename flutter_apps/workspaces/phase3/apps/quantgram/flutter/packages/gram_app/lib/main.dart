// ============================================================================
// gram_app - QuantGram omnipresent Flutter client entry point (Shift 1, W1)
// ============================================================================
//
// Cold-start path is deliberately lean: no heavy initialization happens here.
// The secure-storage probe runs AFTER runApp (PERF-2), never before first frame.
//
// W3 (gram_core) owns the auth-state bootstrap (secure-storage token check)
// behind the /splash route; W4 owns the GoRouter instance wired into GramApp
// via routerProvider (W3-sync done in Shift 1 by coordinator reconcile).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gram_core/gram_core.dart';

import 'src/app.dart';
import 'src/providers/app_providers.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantGram FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      await AppBootstrap.initialize();

      // W3/W4-sync (Shift 1, coordinator reconcile): real GoRouter
      // (src/router/app_router.dart) container se aata hai. Consumer bridge
      // isliye taaki ProviderScope container ka owner rahe aur GramApp ka
      // `required router` constructor contract bana rahe (tests stub de
      // sakte hain). Router container jitna jeeta hai — rebuild par naya
      // instance nahi banta (routerProvider plain Provider hai).
      runApp(
        ProviderScope(
          child: Consumer(
            builder: (BuildContext context, WidgetRef ref, _) =>
                GramApp(router: ref.watch(routerProvider)),
          ),
        ),
      );

      // PERF-2: keystore readability check must never block first frame —
      // run it after runApp with a 400 ms guard inside.
      unawaited(AppBootstrap.probeSecureStorageAfterFirstFrame());
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantGram unhandled zone error: $error\n$stack');
    },
  );
}
