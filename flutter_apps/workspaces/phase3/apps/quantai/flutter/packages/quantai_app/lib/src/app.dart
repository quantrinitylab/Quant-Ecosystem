// ============================================================================
// quantai_app - app root widget (Shift 1)
// ============================================================================
//
// [QuantAiApp] wires the router from [appRouterProvider] into
// [MaterialApp.router] and applies the QuantAI theme (dark-first).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router/app_router.dart';
import 'theme/quantai_theme.dart';

/// The QuantAI app root.
///
/// Watches [appRouterProvider] for the go_router instance and applies
/// [QuantAiTheme] (dark-first) to the whole app.
class QuantAiApp extends ConsumerWidget {
  /// Creates the app root.
  const QuantAiApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'QuantAI',
      theme: QuantAiTheme.quantAiLight,
      darkTheme: QuantAiTheme.quantAiDark,
      themeMode: ThemeMode.dark,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
