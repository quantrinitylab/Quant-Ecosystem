// ============================================================================
// quant_app - root application widget
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import 'router/app_router.dart';

/// Root widget for the QuantMail Flutter client.
///
/// A [ConsumerWidget] so the [GoRouter] instance comes from
/// [appRouterProvider]: exactly one router per container, rebuilt only if the
/// provider is overridden (tests) — never on widget rebuilds.
///
/// Uses the QuantMail app themes from `quant_foundation` (dark default per
/// the brand tokens SSOT; see `phase0/DESIGN_TOKENS.md` and
/// `QuantTheme.fallback`).
class QuantMailApp extends ConsumerWidget {
  const QuantMailApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'QuantMail',
      routerConfig: ref.watch(appRouterProvider),
      theme: QuantTheme.quantMailLight,
      darkTheme: QuantTheme.quantMailDark,
      themeMode: ThemeMode.dark,
      debugShowCheckedModeBanner: false,
    );
  }
}
