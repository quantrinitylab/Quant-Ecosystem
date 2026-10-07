// ============================================================================
// quantcooks_app - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantcooks_core/quantcooks_core.dart';

import 'router/app_router.dart';

/// Root widget for the QuantCooks Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// Themes come from `quantcooks_core` ([CooksTheme], owned by W2) — dark is
/// the default identity for the creator/editor surface.
class CooksApp extends ConsumerWidget {
  const CooksApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantCooks',
      routerConfig: ref.watch(appRouterProvider),
      theme: CooksTheme.light,
      darkTheme: CooksTheme.dark,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
