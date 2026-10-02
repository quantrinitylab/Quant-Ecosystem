// ============================================================================
// quantube_app - root application widget
// ============================================================================
//
// Root widget for the QuanTube Flutter client (video/audio face of the
// 9-app ecosystem). Copy-adapt of phase1 `quant_app`'s `app.dart`:
//
// - [GoRouter] comes from [appRouterProvider] (src/router/app_router.dart),
//   exactly one router per Riverpod container.
// - Theme: QuanTube dark theme exported by `quantube_core`
//   ([QuantTubeTheme]) — dark-first, red accent `#F43F5E`
//   (`QuantAppColors.quantube`, phase0 brand tokens).
//
// Contract (verified against the theme worker's
// `packages/quantube_core/lib/src/theme/quantube_theme.dart`): static
// getters [QuantTubeTheme.darkTheme] (default) and [QuantTubeTheme.lightTheme].
// TODO(UNVERIFIED): package compile state not checked here (Flutter SDK
// absent in this env); theme worker owns correctness of the build.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantube_core/quantube_core.dart';

import 'router/app_router.dart';

/// Root widget for the QuanTube Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// QuanTube is dark-first per the app identity (playback/offline focus);
/// [QuantTubeTheme.dark] is the default theme.
class QuantubeApp extends ConsumerWidget {
  const QuantubeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuanTube',
      routerConfig: ref.watch(appRouterProvider),
      theme: QuanTubeTheme.lightTheme,
      darkTheme: QuanTubeTheme.darkTheme,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
