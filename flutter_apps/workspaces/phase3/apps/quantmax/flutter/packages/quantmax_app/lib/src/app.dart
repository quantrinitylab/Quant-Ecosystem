// ============================================================================
// quantmax_app - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

import 'router/app_router.dart';

/// Root widget for the QuantMax Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// Theme comes from `quantmax_core`'s barrel (W2's design system:
/// [QuantMaxTheme.quantmaxThemeLight] / [QuantMaxTheme.quantmaxThemeDark]).
/// Dark-first: QuantMax is a video app, and dark is the native habitat of
/// short-form video.
class QuantMaxApp extends ConsumerWidget {
  const QuantMaxApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantMax',
      routerConfig: ref.watch(appRouterProvider),
      theme: QuantMaxTheme.quantmaxThemeLight,
      darkTheme: QuantMaxTheme.quantmaxThemeDark,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
