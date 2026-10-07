// ============================================================================
// ads_app - QuantAds omnipresent Flutter client entry point (Shift 1)
// ============================================================================
//
// Cold-start path is deliberately lean: no heavy initialization happens here.
// Auth-state bootstrap (secure-storage token check) lives in the ads_core
// [authSessionProvider], whose AsyncNotifier hydration drives the router's
// auth gate (see `src/router/app_router.dart`).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';

Future<void> main() async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      FlutterError.onError = (FlutterErrorDetails details) {
        debugPrint('QuantAds FlutterError: ${details.exception}');
        FlutterError.presentError(details);
      };

      // All runtime config arrives via --dart-define (see AdsConfig in
      // package:ads_core/ads_core.dart); override per flavor / test with
      // `adsConfigProvider.overrideWithValue(const AdsConfig(...))`.
      runApp(const ProviderScope(child: AdsApp()));
    },
    (Object error, StackTrace stack) {
      debugPrint('QuantAds unhandled zone error: $error\n$stack');
    },
  );
}
