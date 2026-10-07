// ============================================================================
// ads_app - root application widget
// ============================================================================

import 'package:ads_theme/ads_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';

/// Root widget for the QuantAds Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// Themes come from `ads_theme` (W3's package, built on the phase0 design
/// AdsApp root widget (theme from ads_theme package — `AdsTheme.adsLight` /
/// `AdsTheme.adsDark`; mode follows the OS setting).
class AdsApp extends ConsumerWidget {
  /// Creates the root QuantAds application widget.
  const AdsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantAds',
      routerConfig: ref.watch(appRouterProvider),
      theme: AdsTheme.adsLight,
      darkTheme: AdsTheme.adsDark,
      themeMode: ThemeMode.system,
      debugShowCheckedModeBanner: false,
    );
  }
}
