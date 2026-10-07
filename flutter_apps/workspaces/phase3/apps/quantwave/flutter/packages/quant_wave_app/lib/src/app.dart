// ============================================================================
// quant_wave_app - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_wave_core/quant_wave_core.dart';

import 'router/app_router.dart';

/// Root widget for the QuantWave Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// Uses the QuantWave app themes from `quant_wave_core` (dark default per
/// the @quant/brand token adaptation; see [WaveTheme.fallback]).
///
/// Router contract (agreed with W4): `src/router/app_router.dart` must export
/// `appRouterProvider` — the same provider name as the quantmail reference
/// app — returning a `GoRouter` driven by the app's auth state.
class QuantWaveApp extends ConsumerWidget {
  const QuantWaveApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantWave',
      routerConfig: ref.watch(appRouterProvider),
      theme: WaveTheme.waveLight,
      darkTheme: WaveTheme.waveDark,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
